from __future__ import annotations

import os
import secrets

from fastapi import APIRouter, HTTPException, Depends
from psycopg2.errors import UniqueViolation
from app.security.request_auth import authenticated_user

from app.db import q
from app.errors import must, phone_variants
from app.security.jwt_service import JwtService
from app.security.passwords import PasswordHasher

router = APIRouter(prefix='/api/auth', tags=['auth'])

password_hasher = PasswordHasher()
jwt_service = JwtService(secret=os.getenv('JWT_SECRET', 'change-me-in-env'), algorithm='HS256', ttl_minutes=int(os.getenv('JWT_TTL_MINUTES', '15')))


def _to_user(row, *, device_id: str):
    secret = os.getenv('JWT_SECRET', '')
    if len(secret) < 32 or secret.startswith('replace-with'):
        raise HTTPException(status_code=503, detail='Configure a random JWT_SECRET of at least 32 characters')
    access_token = jwt_service.issue_access_token(user_id=row['uid'], device_id=device_id)
    refresh_token = secrets.token_urlsafe(32)
    return {
        'uid': row['uid'],
        'email': row['email'],
        'displayName': row['display_name'],
        'photoURL': row['photo_url'],
        'idToken': access_token,
        'refreshToken': refresh_token,
        'deviceId': device_id,
        'tokenType': 'Bearer',
        'supportedCryptoSuites': ['pqc'],
    }


@router.post('/register', status_code=201)
def register(body: dict):
    email = str(body.get('email') or '').strip().lower()
    password = body.get('password')
    phone = body.get('phoneNumber')
    must(email, 'email')
    must(password, 'password')
    must(phone, 'phoneNumber')
    variants = phone_variants(phone)
    if str(email).strip().lower() == os.getenv('ADMIN_EMAIL', '').strip().lower() and os.getenv('ADMIN_EMAIL', '').strip():
        raise HTTPException(status_code=400, detail='This email address is reserved')

    uid = body.get('uid') or secrets.token_hex(12)
    try:
        q(
            "INSERT INTO users(uid,email,password_hash,display_name,phone_number,phone_lookup_keys,is_online) VALUES (%s,%s,%s,%s,%s,%s,true)",
            (uid, email, password_hasher.hash(password), body.get('displayName') or '', variants[0], variants),
        )
    except UniqueViolation as exc:
        field = 'phone number' if 'phone' in (exc.diag.constraint_name or '') else 'email address'
        raise HTTPException(status_code=409, detail=f'This {field} is already registered') from exc

    row = q("SELECT * FROM users WHERE uid=%s", (uid,), fetch='one')
    q("INSERT INTO auth_events(account_id,event_type) VALUES (%s,'register')", (uid,))
    device_id = body.get('deviceId') or secrets.token_hex(8)
    return {'user': _to_user(row, device_id=device_id)}


@router.post('/login')
def login(body: dict):
    email = str(body.get('email') or '').strip().lower()
    password = body.get('password')
    must(email, 'email')
    must(password, 'password')

    row = q("SELECT * FROM users WHERE lower(email)=%s", (email,), fetch='one')
    if not row or not password_hasher.verify(password, row['password_hash']):
        raise HTTPException(status_code=400, detail='Invalid credentials')
    q("INSERT INTO auth_events(account_id,event_type) VALUES (%s,'login')", (row['uid'],))
    device_id = body.get('deviceId') or secrets.token_hex(8)
    return {'user': _to_user(row, device_id=device_id)}


@router.post('/update-profile')
def update_profile(body: dict, user_id: str = Depends(authenticated_user)):
    if body.get("uid") != user_id:
        raise HTTPException(status_code=403, detail="Cannot update another user")
    uid = body.get('uid')
    must(uid, 'uid')
    q(
        "UPDATE users SET display_name=%s, photo_url=%s, updated_at=now() WHERE uid=%s",
        (body.get('displayName') or '', body.get('photoURL') or '', uid),
    )
    row = q("SELECT * FROM users WHERE uid=%s", (uid,), fetch='one')
    device_id = body.get('deviceId') or secrets.token_hex(8)
    return {'user': _to_user(row, device_id=device_id)}
