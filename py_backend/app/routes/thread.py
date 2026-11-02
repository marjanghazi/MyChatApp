from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.db import q
from app.errors import must
from app.security.request_auth import authenticated_user

router = APIRouter(prefix='/api/thread', tags=['thread'])


def _is_currently_online(row: dict) -> bool:
    if not row:
        return False
    active_at = row.get('active_at')
    if isinstance(active_at, datetime):
        now = datetime.now(timezone.utc)
        if active_at.tzinfo is None:
            active_at = active_at.replace(tzinfo=timezone.utc)
        return (now - active_at).total_seconds() <= 45
    return bool(row.get('is_online'))


def _to_user_payload(row: dict) -> dict:
    return {
        'uid': row.get('uid'),
        'displayName': row.get('display_name') or '',
        'email': row.get('email') or '',
        'phoneNumber': row.get('phone_number') or '',
        'phoneLookupKeys': row.get('phone_lookup_keys') or [],
        'contacts': row.get('contacts') or [],
        'isOnline': _is_currently_online(row),
        'lastSeen': row.get('last_seen'),
        'activeAt': row.get('active_at'),
        'createdAt': row.get('created_at'),
        'updatedAt': row.get('updated_at'),
        'photoURL': row.get('photo_url') or '',
        'logoURL': row.get('logo_url') or '',
    }




def _to_conversation_payload(row: dict) -> dict:
    return {
        'id': row.get('id'),
        'participants': row.get('participants') or [],
        'participantPhones': row.get('participant_phones') or [],
        'lastMessage': row.get('last_message') or '',
        'lastMessageType': row.get('last_message_type'),
        'lastMessageSender': row.get('last_message_sender'),
        'lastMessageStatus': row.get('last_message_status'),
        'lastMessageAt': row.get('last_message_at'),
        'typing': row.get('typing') or {},
        'unreadBy': row.get('unread_by') or {},
        'clearedAtBy': row.get('cleared_at_by') or {},
        'createdAt': row.get('created_at'),
        'updatedAt': row.get('updated_at'),
    }

@router.get('/users')
def users(user_id: str = Depends(authenticated_user)):
    rows = q(
        '''SELECT u.* FROM users u
           WHERE u.uid <> %s AND (
             EXISTS (
               SELECT 1 FROM unnest(COALESCE(u.phone_lookup_keys, '{}'::text[])) AS lookup(key)
               WHERE lookup.key = ANY(COALESCE((SELECT contacts FROM users WHERE uid=%s), '{}'::text[]))
             )
             OR EXISTS (
               SELECT 1 FROM conversations c
               WHERE %s = ANY(c.participants) AND u.uid = ANY(c.participants)
             )
           )''',
        (user_id, user_id, user_id),
        fetch='all',
    ) or []
    return {'users': [_to_user_payload(row) for row in rows]}


@router.get('/conversations')
def conv(uid: str):
    must(uid, 'uid')
    rows = q('SELECT * FROM conversations WHERE %s = ANY(participants)', (uid,), fetch='all') or []
    return {'conversations': {r['id']: _to_conversation_payload(r) for r in rows}}


@router.patch('/conversations/{conversation_id}/delivered')
def d(conversation_id: str):
    conv = q('SELECT participants,last_message_sender FROM conversations WHERE id=%s', (conversation_id,), fetch='one')
    if conv:
        sender = conv.get('last_message_sender')
        participants = conv.get('participants') or []
        recipient = next((u for u in participants if u and u != sender), None)
        if recipient:
            q(
                'UPDATE messages SET delivered_to = array_append(delivered_to,%s) WHERE thread_type=%s AND thread_id=%s AND receiver_id=%s AND NOT (%s = ANY(delivered_to))',
                (recipient, 'direct', conversation_id, recipient, recipient),
            )
    q("UPDATE conversations SET last_message_status='delivered',updated_at=now() WHERE id=%s", (conversation_id,))
    return {'ok': True}


@router.get('/groups')
def groups(uid: str):
    must(uid, 'uid')
    rows = q('SELECT * FROM groups WHERE %s = ANY(member_ids) ORDER BY name', (uid,), fetch='all') or []
    return {'groups': [{'id': str(r['id']), **dict(r)} for r in rows]}


@router.get('/channels')
def channels():
    rows = q('SELECT * FROM channels', fetch='all') or []
    return {'channels': [{'id': str(r['id']), **dict(r)} for r in rows]}
