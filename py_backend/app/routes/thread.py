from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app.errors import must
from app.firebase_client import db_client

router = APIRouter(prefix='/api/thread', tags=['thread'])


@router.get('/users')
def list_users(excludeUid: str | None = None):
    snapshot = db_client().collection('users').stream()
    users = [doc.to_dict() for doc in snapshot]
    users = [u for u in users if u.get('uid') != excludeUid]
    return {'users': users}


@router.get('/conversations')
def list_conversations(uid: str):
    must(uid, 'uid')
    snapshot = db_client().collection('conversations').where('participants', 'array_contains', uid).stream()
    conversations = {doc.id: doc.to_dict() for doc in snapshot}
    return {'conversations': conversations}


@router.patch('/conversations/{conversation_id}/delivered')
def mark_delivered(conversation_id: str):
    must(conversation_id, 'conversationId')
    db_client().collection('conversations').document(conversation_id).update(
        {'lastMessageStatus': 'delivered', 'updatedAt': datetime.now(timezone.utc)}
    )
    return {'ok': True}


@router.get('/groups')
def list_groups(uid: str):
    must(uid, 'uid')
    snapshot = db_client().collection('groups').where('memberIds', 'array_contains', uid).stream()
    groups = [{'id': doc.id, **(doc.to_dict() or {})} for doc in snapshot]
    groups.sort(key=lambda entry: entry.get('name') or '')
    return {'groups': groups}


@router.get('/channels')
def list_channels():
    snapshot = db_client().collection('channels').stream()
    channels = [{'id': doc.id, **(doc.to_dict() or {})} for doc in snapshot]
    return {'channels': channels}
