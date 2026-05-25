"""Chat routes with E2EE envelope support.

When E2EE_REQUIRED is enabled, plaintext send/edit flows are rejected and
clients must submit encrypted envelopes only.
"""

import os

from fastapi import APIRouter, HTTPException
from app.db import q
from app.errors import must, must_thread_type

router = APIRouter(prefix='/api/chat', tags=['chat'])
ALLOWED_SIGNAL_TYPES={'offer','answer','candidate','ice','hangup'}
E2EE_REQUIRED = os.getenv('E2EE_REQUIRED', 'false').lower() == 'true'


def _assert_e2ee_payload(payload: dict) -> None:
    """Validate minimal encrypted envelope fields required by backend contract."""
    required = ['ciphertext_b64', 'nonce_b64', 'aad_b64', 'sender_device_id', 'recipient_device_id', 'session_id']
    missing = [k for k in required if not payload.get(k)]
    if missing:
        raise HTTPException(status_code=400, detail=f'Missing encrypted envelope fields: {", ".join(missing)}')


def _normalize_signal_row(row: dict) -> dict:
    signal = dict(row or {})
    data = signal.pop('data', None)
    if isinstance(data, dict):
        for key, value in data.items():
            if key not in signal:
                signal[key] = value
    signal['createdAt'] = signal.pop('created_at', None)
    signal['from'] = signal.pop('sender', signal.get('from'))
    signal['to'] = signal.pop('receiver', signal.get('to'))
    return signal


def _normalize_message_row(row: dict) -> dict:
    """Normalize DB row shape to frontend message contract fields."""
    msg = dict(row or {})
    body = msg.pop('body', None)
    if isinstance(body, dict):
        for key, value in body.items():
            if key not in msg:
                msg[key] = value
    msg['createdAt'] = msg.pop('created_at', None)
    msg['editedAt'] = msg.pop('edited_at', None)
    msg['deletedAt'] = msg.pop('deleted_at', None)
    msg['senderId'] = msg.pop('sender_id', None)
    msg['receiverId'] = msg.pop('receiver_id', None)
    msg['senderName'] = msg.pop('sender_name', None)
    msg['threadType'] = msg.pop('thread_type', None)
    msg['threadId'] = msg.pop('thread_id', None)
    msg['deliveredTo'] = msg.pop('delivered_to', []) or []
    msg['readBy'] = msg.pop('read_by', []) or []
    msg['deletedFor'] = msg.pop('deleted_for', []) or []
    msg['deletedForEveryone'] = bool(msg.pop('deleted_for_everyone', False))
    return msg

@router.post('/messages/send')
def send(body: dict):
    # Store encrypted payload as-is; backend does not decrypt content.
    tt=body.get('threadType'); must_thread_type(tt); must(body.get('actorUid'),'actorUid'); must(body.get('threadId'),'threadId')
    payload=body.get('payload') or {}

    has_envelope = all(payload.get(k) for k in ['ciphertext_b64', 'nonce_b64', 'aad_b64'])
    if E2EE_REQUIRED and not has_envelope:
        raise HTTPException(status_code=400, detail='E2EE_REQUIRED is enabled. Send encrypted envelope payload only.')

    if has_envelope:
        _assert_e2ee_payload(payload)
        payload['e2ee'] = {
            'protocol_version': payload.get('protocol_version', '1.0'),
            'kex_algorithm': payload.get('kex_algorithm', 'x25519'),
            'kdf_algorithm': payload.get('kdf_algorithm', 'hkdf-sha256'),
            'cipher': payload.get('cipher', 'aes-256-gcm'),
            'sender_device_id': payload.get('sender_device_id'),
            'recipient_device_id': payload.get('recipient_device_id'),
            'session_id': payload.get('session_id'),
        }
        safe_last_message = '[E2EE message]'
        safe_last_type = 'e2ee'
    else:
        safe_last_message = payload.get('text', '')
        safe_last_type = payload.get('type')

    q('INSERT INTO messages(thread_type,thread_id,sender_id,receiver_id,sender_name,body,delivered_to,read_by) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',
      (tt,body['threadId'],body['actorUid'],body.get('targetUid'),body.get('actorName'),payload,[body['actorUid']],[body['actorUid']]))
    if tt=='direct':
      q('INSERT INTO conversations(id,participants,participant_phones,last_message,last_message_type,last_message_sender,last_message_status,last_message_at,updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,now(),now()) ON CONFLICT(id) DO UPDATE SET last_message=EXCLUDED.last_message,last_message_type=EXCLUDED.last_message_type,last_message_sender=EXCLUDED.last_message_sender,last_message_status=EXCLUDED.last_message_status,last_message_at=now(),updated_at=now()',
        (body['threadId'], [body['actorUid'],body.get('targetUid')], [body.get('actorPhone',''),body.get('targetPhone','')], safe_last_message, safe_last_type, body['actorUid'], 'sent'))
    return {'ok':True, 'encrypted': has_envelope}

@router.patch('/messages/edit')
def edit(body: dict):
    if E2EE_REQUIRED:
        raise HTTPException(status_code=400, detail='Edit plaintext endpoint disabled in E2EE_REQUIRED mode.')
    must(body.get('messageId'),'messageId'); must(body.get('text'),'text'); q("UPDATE messages SET body = jsonb_set(body,'{text}',to_jsonb(%s::text)), edited_at=now() WHERE id=%s", (body['text'], body['messageId'])); return {'ok':True}
@router.patch('/messages/delete-for-me')
def delme(body: dict):
    must(body.get('messageId'),'messageId'); must(body.get('actorUid'),'actorUid'); q('UPDATE messages SET deleted_for=array_append(deleted_for,%s) WHERE id=%s AND NOT (%s = ANY(deleted_for))',(body['actorUid'],body['messageId'],body['actorUid'])); return {'ok':True}
