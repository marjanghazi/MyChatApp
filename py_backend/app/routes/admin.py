from __future__ import annotations

import os
import re
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from jose import JWTError
from pydantic import BaseModel, ConfigDict
from psycopg2.errors import UniqueViolation

from app.db import q
from app.errors import phone_variants
from app.routes.users import _to_user_payload
from app.schemas.e2ee import SUITES
from app.security.jwt_service import JwtService

router = APIRouter(prefix='/api/admin', tags=['admin'])


class AdminUserPatch(BaseModel):
    model_config = ConfigDict(extra='forbid')
    displayName: str | None = None
    email: str | None = None
    phoneNumber: str | None = None


def _settings() -> tuple[str, str, JwtService]:
    email = os.getenv('ADMIN_EMAIL', '').strip().lower()
    password = os.getenv('ADMIN_PASSWORD', '')
    secret = os.getenv('JWT_SECRET', '')
    if not email or not password or len(secret) < 32 or secret.startswith('replace-with'):
        raise HTTPException(status_code=503, detail='Configure ADMIN_EMAIL, ADMIN_PASSWORD, and JWT_SECRET on the backend')
    ttl = int(os.getenv('JWT_TTL_MINUTES', '60'))
    return email, password, JwtService(secret=secret, ttl_minutes=ttl)


def authenticated_admin(authorization: str = Header(default='')) -> str:
    email, _, jwt_service = _settings()
    if not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='Admin sign in required')
    try:
        payload = jwt_service.decode(authorization[7:])
        if payload.get('scope') not in {'admin:read', 'admin:users:read'} or payload.get('sub') != email:
            raise JWTError('Invalid admin token')
    except JWTError as exc:
        raise HTTPException(status_code=401, detail='Admin session expired. Sign in again.') from exc
    return email


@router.post('/login')
def login(body: dict):
    email, password, jwt_service = _settings()
    supplied_email = str(body.get('email') or '').strip().lower()
    supplied_password = str(body.get('password') or '')
    if not (secrets.compare_digest(supplied_email, email) and secrets.compare_digest(supplied_password, password)):
        raise HTTPException(status_code=401, detail='Invalid admin credentials')
    q("INSERT INTO auth_events(account_id,event_type) VALUES (%s,'admin_login')", (email,))
    return {'token': jwt_service.issue_admin_token(email=email), 'email': email}


@router.get('/users')
def list_users(_admin_email: str = Depends(authenticated_admin)):
    rows = q(
        '''SELECT uid, email, display_name, phone_number, phone_lookup_keys,
                  contacts, is_online, last_seen, active_at, created_at,
                  updated_at, photo_url, logo_url
           FROM users ORDER BY created_at DESC, uid''',
        fetch='all',
    ) or []
    return {'users': [_to_user_payload(row) for row in rows]}


@router.patch('/users/{uid}')
def update_user(uid: str, body: AdminUserPatch, _admin_email: str = Depends(authenticated_admin)):
    supplied = body.model_dump(exclude_unset=True)
    if not supplied:
        raise HTTPException(status_code=400, detail='Provide a profile field to update')

    assignments = []
    params = []
    if 'displayName' in supplied:
        name = (body.displayName or '').strip()
        if len(name) > 100:
            raise HTTPException(status_code=400, detail='Display name is too long')
        assignments.append('display_name=%s')
        params.append(name)
    if 'email' in supplied:
        email = (body.email or '').strip().lower()
        if not re.fullmatch(r'[^@\s]+@[^@\s]+\.[^@\s]+', email):
            raise HTTPException(status_code=400, detail='Enter a valid email address')
        if email == os.getenv('ADMIN_EMAIL', '').strip().lower():
            raise HTTPException(status_code=400, detail='This email address is reserved for the admin account')
        assignments.append('email=%s')
        params.append(email)
    if 'phoneNumber' in supplied:
        variants = phone_variants(body.phoneNumber) if body.phoneNumber and body.phoneNumber.strip() else []
        assignments.extend(('phone_number=%s', 'phone_lookup_keys=%s'))
        params.extend((variants[0] if variants else '', variants))

    if not assignments:
        raise HTTPException(status_code=400, detail='Provide a valid profile field to update')
    try:
        row = q(
            f"UPDATE users SET {', '.join(assignments)}, updated_at=now() WHERE uid=%s RETURNING *",
            (*params, uid), fetch='one',
        )
    except UniqueViolation as exc:
        field = 'phone number' if 'phone' in (exc.diag.constraint_name or '') else 'email address'
        raise HTTPException(status_code=409, detail=f'This {field} is already used by another account') from exc
    if not row:
        raise HTTPException(status_code=404, detail='User not found')
    return {'user': _to_user_payload(row)}


