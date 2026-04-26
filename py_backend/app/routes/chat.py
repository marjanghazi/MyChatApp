from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from firebase_admin import firestore

from app.errors import must, must_thread_type
from app.firebase_client import db_client

router = APIRouter(prefix='/api/chat', tags=['chat'])

ALLOWED_CONVERSATION_META_KEYS = {
    'callState',
    'typing',
    'mutedBy',
    'themeBy',
    'participants',
    'participantPhones',
    'lastMessage',
    'lastMessageType',
    'lastMessageSender',
    'lastMessageStatus',
    'lastMessageAt',
    'unreadBy',
    'clearedAtBy',
}
ALLOWED_SIGNAL_TYPES = {'offer', 'answer', 'candidate', 'ice', 'hangup'}


def sanitize_patch(patch: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in (patch or {}).items() if k in ALLOWED_CONVERSATION_META_KEYS}


def message_preview(payload: dict[str, Any]) -> str:
    if payload.get('type') == 'text':
        return payload.get('text') or ''
    icon = '🎤' if payload.get('type') == 'audio' else '🎬' if payload.get('type') == 'video' else '📎'
    return f"{icon} {payload.get('fileName') or 'attachment'}"


def to_docs(snapshot):
    return [{'id': d.id, **(d.to_dict() or {})} for d in snapshot]


def get_message_ref(thread_type: str, thread_id: str, message_id: str):
    db = db_client()
    if thread_type == 'direct':
        return db.collection('conversations').document(thread_id).collection('messages').document(message_id)
    if thread_type == 'group':
        return db.collection('groups').document(thread_id).collection('messages').document(message_id)
    return None


