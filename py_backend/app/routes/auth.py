from __future__ import annotations

import os
import httpx
from fastapi import APIRouter, HTTPException

from app.errors import must

router = APIRouter(prefix='/api/auth', tags=['auth'])


def firebase_web_api_key() -> str:
    return (
        os.getenv('FIREBASE_WEB_API_KEY')
        or os.getenv('FIREBASE_API_KEY')
        or os.getenv('REACT_APP_FIREBASE_API_KEY')
        or ''
    )


def to_user(data: dict) -> dict:
    return {
        'uid': data.get('localId'),
        'email': data.get('email'),
        'displayName': data.get('displayName') or '',
        'photoURL': data.get('photoUrl') or '',
        'idToken': data.get('idToken'),
        'refreshToken': data.get('refreshToken'),
    }


async def auth_request(path: str, payload: dict) -> dict:
    api_key = firebase_web_api_key()
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail='Firebase Web API key is missing. Set FIREBASE_WEB_API_KEY, FIREBASE_API_KEY, or REACT_APP_FIREBASE_API_KEY.',
        )

    url = f'https://identitytoolkit.googleapis.com/v1/{path}?key={api_key}'
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(url, json=payload)
    data = resp.json()
    if resp.status_code >= 400:
        message = (data.get('error') or {}).get('message') or 'Authentication request failed.'
        raise HTTPException(status_code=400, detail=message)
    return data


@router.post('/register', status_code=201)
async def register(body: dict):
    email = body.get('email')
    password = body.get('password')
    display_name = (body.get('displayName') or '').strip()
    must(email, 'email')
    must(password, 'password')

    data = await auth_request('accounts:signUp', {'email': email, 'password': password, 'returnSecureToken': True})
    final = data
    if display_name:
        final = await auth_request(
            'accounts:update',
            {'idToken': data.get('idToken'), 'displayName': display_name, 'returnSecureToken': True},
        )
    return {'user': to_user(final)}


@router.post('/login')
async def login(body: dict):
    email = body.get('email')
    password = body.get('password')
    must(email, 'email')
    must(password, 'password')
    data = await auth_request('accounts:signInWithPassword', {'email': email, 'password': password, 'returnSecureToken': True})
    return {'user': to_user(data)}


@router.post('/update-profile')
async def update_profile(body: dict):
    id_token = body.get('idToken')
    must(id_token, 'idToken')
    data = await auth_request(
        'accounts:update',
        {
            'idToken': id_token,
            'displayName': body.get('displayName') or '',
            'photoUrl': body.get('photoURL') or '',
            'returnSecureToken': True,
        },
    )
    return {'user': to_user(data)}