@router.get('/crypto/overview')
def crypto_overview(_admin_email: str = Depends(authenticated_admin)):
    counts = q(
        '''SELECT
             (SELECT count(*) FROM crypto_public_identities WHERE suite_id='pqc') AS identities,
             (SELECT count(*) FROM messages WHERE thread_type='direct' AND body->>'suite_id'='pqc'
               AND body->>'protocol_version'='2.0') AS encrypted_messages,
             (SELECT count(*) FROM auth_events) AS auth_events''',
        fetch='one',
    )
    return {
        'counts': counts,
        'algorithms': {
            'keyExchange': SUITES['pqc']['kex'],
            'signature': SUITES['pqc']['signature'],
            'messageCipher': 'aes-256-gcm',
        },
        'loginSecurity': {'passwords': 'Argon2id hashes', 'sessions': 'HS256 JWT', 'pqcLogin': False},
    }


@router.get('/crypto/identities')
def crypto_identities(page: int = Query(1, ge=1), _admin_email: str = Depends(authenticated_admin)):
    page_size = 20
    total = q("SELECT count(*) AS total FROM crypto_public_identities WHERE suite_id='pqc'", fetch='one')['total']
    rows = q(
        """SELECT user_id, suite_id, device_id, bundle, updated_at
           FROM crypto_public_identities WHERE suite_id='pqc'
           ORDER BY updated_at DESC, user_id LIMIT %s OFFSET %s""",
        (page_size, (page - 1) * page_size), fetch='all',
    ) or []
    return {'items': rows, 'total': total, 'page': page, 'pageSize': page_size}


@router.get('/crypto/messages')
def crypto_messages(page: int = Query(1, ge=1), _admin_email: str = Depends(authenticated_admin)):
    page_size = 10
    where = "thread_type='direct' AND body->>'suite_id'='pqc' AND body->>'protocol_version'='2.0'"
    total = q(f'SELECT count(*) AS total FROM messages WHERE {where}', fetch='one')['total']
    rows = q(
        f'''SELECT id, thread_id, sender_id, receiver_id, created_at, edited_at, body AS envelope
            FROM messages WHERE {where} ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s''',
        (page_size, (page - 1) * page_size), fetch='all',
    ) or []
    return {'items': rows, 'total': total, 'page': page, 'pageSize': page_size}


@router.get('/crypto/logins')
def crypto_logins(page: int = Query(1, ge=1), _admin_email: str = Depends(authenticated_admin)):
    page_size = 20
    total = q('SELECT count(*) AS total FROM auth_events', fetch='one')['total']
    rows = q(
        '''SELECT e.id, e.account_id, COALESCE(u.email,e.account_id) AS email,
                  e.event_type, e.created_at
           FROM auth_events e LEFT JOIN users u ON u.uid=e.account_id
           ORDER BY e.created_at DESC, e.id DESC LIMIT %s OFFSET %s''',
        (page_size, (page - 1) * page_size), fetch='all',
    ) or []
    return {'items': rows, 'total': total, 'page': page, 'pageSize': page_size}


