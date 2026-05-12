from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from firebase_admin import firestore

from app.cache import invalidate_cache
from app.errors import must
from app.firebase_client import db_client

router = APIRouter(prefix='/api/community', tags=['community'])


def groups_col():
    return db_client().collection('groups')


def channels_col():
    return db_client().collection('channels')


def get_group_or_404(group_id: str):
    snap = groups_col().document(group_id).get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail='Group not found')
    return snap.reference, snap.to_dict()


@router.post('/groups', status_code=201)
def create_group(body: dict):
    name = body.get('name')
    creator_id = body.get('creatorId')
    must(name, 'name')
    must(creator_id, 'creatorId')

    member_ids = body.get('memberIds', [])
    members = list(dict.fromkeys([creator_id, *member_ids]))
    now = datetime.now(timezone.utc)
    payload = {
        'name': str(name).strip(),
        'description': str(body.get('description', '')).strip(),
        'photoURL': str(body.get('photoURL', '')).strip(),
        'memberIds': members,
        'admins': [creator_id],
        'createdBy': creator_id,
        'createdAt': now,
        'updatedAt': now,
        'lastMessage': '',
        'lastMessageAt': None,
    }
    ref = groups_col().document()
    ref.set(payload)
    return {'id': ref.id, **payload}


@router.post('/channels', status_code=201)
def create_channel(body: dict):
    name = body.get('name')
    creator_id = body.get('creatorId')
    must(name, 'name')
    must(creator_id, 'creatorId')
    now = datetime.now(timezone.utc)
    payload = {
        'name': str(name).strip(),
        'description': str(body.get('description', '')).strip(),
        'ownerId': creator_id,
        'followerIds': [creator_id],
        'createdAt': now,
        'updatedAt': now,
        'lastPost': '',
        'lastPostAt': None,
    }
    ref = channels_col().document()
    ref.set(payload)
    return {'id': ref.id, **payload}


@router.post('/channels/{channel_id}/follow')
def follow_channel(channel_id: str, body: dict):
    user_id = body.get('userId')
    must(channel_id, 'channelId')
    must(user_id, 'userId')

    ref = channels_col().document(channel_id)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail='Channel not found')
    data = snap.to_dict() or {}
    existing = data.get('followerIds') if isinstance(data.get('followerIds'), list) else []
    if user_id not in existing:
        existing.append(user_id)
    ref.update({'followerIds': existing, 'updatedAt': datetime.now(timezone.utc)})
    return {'ok': True}


@router.patch('/groups/{group_id}/profile')
def update_group_profile(group_id: str, body: dict):
    requester_id = body.get('requesterId')
    must(group_id, 'groupId')
    must(requester_id, 'requesterId')

    ref, data = get_group_or_404(group_id)
    if requester_id not in (data.get('admins') or []):
        raise HTTPException(status_code=403, detail='Only admins can update group profile.')

    update_data: dict = {'updatedAt': datetime.now(timezone.utc)}
    if body.get('name') is not None:
        update_data['name'] = str(body.get('name')).strip()
    if body.get('description') is not None:
        update_data['description'] = str(body.get('description')).strip()
    if body.get('photoURL') is not None:
        update_data['photoURL'] = str(body.get('photoURL')).strip()

    ref.update(update_data)
    invalidate_cache(prefix='thread:groups:')
    return {'ok': True}


@router.post('/channels/{channel_id}/unfollow')
def unfollow_channel(channel_id: str, body: dict):
    user_id = body.get('userId')
    must(channel_id, 'channelId')
    must(user_id, 'userId')

    ref = channels_col().document(channel_id)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail='Channel not found')
    data = snap.to_dict() or {}
    existing = data.get('followerIds') if isinstance(data.get('followerIds'), list) else []
    ref.update({'followerIds': [i for i in existing if i != user_id], 'updatedAt': datetime.now(timezone.utc)})
    return {'ok': True}


@router.post('/groups/{group_id}/leave')
def leave_group(group_id: str, body: dict):
    user_id = body.get('userId')
    must(group_id, 'groupId')
    must(user_id, 'userId')
    ref, _ = get_group_or_404(group_id)
    ref.update(
        {
            'memberIds': firestore.ArrayRemove([user_id]),
            'admins': firestore.ArrayRemove([user_id]),
            'updatedAt': datetime.now(timezone.utc),
        }
    )
    return {'ok': True}


@router.post('/groups/{group_id}/members/add')
def add_group_member(group_id: str, body: dict):
    requester_id = body.get('requesterId')
    member_uid = body.get('memberUid')
    must(group_id, 'groupId')
    must(requester_id, 'requesterId')
    must(member_uid, 'memberUid')

    ref, data = get_group_or_404(group_id)
    if requester_id not in (data.get('admins') or []):
        raise HTTPException(status_code=403, detail='Only admins can add members.')
    ref.update({'memberIds': firestore.ArrayUnion([member_uid]), 'updatedAt': datetime.now(timezone.utc)})
    return {'ok': True}


@router.post('/groups/{group_id}/admins/toggle')
def toggle_group_admin(group_id: str, body: dict):
    requester_id = body.get('requesterId')
    member_uid = body.get('memberUid')
    make_admin = bool(body.get('makeAdmin'))
    must(group_id, 'groupId')
    must(requester_id, 'requesterId')
    must(member_uid, 'memberUid')

    ref, data = get_group_or_404(group_id)
    if requester_id not in (data.get('admins') or []):
        raise HTTPException(status_code=403, detail='Only admins can update admin rights.')
    if (not make_admin) and member_uid == data.get('createdBy'):
        raise HTTPException(status_code=400, detail='Group creator must remain an admin.')

    ref.update(
        {
            'admins': firestore.ArrayUnion([member_uid]) if make_admin else firestore.ArrayRemove([member_uid]),
            'updatedAt': datetime.now(timezone.utc),
        }
    )
    return {'ok': True}


@router.post('/groups/{group_id}/members/remove')
def remove_group_member(group_id: str, body: dict):
    requester_id = body.get('requesterId')
    member_uid = body.get('memberUid')
    must(group_id, 'groupId')
    must(requester_id, 'requesterId')
    must(member_uid, 'memberUid')

    ref, data = get_group_or_404(group_id)
    if requester_id not in (data.get('admins') or []):
        raise HTTPException(status_code=403, detail='Only admins can remove members.')
    if member_uid == requester_id:
        raise HTTPException(status_code=400, detail='Use Leave Group to remove yourself.')
    if member_uid == data.get('createdBy'):
        raise HTTPException(status_code=400, detail='Group creator cannot be removed.')

    ref.update(
        {
            'memberIds': firestore.ArrayRemove([member_uid]),
            'admins': firestore.ArrayRemove([member_uid]),
            'updatedAt': datetime.now(timezone.utc),
        }
    )
    return {'ok': True}