@router.patch('/messages/delete-for-everyone')
def delall(body: dict):
    must(body.get('messageId'),'messageId'); q("UPDATE messages SET deleted_for_everyone=true,deleted_at=now(), body = body || '{\"text\":\"🚫 This message was deleted.\"}'::jsonb WHERE id=%s", (body['messageId'],)); return {'ok':True}
@router.patch('/messages/toggle-flag')
def flag(body: dict):
    must(body.get('messageId'),'messageId')
    must(body.get('actorUid'),'actorUid')
    must(body.get('key'),'key')
    key = str(body['key'])
    if key not in {'starredBy', 'bookmarkedBy', 'flaggedBy'}:
        raise HTTPException(status_code=400, detail='Unsupported flag key')
    row = q('SELECT body FROM messages WHERE id=%s', (body['messageId'],), fetch='one')
    if not row:
        raise HTTPException(status_code=404, detail='Message not found')
    msg_body = dict(row['body'] or {})
    users = list(msg_body.get(key) or [])
    actor_uid = body['actorUid']
    if bool(body.get('alreadyFlagged')):
        users = [u for u in users if u != actor_uid]
    elif actor_uid not in users:
        users.append(actor_uid)
    msg_body[key] = users
    q('UPDATE messages SET body=%s WHERE id=%s', (msg_body, body['messageId']))
    return {'ok': True}

@router.get('/messages')
def list_messages(threadType: str, threadId: str, uid: str|None=None):
    """List thread messages and filter user-deleted messages for caller."""
    must_thread_type(threadType); rows=q('SELECT * FROM messages WHERE thread_type=%s AND thread_id=%s ORDER BY created_at LIMIT 300', (threadType,threadId), fetch='all') or []
    if uid: rows=[r for r in rows if uid not in (r['deleted_for'] or [])]
    return {'messages':[_normalize_message_row(r) for r in rows]}

@router.get('/call-logs')
def logs(conversationId: str): return {'logs': q('SELECT id,data,created_at FROM call_logs WHERE conversation_id=%s ORDER BY created_at DESC LIMIT 200',(conversationId,),fetch='all') or []}
@router.get('/signals')
def sig(conversationId: str, to: str):
    rows = q('SELECT id,data,created_at,type,sender,receiver FROM signals WHERE conversation_id=%s AND receiver=%s ORDER BY created_at',(conversationId,to),fetch='all') or []
    return {'signals': [_normalize_signal_row(r) for r in rows]}
@router.delete('/signals/{signal_id}')
def delsig(signal_id: str, conversationId: str): q('DELETE FROM signals WHERE id=%s AND conversation_id=%s',(signal_id,conversationId)); return {'ok':True}
@router.patch('/conversations/seen')
def seen(body: dict):
    must(body.get('conversationId'),'conversationId')
    must(body.get('uid'),'uid')
    conversation_id = body['conversationId']
    uid = body['uid']
    q(
        'UPDATE messages SET delivered_to=array_append(delivered_to,%s), read_by=array_append(read_by,%s) WHERE thread_type=%s AND thread_id=%s AND receiver_id=%s AND NOT (%s = ANY(read_by))',
        (uid, uid, 'direct', conversation_id, uid, uid),
    )
    q("UPDATE conversations SET last_message_status='seen',updated_at=now() WHERE id=%s",(conversation_id,))
    return {'ok':True}
@router.patch('/conversations/meta')
def meta(body: dict): must(body.get('conversationId'),'conversationId'); patch=body.get('patch') or {}; q('UPDATE conversations SET typing=COALESCE(%s,typing), unread_by=COALESCE(%s,unread_by), updated_at=now() WHERE id=%s',(patch.get('typing'),patch.get('unreadBy'),body['conversationId'])); return {'ok':True}
@router.post('/conversations/call-logs')
def addlog(body: dict): must(body.get('conversationId'),'conversationId'); q('INSERT INTO call_logs(conversation_id,data) VALUES (%s,%s)', (body['conversationId'], body.get('callData') or {})); return {'ok':True}
@router.post('/conversations/messages')
def addmsg(body: dict):
    must(body.get('conversationId'),'conversationId')
    payload = body.get('message') or {}
    has_envelope = all(payload.get(k) for k in ['ciphertext_b64', 'nonce_b64', 'aad_b64'])
    if E2EE_REQUIRED and not has_envelope:
        raise HTTPException(status_code=400, detail='E2EE_REQUIRED is enabled. Send encrypted envelope payload only.')
    if has_envelope:
        _assert_e2ee_payload(payload)
    q('INSERT INTO messages(thread_type,thread_id,body) VALUES (%s,%s,%s)', ('direct',body['conversationId'], payload))
    return {'ok':True}
@router.post('/conversations/signals')
def addsig(body: dict):
    must(body.get('conversationId'),'conversationId')
    s=body.get('signal') or {}
    if s.get('type') and s['type'] not in ALLOWED_SIGNAL_TYPES:
        raise HTTPException(status_code=400, detail='Unsupported signal type')
    q('INSERT INTO signals(conversation_id,type,sender,receiver,data) VALUES (%s,%s,%s,%s,%s)',(body['conversationId'], s.get('type'), s.get('from'), s.get('to'), s))
    return {'ok':True}
@router.post('/conversations/clear')
def clear(body: dict): must(body.get('conversationId'),'conversationId'); must(body.get('uid'),'uid'); q('UPDATE messages SET deleted_for=array_append(deleted_for,%s) WHERE thread_type=%s AND thread_id=%s AND NOT (%s = ANY(deleted_for))',(body['uid'],'direct',body['conversationId'],body['uid'])); return {'ok':True}