@router.post('/live/{uid}/start')
def start_live_demo(uid: str, _admin_email: str = Depends(authenticated_admin)):
    if not q('SELECT uid FROM users WHERE uid=%s', (uid,), fetch='one'):
        raise HTTPException(status_code=404, detail='User not found')
    q('DELETE FROM crypto_demo_events WHERE user_id=%s', (uid,))
    row = q(
        '''INSERT INTO crypto_demo_sessions(user_id,started_at,active_until)
           VALUES (%s, now(), now() + interval '10 minutes')
           ON CONFLICT (user_id) DO UPDATE SET started_at=EXCLUDED.started_at,
             active_until=EXCLUDED.active_until RETURNING active_until''',
        (uid,), fetch='one',
    )
    return {'activeUntil': row['active_until']}


@router.post('/live/{uid}/stop')
def stop_live_demo(uid: str, _admin_email: str = Depends(authenticated_admin)):
    q('UPDATE crypto_demo_sessions SET active_until=now() WHERE user_id=%s', (uid,))
    return {'ok': True}


@router.post('/registration-live/start')
def start_registration_demo(_admin_email: str = Depends(authenticated_admin)):
    row = q(
        '''INSERT INTO crypto_demo_registration_capture(id,started_at,active_until)
           VALUES (TRUE,now(),now() + interval '10 minutes')
           ON CONFLICT (id) DO UPDATE SET started_at=EXCLUDED.started_at,
             active_until=EXCLUDED.active_until RETURNING active_until''',
        fetch='one',
    )
    return {'activeUntil': row['active_until']}


@router.post('/registration-live/stop')
def stop_registration_demo(_admin_email: str = Depends(authenticated_admin)):
    q('UPDATE crypto_demo_registration_capture SET active_until=now() WHERE id=TRUE')
    return {'ok': True}


def _live_snapshot(uid: str, started_at, active_until):
    identity = q(
        "SELECT device_id, bundle, updated_at FROM crypto_public_identities WHERE user_id=%s AND suite_id='pqc'",
        (uid,), fetch='one',
    )
    rows = q(
        '''SELECT id, flow_id, kind, step, status, detail, sequence, duration_ms, metrics, created_at
           FROM crypto_demo_events WHERE user_id=%s AND created_at >= %s
           ORDER BY id DESC LIMIT 100''',
        (uid, started_at), fetch='all',
    ) or []
    latest_message = q(
        '''SELECT id, sender_id, receiver_id, created_at, body AS envelope
           FROM messages WHERE thread_type='direct' AND body->>'suite_id'='pqc'
             AND body->>'protocol_version'='2.0'
             AND (sender_id=%s OR receiver_id=%s) AND created_at >= %s
           ORDER BY created_at DESC, id DESC LIMIT 1''',
        (uid, uid, started_at), fetch='one',
    )
    return {
        'activeUntil': active_until,
        'publicIdentity': identity,
        'events': list(reversed(rows)),
        'latestMessage': latest_message,
    }


@router.get('/registration-live')
def get_registration_demo(_admin_email: str = Depends(authenticated_admin)):
    capture = q('SELECT started_at,active_until FROM crypto_demo_registration_capture WHERE id=TRUE', fetch='one')
    if not capture:
        return {'activeUntil': None, 'publicIdentity': None, 'latestMessage': None, 'events': [], 'capturedUser': None}
    user = q(
        '''SELECT u.uid,u.email,u.display_name FROM auth_events a
           JOIN users u ON u.uid=a.account_id
           WHERE a.event_type='register' AND a.created_at >= %s
           ORDER BY a.created_at ASC LIMIT 1''',
        (capture['started_at'],), fetch='one',
    )
    if not user:
        return {'activeUntil': capture['active_until'], 'publicIdentity': None,
                'latestMessage': None, 'events': [], 'capturedUser': None}
    return {**_live_snapshot(user['uid'], capture['started_at'], capture['active_until']),
            'capturedUser': user}


@router.get('/live/{uid}')
def get_live_demo(uid: str, _admin_email: str = Depends(authenticated_admin)):
    session = q('SELECT started_at,active_until FROM crypto_demo_sessions WHERE user_id=%s', (uid,), fetch='one')
    if not session:
        return {'activeUntil': None, 'publicIdentity': None, 'events': [], 'latestMessage': None}
    return _live_snapshot(uid, session['started_at'], session['active_until'])
