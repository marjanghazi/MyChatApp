from __future__ import annotations
import secrets
from fastapi import APIRouter, HTTPException
from passlib.hash import bcrypt
from app.db import q
from app.errors import must

router = APIRouter(prefix='/api/auth', tags=['auth'])

def _to_user(row):
    return {'uid': row['uid'], 'email': row['email'], 'displayName': row['display_name'], 'photoURL': row['photo_url'], 'idToken': secrets.token_urlsafe(24), 'refreshToken': secrets.token_urlsafe(24)}

@router.post('/register', status_code=201)
def register(body: dict):
    email = body.get('email'); password = body.get('password'); must(email,'email'); must(password,'password')
    uid = body.get('uid') or secrets.token_hex(12)
    try:
        q("INSERT INTO users(uid,email,password_hash,display_name,is_online) VALUES (%s,%s,%s,%s,true)", (uid,email,bcrypt.hash(password), body.get('displayName') or ''))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    row = q("SELECT * FROM users WHERE uid=%s", (uid,), fetch='one')
    return {'user': _to_user(row)}

@router.post('/login')
def login(body: dict):
    email = body.get('email'); password = body.get('password'); must(email,'email'); must(password,'password')
    row = q("SELECT * FROM users WHERE email=%s", (email,), fetch='one')
    if not row or not bcrypt.verify(password, row['password_hash']):
        raise HTTPException(status_code=400, detail='Invalid credentials')
    return {'user': _to_user(row)}

@router.post('/update-profile')
def update_profile(body: dict):
    uid = body.get('uid'); must(uid,'uid')
    q("UPDATE users SET display_name=%s, photo_url=%s, updated_at=now() WHERE uid=%s", (body.get('displayName') or '', body.get('photoURL') or '', uid))
    row = q("SELECT * FROM users WHERE uid=%s", (uid,), fetch='one')
    return {'user': _to_user(row)}
