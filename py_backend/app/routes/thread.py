from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app.cache import cached, invalidate_cache
from app.errors import must
from app.firebase_client import db_client

router = APIRouter(prefix='/api/thread', tags=['thread'])


@router.get('/users')
def list_users(excludeUid: str | None = None):
    users = cached('thread:users:all', 20, lambda: [doc.to_dict() for doc in db_client().collection('users').stream()])
    users = [u for u in users if u.get('uid') != excludeUid]
    return {'users': users}


@router.get('/conversations')
def list_conversations(uid: str):
    must(uid, 'uid')
    conversations = cached(
        f'thread:conversations:{uid}',
        3,
        lambda: {
            doc.id: doc.to_dict() for doc in db_client().collection('conversations').where('participants', 'array_contains', uid).stream()
        },
    )
    return {'conversations': conversations}


@router.patch('/conversations/{conversation_id}/delivered')
def mark_delivered(conversation_id: str):
    must(conversation_id, 'conversationId')
    db_client().collection('conversations').document(conversation_id).update(
        {'lastMessageStatus': 'delivered', 'updatedAt': datetime.now(timezone.utc)}
    )
    invalidate_cache(prefix='thread:conversations:')
    return {'ok': True}


@router.get('/groups')
def list_groups(uid: str):
    must(uid, 'uid')
    groups = cached(
        f'thread:groups:{uid}',
        10,
        lambda: [{'id': doc.id, **(doc.to_dict() or {})} for doc in db_client().collection('groups').where('memberIds', 'array_contains', uid).stream()],
    )
    groups.sort(key=lambda entry: entry.get('name') or '')
    return {'groups': groups}


@router.get('/channels')
def list_channels():
    channels = cached(
        'thread:channels:all',
        20,
        lambda: [{'id': doc.id, **(doc.to_dict() or {})} for doc in db_client().collection('channels').stream()],
    )
    return {'channels': channels}
