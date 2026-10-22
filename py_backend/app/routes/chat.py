"""Chat routes with E2EE envelope support.

Direct sends and edits require authenticated protocol v2 envelopes.
Community threads remain outside the direct-message E2EE demonstration.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import ValidationError
from psycopg2.errors import UniqueViolation
from app.schemas.e2ee import EncryptedEnvelope
from app.security.request_auth import authenticated_user
from app.db import q
from app.errors import must, must_thread_type

router = APIRouter(prefix='/api/chat', tags=['chat'])
ALLOWED_SIGNAL_TYPES={'offer','answer','candidate','ice','hangup'}


def _assert_e2ee_payload(payload: dict) -> None:
    try:
        EncryptedEnvelope.model_validate(payload)
    except (ValidationError, ValueError) as exc:
        raise HTTPException(status_code=400, detail='Invalid protocol v2 encrypted envelope') from exc


def _assert_context(payload: dict, thread_id: str, sender: str, recipient: str):
    _assert_e2ee_payload(payload)
    if (payload['thread_id'], payload['sender_user_id'], payload['recipient_user_id']) != (thread_id, sender, recipient):
        raise HTTPException(status_code=400, detail='Encrypted envelope participants do not match the request')
    if thread_id != '_'.join(sorted([sender, recipient])):
        raise HTTPException(status_code=400, detail='Invalid direct conversation identifier')
    registered = q('SELECT bundle FROM crypto_public_identities WHERE user_id=%s AND suite_id=%s', (sender, payload['suite_id']), fetch='one')
    if not registered or registered['bundle'] != payload['sender_bundle']:
        raise HTTPException(status_code=400, detail='Sender identity must be registered before sending')


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
    # Preserve server-owned routing metadata separately before merging the
    # encrypted envelope. Protocol v2 also has an authenticated ``thread_id``;
    # dropping it makes every client-side context verification fail.
    server_thread_type = msg.pop('thread_type', None)
    server_thread_id = msg.pop('thread_id', None)
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
    msg['threadType'] = server_thread_type
    msg['threadId'] = server_thread_id
    msg['deliveredTo'] = msg.pop('delivered_to', []) or []
    msg['readBy'] = msg.pop('read_by', []) or []
    msg['deletedFor'] = msg.pop('deleted_for', []) or []
    msg['deletedForEveryone'] = bool(msg.pop('deleted_for_everyone', False))
    return msg

@router.post('/messages/send')
def send(body: dict, user_id: str = Depends(authenticated_user)):
    # Store encrypted payload as-is; backend does not decrypt content.
    tt=body.get('threadType'); must_thread_type(tt); must(body.get('actorUid'),'actorUid'); must(body.get('threadId'),'threadId')
    if body['actorUid'] != user_id:
        raise HTTPException(status_code=403, detail='Sender does not match authenticated user')
    payload=body.get('payload') or {}
    has_envelope = all(payload.get(k) for k in ['ciphertext_b64', 'nonce_b64', 'aad_b64'])

    if tt == 'direct':
        target_uid = body.get('targetUid')
        must(target_uid, 'targetUid')
        if body['threadId'] != '_'.join(sorted([user_id, target_uid])):
            raise HTTPException(status_code=400, detail='Invalid direct conversation identifier')
        _assert_context(payload, body['threadId'], user_id, target_uid)

    if has_envelope:
        _assert_e2ee_payload(payload)
        safe_last_message = '[E2EE message]'
        safe_last_type = 'e2ee'
    else:
        safe_last_message = payload.get('text', '')
        safe_last_type = payload.get('type')

    try:
        params = (tt,body['threadId'],body['actorUid'],body.get('targetUid'),body.get('actorName'),payload,[body['actorUid']],[body['actorUid']])
        if has_envelope:
            q('''WITH receipt AS (INSERT INTO crypto_message_receipts(message_id) VALUES (%s) RETURNING message_id)
                 INSERT INTO messages(thread_type,thread_id,sender_id,receiver_id,sender_name,body,delivered_to,read_by)
                 SELECT %s,%s,%s,%s,%s,%s,%s,%s FROM receipt''', (payload['message_id'], *params))
        else:
            q('INSERT INTO messages(thread_type,thread_id,sender_id,receiver_id,sender_name,body,delivered_to,read_by) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)', params)
    except UniqueViolation as exc:
        raise HTTPException(status_code=409, detail='Encrypted message already delivered') from exc
    if tt=='direct':
      q('INSERT INTO conversations(id,participants,participant_phones,last_message,last_message_type,last_message_sender,last_message_status,last_message_at,updated_at) VALUES (%s,%s,%s,%s,%s,%s,%s,now(),now()) ON CONFLICT(id) DO UPDATE SET last_message=EXCLUDED.last_message,last_message_type=EXCLUDED.last_message_type,last_message_sender=EXCLUDED.last_message_sender,last_message_status=EXCLUDED.last_message_status,last_message_at=now(),updated_at=now()',
        (body['threadId'], [body['actorUid'],body.get('targetUid')], [body.get('actorPhone',''),body.get('targetPhone','')], safe_last_message, safe_last_type, body['actorUid'], 'sent'))
      q("UPDATE conversations SET unread_by=jsonb_set(COALESCE(unread_by,'{}'::jsonb),%s,to_jsonb(COALESCE((unread_by->>%s)::int,0)+1),true) WHERE id=%s",
        ([body.get('targetUid')], body.get('targetUid'), body['threadId']))
    return {'ok':True, 'encrypted': has_envelope}

@router.patch('/messages/edit')
def edit(body: dict, user_id: str = Depends(authenticated_user)):
    must(body.get('messageId'), 'messageId')
    row = q('SELECT * FROM messages WHERE id=%s', (body['messageId'],), fetch='one')
    if not row:
        raise HTTPException(status_code=404, detail='Message not found')
    if row['sender_id'] != user_id:
        raise HTTPException(status_code=403, detail='Only the sender may edit a message')
    if row.get('deleted_for_everyone'):
        raise HTTPException(status_code=400, detail='Cannot edit a deleted message')
    payload = body.get('payload') or {}
    if row['thread_type'] == 'direct':
        _assert_context(payload, row['thread_id'], user_id, row['receiver_id'])
        if body.get('text') is not None:
            raise HTTPException(status_code=400, detail='Encrypted edits must not include plaintext')
        # Replace the complete envelope, including signature and key wraps.
        # Keep only server-owned flags, never old plaintext or crypto fields.
        next_body = {k: v for k, v in (row.get('body') or {}).items() if k in {'starredBy', 'bookmarkedBy', 'flaggedBy'}}
        next_body.update(payload)
    else:
        must(body.get('text'), 'text')
        next_body = {**(row.get('body') or {}), 'text': body['text']}
    try:
        if row['thread_type'] == 'direct':
            q('''WITH receipt AS (INSERT INTO crypto_message_receipts(message_id) VALUES (%s) RETURNING message_id)
                 UPDATE messages SET body=%s, edited_at=now() WHERE id=%s AND EXISTS (SELECT 1 FROM receipt)''',
                 (payload['message_id'], next_body, body['messageId']))
        else:
            q('UPDATE messages SET body=%s, edited_at=now() WHERE id=%s', (next_body, body['messageId']))
    except UniqueViolation as exc:
        raise HTTPException(status_code=409, detail='Encrypted message identifier already used') from exc
    return {'ok': True}
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
def list_messages(threadType: str, threadId: str, uid: str|None=None, user_id: str = Depends(authenticated_user)):
    """List thread messages and filter user-deleted messages for caller."""
    if uid != user_id:
        raise HTTPException(status_code=403, detail='Cannot read another user history')
    if threadType == 'direct':
        conversation = q('SELECT participants FROM conversations WHERE id=%s', (threadId,), fetch='one')
        if conversation and user_id not in conversation['participants']:
            raise HTTPException(status_code=403, detail='Not a conversation participant')
        if not conversation:
            return {'messages': []}
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
    q("UPDATE conversations SET unread_by=jsonb_set(COALESCE(unread_by,'{}'::jsonb),%s,'0'::jsonb,true) WHERE id=%s",([uid],conversation_id))
    return {'ok':True}
@router.patch('/conversations/meta')
def meta(body: dict): must(body.get('conversationId'),'conversationId'); patch=body.get('patch') or {}; q('UPDATE conversations SET typing=COALESCE(%s,typing), unread_by=COALESCE(%s,unread_by), updated_at=now() WHERE id=%s',(patch.get('typing'),patch.get('unreadBy'),body['conversationId'])); return {'ok':True}
@router.post('/conversations/call-logs')
def addlog(body: dict): must(body.get('conversationId'),'conversationId'); q('INSERT INTO call_logs(conversation_id,data) VALUES (%s,%s)', (body['conversationId'], body.get('callData') or {})); return {'ok':True}
@router.post('/conversations/messages')
def addmsg(body: dict, user_id: str = Depends(authenticated_user)):
    payload = body.get('message') or {}
    return send({'threadType': 'direct', 'threadId': body.get('conversationId'),
                 'actorUid': user_id, 'targetUid': payload.get('recipient_user_id'), 'payload': payload}, user_id)
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
