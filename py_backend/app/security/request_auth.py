"""Bearer authentication shared by the crypto registry and message relay."""
import os
from fastapi import Header, HTTPException
from jose import JWTError
from app.security.jwt_service import JwtService


def authenticated_user(authorization: str = Header(default='')) -> str:
    if not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail='Sign in to continue')
    secret = os.getenv('JWT_SECRET', '')
    if len(secret) < 32 or secret.startswith('replace-with'):
        raise HTTPException(status_code=503, detail='Configure JWT_SECRET on the Python backend')
    try:
        payload = JwtService(secret=secret).decode(authorization[7:])
        if not payload.get('sub') or payload.get('scope') != 'chat:access':
            raise JWTError('Invalid access token')
        return payload['sub']
    except JWTError as exc:
        raise HTTPException(status_code=401, detail='Session expired. Please sign in again.') from exc
