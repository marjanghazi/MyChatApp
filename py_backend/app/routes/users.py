from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from psycopg2.errors import UniqueViolation

from app.db import q
from app.errors import must, phone_variants
from app.security.request_auth import authenticated_user

router = APIRouter(prefix='/api/users', tags=['users'])


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


def _to_user_payload(row: dict | None) -> dict | None:
    if not row:
        return None
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


@router.post('/check-phone')
def check_phone(body: dict):
    phone = body.get('phoneNumber')
    must(phone, 'phoneNumber')
    variants = phone_variants(phone)
    row = q("SELECT uid FROM users WHERE phone_number = ANY(%s) OR phone_lookup_keys && %s LIMIT 1", (variants, variants), fetch='one')
    return {'available': row is None, 'normalizedPhone': variants[0], 'phoneVariants': variants}


@router.post('/profile')
def upsert_profile(body: dict, user_id: str = Depends(authenticated_user)):
    uid = body.get('uid')
    must(uid, 'uid')
    if uid != user_id:
        raise HTTPException(status_code=403, detail='Cannot update another user')
    q(
        "UPDATE users SET display_name=COALESCE(NULLIF(%s,''),display_name),updated_at=now() WHERE uid=%s",
        (body.get('displayName'), uid),
    )
    return {'ok': True}


@router.get('/{uid}/profile')
def get_profile(uid: str, user_id: str = Depends(authenticated_user)):
    if uid != user_id:
        raise HTTPException(status_code=403, detail='Cannot read another user profile')
    return {'profile': _to_user_payload(q('SELECT * FROM users WHERE uid=%s', (uid,), fetch='one'))}


@router.post('/{uid}/presence')
def set_presence(uid: str, body: dict, user_id: str = Depends(authenticated_user)):
    if uid != user_id:
        raise HTTPException(status_code=403, detail='Cannot update another user')
    q('UPDATE users SET is_online=%s,last_seen=now(),active_at=now() WHERE uid=%s', (bool(body.get('isOnline')), uid))
    return {'ok': True}


@router.patch('/{uid}/profile')
def patch_profile(uid: str, body: dict, user_id: str = Depends(authenticated_user)):
    if uid != user_id:
        raise HTTPException(status_code=403, detail='Cannot update another user')
    q(
        'UPDATE users SET display_name=COALESCE(%s,display_name), photo_url=COALESCE(%s,photo_url), logo_url=COALESCE(%s,logo_url), updated_at=now() WHERE uid=%s',
        (body.get('displayName'), body.get('photoURL'), body.get('logoURL'), uid),
    )
    return {'ok': True}


@router.patch('/me/phone')
def update_my_phone(body: dict, user_id: str = Depends(authenticated_user)):
    must(body.get('phoneNumber'), 'phoneNumber')
    variants = phone_variants(body['phoneNumber'])
    try:
        row = q(
            'UPDATE users SET phone_number=%s,phone_lookup_keys=%s,updated_at=now() WHERE uid=%s RETURNING *',
            (variants[0], variants, user_id),
            fetch='one',
        )
    except UniqueViolation as exc:
        raise HTTPException(status_code=409, detail='This phone number is already linked to another account') from exc
    if not row:
        raise HTTPException(status_code=404, detail='Account not found')
    return {'profile': _to_user_payload(row)}


@router.post('/{uid}/contacts')
def add_contact(uid: str, body: dict, user_id: str = Depends(authenticated_user)):
    if uid != user_id:
        raise HTTPException(status_code=403, detail='Cannot update another user')
    phone = body.get('phoneNumber')
    must(phone, 'phoneNumber')
    variants = phone_variants(phone)
    candidate = q('SELECT * FROM users WHERE phone_number = ANY(%s) OR phone_lookup_keys && %s LIMIT 1', (variants, variants), fetch='one')
    if not candidate:
        raise HTTPException(status_code=404, detail='No account has this phone number yet. Ask that person to save it in their profile.')
    if candidate['uid'] == uid:
        raise HTTPException(status_code=400, detail='You cannot add your own number.')
    q('UPDATE users SET contacts = array_append(contacts,%s), updated_at=now() WHERE uid=%s AND NOT (%s = ANY(contacts))', (candidate['phone_number'], uid, candidate['phone_number']))
    return {'ok': True, 'candidate': _to_user_payload(candidate)}
