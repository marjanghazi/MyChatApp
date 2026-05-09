from __future__ import annotations

from typing import Any

from fastapi import HTTPException

REQUIRED_ENCRYPTED_FIELDS = ('ciphertext', 'nonce', 'version', 'kem', 'aead', 'kdf', 'sig', 'salt', 'signature', 'keyId', 'protocol', 'messageId', 'sessionId', 'msgIndex')
OPTIONAL_ENCRYPTED_FIELDS = ('aad', 'senderDeviceId', 'ephemeralPubKey')
ALLOWED_ENCRYPTION_ALGORITHMS = {'X25519+AES-256-GCM', 'P256+AES-256-GCM'}
ALLOWED_KEM = {'ECDH-P256', 'X25519'}
ALLOWED_AEAD = {'AES-256-GCM', 'CHACHA20-POLY1305'}
ALLOWED_KDF = {'HKDF-SHA256'}
ALLOWED_SIG = {'ECDSA-P256-SHA256', 'ED25519'}


def sanitize_encrypted_payload(payload: dict[str, Any]) -> dict[str, Any]:
    encrypted = payload.get('encrypted')
    if not isinstance(encrypted, dict):
        raise HTTPException(status_code=400, detail='payload.encrypted is required for E2EE')

    missing = [key for key in REQUIRED_ENCRYPTED_FIELDS if not encrypted.get(key)]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing encrypted payload fields: {', '.join(missing)}")

    legacy_algorithm = encrypted.get('algorithm')
    if legacy_algorithm and legacy_algorithm not in ALLOWED_ENCRYPTION_ALGORITHMS:
        raise HTTPException(status_code=400, detail='Unsupported E2EE algorithm')

    if encrypted.get('kem') not in ALLOWED_KEM:
        raise HTTPException(status_code=400, detail='Unsupported E2EE KEM suite')
    if encrypted.get('aead') not in ALLOWED_AEAD:
        raise HTTPException(status_code=400, detail='Unsupported E2EE AEAD suite')
    if encrypted.get('kdf') not in ALLOWED_KDF:
        raise HTTPException(status_code=400, detail='Unsupported E2EE KDF suite')
    if encrypted.get('sig') not in ALLOWED_SIG:
        raise HTTPException(status_code=400, detail='Unsupported E2EE signature suite')

    if payload.get('text') or payload.get('fileURL'):
        raise HTTPException(status_code=400, detail='Plaintext fields are not allowed in E2EE mode')

    allowed = set(REQUIRED_ENCRYPTED_FIELDS) | set(OPTIONAL_ENCRYPTED_FIELDS)
    return {key: encrypted.get(key) for key in allowed if encrypted.get(key) is not None}