@router.post('/messages/send')
def send_message(body: dict):
    db = db_client()
    thread_type = body.get('threadType')
    actor_uid = body.get('actorUid')
    actor_name = body.get('actorName')
    actor_phone = body.get('actorPhone')
    target_uid = body.get('targetUid')
    target_phone = body.get('targetPhone')
    thread_id = body.get('threadId')
    is_target_online = bool(body.get('isTargetOnline'))
    payload = body.get('payload') or {}
    reply_to = body.get('replyTo')

    must_thread_type(thread_type)
    must(actor_uid, 'actorUid')
    must(actor_name, 'actorName')

    if thread_type == 'direct':
        must(target_uid, 'targetUid')
        must(thread_id, 'threadId')
        conversation_ref = db.collection('conversations').document(thread_id)
        final_payload = {
            **payload,
            **({'replyTo': reply_to} if reply_to else {}),
            'senderId': actor_uid,
            'receiverId': target_uid,
            'createdAt': firestore.SERVER_TIMESTAMP,
            'deliveredTo': [actor_uid, *([target_uid] if is_target_online else [])],
            'readBy': [actor_uid],
        }
        conversation_ref.set(
            {
                'participants': [actor_uid, target_uid],
                'participantPhones': [actor_phone or '', target_phone or ''],
                'lastMessage': message_preview(payload),
                'lastMessageType': payload.get('type'),
                'lastMessageSender': actor_uid,
                'lastMessageStatus': 'delivered' if is_target_online else 'sent',
                'lastMessageAt': firestore.SERVER_TIMESTAMP,
                'typing': {actor_uid: False},
                'unreadBy': {actor_uid: 0, target_uid: firestore.Increment(1)},
                'createdAt': firestore.SERVER_TIMESTAMP,
                'updatedAt': firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        conversation_ref.collection('messages').add(final_payload)
        return {'ok': True}

    if thread_type == 'group':
        must(thread_id, 'threadId')
        group_ref = db.collection('groups').document(thread_id)
        final_payload = {
            'text': payload.get('text') or '',
            'type': payload.get('type') or 'text',
            'senderId': actor_uid,
            'senderName': actor_name,
            'createdAt': firestore.SERVER_TIMESTAMP,
            **({'replyTo': reply_to} if reply_to else {}),
        }
        group_ref.collection('messages').add(final_payload)
        group_ref.set(
            {
                'lastMessage': final_payload['text'],
                'lastMessageAt': firestore.SERVER_TIMESTAMP,
                'updatedAt': firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        return {'ok': True}

    if thread_type == 'channel':
        must(thread_id, 'threadId')
        channel_ref = db.collection('channels').document(thread_id)
        channel_ref.collection('posts').add(
            {
                'text': payload.get('text') or '',
                'type': 'post',
                'senderId': actor_uid,
                'senderName': actor_name,
                'createdAt': firestore.SERVER_TIMESTAMP,
            }
        )
        channel_ref.set(
            {
                'lastPost': payload.get('text') or '',
                'lastPostAt': firestore.SERVER_TIMESTAMP,
                'updatedAt': firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        return {'ok': True}

    return {'ok': False}


@router.patch('/messages/edit')
def edit_message(body: dict):
    thread_type = body.get('threadType')
    thread_id = body.get('threadId')
    message_id = body.get('messageId')
    text = body.get('text')
    must_thread_type(thread_type)
    must(thread_id, 'threadId')
    must(message_id, 'messageId')
    must(text, 'text')

    ref = get_message_ref(thread_type, thread_id, message_id)
    must(ref, 'messageRef')
    ref.update({'text': text, 'editedAt': firestore.SERVER_TIMESTAMP})
    return {'ok': True}


@router.patch('/messages/delete-for-me')
def delete_for_me(body: dict):
    thread_type = body.get('threadType')
    thread_id = body.get('threadId')
    message_id = body.get('messageId')
    actor_uid = body.get('actorUid')
    must(thread_type, 'threadType')
    must(thread_id, 'threadId')
    must(message_id, 'messageId')
    must(actor_uid, 'actorUid')

    ref = get_message_ref(thread_type, thread_id, message_id)
    must(ref, 'messageRef')
    ref.update({'deletedFor': firestore.ArrayUnion([actor_uid])})
    return {'ok': True}


@router.patch('/messages/delete-for-everyone')
def delete_for_everyone(body: dict):
    thread_type = body.get('threadType')
    thread_id = body.get('threadId')
    message_id = body.get('messageId')
    must_thread_type(thread_type)
    must(thread_id, 'threadId')
    must(message_id, 'messageId')

    ref = get_message_ref(thread_type, thread_id, message_id)
    must(ref, 'messageRef')
    ref.update(
        {
            'text': '🚫 This message was deleted.',
            'deletedForEveryone': True,
            'deletedAt': firestore.SERVER_TIMESTAMP,
            'fileURL': None,
            'fileName': None,
            'fileSize': None,
        }
    )
    return {'ok': True}


@router.patch('/messages/toggle-flag')
def toggle_flag(body: dict):
    thread_type = body.get('threadType')
    thread_id = body.get('threadId')
    message_id = body.get('messageId')
    actor_uid = body.get('actorUid')
    key = body.get('key')
    already_flagged = bool(body.get('alreadyFlagged'))

    must_thread_type(thread_type)
    must(thread_id, 'threadId')
    must(message_id, 'messageId')
    must(actor_uid, 'actorUid')
    must(key, 'key')

    ref = get_message_ref(thread_type, thread_id, message_id)
    must(ref, 'messageRef')
    value = firestore.ArrayRemove([actor_uid]) if already_flagged else firestore.ArrayUnion([actor_uid])
    ref.update({key: value})
    return {'ok': True}


@router.get('/messages')
def list_messages(threadType: str, threadId: str, uid: str | None = None):
    db = db_client()
    must_thread_type(threadType)
    must(threadId, 'threadId')

    if threadType == 'direct':
        snapshot = (
            db.collection('conversations')
            .document(threadId)
            .collection('messages')
            .order_by('createdAt')
            .limit(300)
            .stream()
        )
    elif threadType == 'group':
        snapshot = db.collection('groups').document(threadId).collection('messages').order_by('createdAt').limit(300).stream()
    else:
        snapshot = db.collection('channels').document(threadId).collection('posts').order_by('createdAt').limit(300).stream()

    messages = to_docs(snapshot)
    if uid:
        messages = [m for m in messages if uid not in (m.get('deletedFor') or [])]
    return {'messages': messages}


@router.get('/call-logs')
def list_call_logs(conversationId: str):
    must(conversationId, 'conversationId')
    snapshot = (
        db_client()
        .collection('conversations')
        .document(conversationId)
        .collection('callLogs')
        .order_by('createdAt', direction=firestore.Query.DESCENDING)
        .limit(200)
        .stream()
    )
    return {'logs': to_docs(snapshot)}


@router.get('/signals')
def list_signals(conversationId: str, to: str):
    must(conversationId, 'conversationId')
    must(to, 'to')
    snapshot = (
        db_client()
        .collection('conversations')
        .document(conversationId)
        .collection('signals')
        .where('to', '==', to)
        .order_by('createdAt')
        .stream()
    )
    return {'signals': to_docs(snapshot)}


@router.delete('/signals/{signal_id}')
def delete_signal(signal_id: str, conversationId: str):
    must(signal_id, 'signalId')
    must(conversationId, 'conversationId')
    db_client().collection('conversations').document(conversationId).collection('signals').document(signal_id).delete()
    return {'ok': True}


@router.patch('/conversations/seen')
def mark_seen(body: dict):
    conversation_id = body.get('conversationId')
    uid = body.get('uid')
    must(conversation_id, 'conversationId')
    must(uid, 'uid')

    db = db_client()
    messages_ref = db.collection('conversations').document(conversation_id).collection('messages')
    unread = messages_ref.where('receiverId', '==', uid).stream()
    batch = db.batch()

    for entry in unread:
        doc = entry.to_dict() or {}
        if uid in (doc.get('readBy') or []):
            continue
        batch.update(
            entry.reference,
            {
                'deliveredTo': firestore.ArrayUnion([uid]),
                'readBy': firestore.ArrayUnion([uid]),
                'readAt': firestore.SERVER_TIMESTAMP,
            },
        )

    batch.set(
        db.collection('conversations').document(conversation_id),
        {'unreadBy': {uid: 0}, 'lastMessageStatus': 'seen'},
        merge=True,
    )
    batch.commit()
    return {'ok': True}


@router.patch('/conversations/meta')
def update_meta(body: dict):
    conversation_id = body.get('conversationId')
    patch = body.get('patch') or {}
    must(conversation_id, 'conversationId')
    db_client().collection('conversations').document(conversation_id).set(
        {**sanitize_patch(patch), 'updatedAt': firestore.SERVER_TIMESTAMP}, merge=True
    )
    return {'ok': True}


@router.post('/conversations/call-logs')
def add_call_log(body: dict):
    conversation_id = body.get('conversationId')
    call_data = body.get('callData') or {}
    must(conversation_id, 'conversationId')
    db_client().collection('conversations').document(conversation_id).collection('callLogs').add(
        {**call_data, 'createdAt': firestore.SERVER_TIMESTAMP}
    )
    return {'ok': True}


@router.post('/conversations/messages')
def add_conversation_message(body: dict):
    conversation_id = body.get('conversationId')
    message = body.get('message') or {}
    must(conversation_id, 'conversationId')
    db_client().collection('conversations').document(conversation_id).collection('messages').add(
        {**message, 'createdAt': firestore.SERVER_TIMESTAMP}
    )
    return {'ok': True}


@router.post('/conversations/signals')
def add_conversation_signal(body: dict):
    conversation_id = body.get('conversationId')
    signal = body.get('signal') or {}
    must(conversation_id, 'conversationId')
    if signal.get('type') and signal.get('type') not in ALLOWED_SIGNAL_TYPES:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail='Unsupported signal type')

    db_client().collection('conversations').document(conversation_id).collection('signals').add(
        {**signal, 'createdAt': firestore.SERVER_TIMESTAMP}
    )
    return {'ok': True}


@router.post('/conversations/clear')
def clear_for_user(body: dict):
    conversation_id = body.get('conversationId')
    uid = body.get('uid')
    must(conversation_id, 'conversationId')
    must(uid, 'uid')

    db = db_client()
    conversation_ref = db.collection('conversations').document(conversation_id)
    snapshot = conversation_ref.collection('messages').limit(500).stream()
    batch = db.batch()

    for entry in snapshot:
        batch.update(entry.reference, {'deletedFor': firestore.ArrayUnion([uid])})

    batch.set(
        conversation_ref,
        {'clearedAtBy': {uid: firestore.SERVER_TIMESTAMP}, 'unreadBy': {uid: 0}, 'updatedAt': firestore.SERVER_TIMESTAMP},
        merge=True,
    )
    batch.commit()
    return {'ok': True}
