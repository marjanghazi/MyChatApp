from __future__ import annotations

from typing import Any

from fastapi import HTTPException

REQUIRED_ENCRYPTED_FIELDS = ('ciphertext', 'nonce', 'algorithm', 'version')
OPTIONAL_ENCRYPTED_FIELDS = ('aad', 'senderDeviceId', 'keyId', 'ephemeralPubKey', 'signature')
ALLOWED_ENCRYPTION_ALGORITHMS = {'X25519+AES-256-GCM'}


def sanitize_encrypted_payload(payload: dict[str, Any]) -> dict[str, Any]:
    encrypted = payload.get('encrypted')
    if not isinstance(encrypted, dict):
        raise HTTPException(status_code=400, detail='payload.encrypted is required for E2EE')

    missing = [key for key in REQUIRED_ENCRYPTED_FIELDS if not encrypted.get(key)]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing encrypted payload fields: {', '.join(missing)}")

    if encrypted.get('algorithm') not in ALLOWED_ENCRYPTION_ALGORITHMS:
        raise HTTPException(status_code=400, detail='Unsupported E2EE algorithm')

    if payload.get('text') or payload.get('fileURL'):
        raise HTTPException(status_code=400, detail='Plaintext fields are not allowed in E2EE mode')

    allowed = set(REQUIRED_ENCRYPTED_FIELDS) | set(OPTIONAL_ENCRYPTED_FIELDS)
    return {key: encrypted.get(key) for key in allowed if encrypted.get(key) is not None}
