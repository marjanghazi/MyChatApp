from __future__ import annotations

from datetime import datetime, timedelta, timezone

from jose import jwt


class JwtService:
    def __init__(self, secret: str, algorithm: str = 'HS256', ttl_minutes: int = 15):
        self.secret = secret
        self.algorithm = algorithm
        self.ttl_minutes = ttl_minutes

    def issue_access_token(self, *, user_id: str, device_id: str) -> str:
        now = datetime.now(timezone.utc)
        payload = {
            'sub': user_id,
            'did': device_id,
            'iat': int(now.timestamp()),
            'exp': int((now + timedelta(minutes=self.ttl_minutes)).timestamp()),
            'scope': 'chat:access',
        }
        return jwt.encode(payload, self.secret, algorithm=self.algorithm)

    def issue_admin_token(self, *, email: str) -> str:
        now = datetime.now(timezone.utc)
        payload = {
            'sub': email,
            'iat': int(now.timestamp()),
            'exp': int((now + timedelta(minutes=self.ttl_minutes)).timestamp()),
            'scope': 'admin:read',
        }
        return jwt.encode(payload, self.secret, algorithm=self.algorithm)

    def decode(self, token: str) -> dict:
        return jwt.decode(token, self.secret, algorithms=[self.algorithm], options={'require_exp': True, 'require_iat': True, 'require_sub': True})
