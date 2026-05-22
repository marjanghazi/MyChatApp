from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.db import q
from app.errors import must, phone_variants

router = APIRouter(prefix='/api/users', tags=['users'])


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
        'isOnline': bool(row.get('is_online')),
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
def upsert_profile(body: dict):
    uid = body.get('uid')
    must(uid, 'uid')
    q(
        """INSERT INTO users(uid,email,password_hash,display_name,phone_number,phone_lookup_keys,contacts,is_online,last_seen,active_at)
         VALUES (%s,%s,%s,%s,%s,%s,%s,true,now(),now())
         ON CONFLICT(uid) DO UPDATE SET display_name=EXCLUDED.display_name,email=EXCLUDED.email,phone_number=EXCLUDED.phone_number,phone_lookup_keys=EXCLUDED.phone_lookup_keys,updated_at=now()""",
        (uid, body.get('email', ''), body.get('passwordHash', 'local'), body.get('displayName', ''), body.get('phoneNumber', ''), body.get('phoneLookupKeys', []), []),
    )
    return {'ok': True}


@router.get('/{uid}/profile')
def get_profile(uid: str):
    return {'profile': _to_user_payload(q('SELECT * FROM users WHERE uid=%s', (uid,), fetch='one'))}


@router.post('/{uid}/presence')
def set_presence(uid: str, body: dict):
    q('UPDATE users SET is_online=%s,last_seen=now(),active_at=now() WHERE uid=%s', (bool(body.get('isOnline')), uid))
    return {'ok': True}


@router.patch('/{uid}/profile')
def patch_profile(uid: str, body: dict):
    q(
        'UPDATE users SET display_name=COALESCE(%s,display_name), photo_url=COALESCE(%s,photo_url), logo_url=COALESCE(%s,logo_url), updated_at=now() WHERE uid=%s',
        (body.get('displayName'), body.get('photoURL'), body.get('logoURL'), uid),
    )
    return {'ok': True}


@router.post('/{uid}/contacts')
def add_contact(uid: str, body: dict):
    phone = body.get('phoneNumber')
    must(phone, 'phoneNumber')
    variants = phone_variants(phone)
    candidate = q('SELECT * FROM users WHERE phone_number = ANY(%s) OR phone_lookup_keys && %s LIMIT 1', (variants, variants), fetch='one')
    if not candidate:
        raise HTTPException(status_code=404, detail='No registered user found with that number.')
    if candidate['uid'] == uid:
        raise HTTPException(status_code=400, detail='You cannot add your own number.')
    q('UPDATE users SET contacts = array_append(contacts,%s), updated_at=now() WHERE uid=%s AND NOT (%s = ANY(contacts))', (candidate['phone_number'], uid, candidate['phone_number']))
    return {'ok': True, 'candidate': _to_user_payload(candidate)}
