from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from firebase_admin import firestore

from app.errors import must, phone_variants
from app.firebase_client import db_client

router = APIRouter(prefix='/api/users', tags=['users'])


def users_col():
    return db_client().collection('users')


@router.post('/check-phone')
def check_phone(body: dict):
    phone_number = body.get('phoneNumber')
    must(phone_number, 'phoneNumber')
    variants = phone_variants(phone_number)
    if not variants:
        raise HTTPException(status_code=400, detail='A valid phone number is required.')

    exact = users_col().where('phoneNumber', 'in', variants).limit(1).stream()
    variant = users_col().where('phoneLookupKeys', 'array_contains_any', variants).limit(1).stream()
    has_exact = any(True for _ in exact)
    has_variant = any(True for _ in variant)

    return {'available': not has_exact and not has_variant, 'normalizedPhone': variants[0], 'phoneVariants': variants}


@router.post('/profile')
def upsert_profile(body: dict):
    uid = body.get('uid')
    must(uid, 'uid')
    now = datetime.now(timezone.utc)
    payload = {
        'uid': uid,
        'displayName': body.get('displayName', ''),
        'email': body.get('email', ''),
        'phoneNumber': body.get('phoneNumber', ''),
        'phoneLookupKeys': body.get('phoneLookupKeys', []),
        'contacts': [],
        'isOnline': True,
        'lastSeen': now,
        'activeAt': now,
        'createdAt': now,
        'updatedAt': now,
    }
    users_col().document(uid).set(payload, merge=True)
    return {'ok': True}


@router.get('/{uid}/profile')
def get_profile(uid: str):
    must(uid, 'uid')
    snap = users_col().document(uid).get()
    if not snap.exists:
        return {'profile': None}
    return {'profile': snap.to_dict()}


@router.post('/{uid}/presence')
def set_presence(uid: str, body: dict):
    must(uid, 'uid')
    users_col().document(uid).set(
        {
            'isOnline': bool(body.get('isOnline')),
            'lastSeen': datetime.now(timezone.utc),
            'activeAt': datetime.now(timezone.utc),
        },
        merge=True,
    )
    return {'ok': True}


@router.patch('/{uid}/profile')
def patch_profile(uid: str, body: dict):
    must(uid, 'uid')
    allowed = {'displayName', 'photoURL', 'logoURL'}
    patch = {k: v for k, v in (body or {}).items() if k in allowed and v is not None}
    patch['updatedAt'] = datetime.now(timezone.utc)
    users_col().document(uid).set(patch, merge=True)
    return {'ok': True}


@router.post('/{uid}/contacts')
def add_contact(uid: str, body: dict):
    phone_number = body.get('phoneNumber')
    must(uid, 'uid')
    must(phone_number, 'phoneNumber')
    variants = phone_variants(phone_number)
    if not variants:
        raise HTTPException(status_code=400, detail='Please enter a valid phone number.')

    direct = users_col().where('phoneNumber', 'in', variants).stream()
    variant = users_col().where('phoneLookupKeys', 'array_contains_any', variants).stream()

    candidates: dict[str, dict] = {}
    for doc in direct:
        candidates[doc.id] = doc.to_dict()
    for doc in variant:
        candidates[doc.id] = doc.to_dict()

    candidate = next(iter(candidates.values()), None)
    if not candidate:
        raise HTTPException(status_code=404, detail='No registered user found with that number.')
    if candidate.get('uid') == uid:
        raise HTTPException(status_code=400, detail='You cannot add your own number.')

    users_col().document(uid).update(
        {
            'contacts': firestore.ArrayUnion([candidate.get('phoneNumber')]),
            'updatedAt': datetime.now(timezone.utc),
        }
    )
    return {'ok': True, 'candidate': candidate}
