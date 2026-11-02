"""Opt-in, metadata-only progress for the admin's live protocol walkthrough."""
from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from psycopg2.extras import Json

from app.db import q
from app.security.request_auth import authenticated_user

router = APIRouter(prefix='/api/crypto', tags=['crypto activity'])

STEPS = {
    'register': {'auth', 'kem', 'dsa', 'identity_sign', 'bundle'},
    'login': {'auth', 'kem', 'dsa', 'identity_sign', 'bundle'},
    'identity': {'kem', 'dsa', 'identity_sign', 'bundle'},
    'send': {'kem', 'kdf', 'aes', 'dsa', 'relay'},
    'receive': {'dsa', 'kem', 'kdf', 'aes'},
    'attachment': {'aes', 'relay'},
}
METRIC_KEYS = {
    'auth': set(),
    'kem': {'publicKeyBytes', 'privateKeyBytes', 'kemCiphertextBytes', 'wrapCount'},
    'dsa': {'publicKeyBytes', 'privateKeyBytes', 'signatureBytes'},
    'identity_sign': {'signatureBytes'},
    'bundle': {'bundleBytes'},
    'kdf': {'wrappedKeyBytes', 'wrapCount'},
    'aes': {'plaintextBytes', 'ciphertextBytes', 'nonceBytes'},
    'relay': {'envelopeBytes'},
}


class ActivityMetrics(BaseModel):
    model_config = ConfigDict(extra='forbid')
    publicKeyBytes: int | None = Field(default=None, ge=0, le=20_000_000)
    privateKeyBytes: int | None = Field(default=None, ge=0, le=20_000_000)
    kemCiphertextBytes: int | None = Field(default=None, ge=0, le=20_000_000)
    signatureBytes: int | None = Field(default=None, ge=0, le=20_000_000)
    wrappedKeyBytes: int | None = Field(default=None, ge=0, le=20_000_000)
    plaintextBytes: int | None = Field(default=None, ge=0, le=20_000_000)
    ciphertextBytes: int | None = Field(default=None, ge=0, le=20_000_000)
    nonceBytes: int | None = Field(default=None, ge=0, le=20_000_000)
    bundleBytes: int | None = Field(default=None, ge=0, le=20_000_000)
    envelopeBytes: int | None = Field(default=None, ge=0, le=20_000_000)
    wrapCount: int | None = Field(default=None, ge=0, le=2)


class CryptoActivity(BaseModel):
    model_config = ConfigDict(extra='forbid')
    flowId: UUID
    kind: Literal['register', 'login', 'identity', 'send', 'receive', 'attachment']
    step: str | None = None
    status: Literal['start', 'active', 'done', 'complete', 'error']
    detail: Literal['generated', 'reused'] | None = None
    sequence: int = Field(ge=0, le=30)
    durationMs: float | None = Field(default=None, ge=0, le=600_000, allow_inf_nan=False)
    metrics: ActivityMetrics | None = None


@router.post('/activity')
def record_activity(body: CryptoActivity, user_id: str = Depends(authenticated_user)):
    if body.status in {'start', 'complete', 'error'}:
        valid = body.step is None and body.detail is None and body.metrics is None
    else:
        valid = body.step in STEPS[body.kind]
        if body.detail is not None:
            valid = valid and body.kind in {'register', 'login', 'identity'} and body.step in {'kem', 'dsa', 'identity_sign'} and body.status == 'done'
    if body.metrics is not None:
        metric_names = set(body.metrics.model_dump(exclude_none=True))
        valid = valid and body.status == 'done' and metric_names <= METRIC_KEYS.get(body.step, set())
    if body.durationMs is not None and body.status not in {'done', 'complete', 'error'}:
        valid = False
    if not valid:
        raise HTTPException(status_code=422, detail='Invalid cryptography stage')
    row = q(
        '''INSERT INTO crypto_demo_events(user_id, flow_id, kind, step, status, detail, sequence, duration_ms, metrics)
           SELECT %s,%s,%s,%s,%s,%s,%s,%s,%s
           WHERE EXISTS (SELECT 1 FROM crypto_demo_sessions WHERE user_id=%s AND active_until > now())
              OR EXISTS (
                SELECT 1 FROM crypto_demo_registration_capture c
                WHERE c.id=TRUE AND c.active_until > now() AND %s = (
                  SELECT a.account_id FROM auth_events a
                  WHERE a.event_type='register' AND a.created_at >= c.started_at
                  ORDER BY a.created_at ASC LIMIT 1
                )
              ) RETURNING id''',
        (user_id, str(body.flowId), body.kind, body.step, body.status, body.detail,
         body.sequence, body.durationMs,
         Json(body.metrics.model_dump(exclude_none=True) if body.metrics else {}),
         user_id, user_id), fetch='one',
    )
    return {'recorded': bool(row)}
