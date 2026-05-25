from __future__ import annotations

from pydantic import BaseModel, Field


class KeyBundleResponse(BaseModel):
    user_id: str
    device_id: str
    kex_algorithm: str = Field(default='x25519')
    identity_public_key_b64: str
    signed_prekey_public_key_b64: str
    signed_prekey_signature_b64: str


class EncryptedEnvelope(BaseModel):
    protocol_version: str = '1.0'
    thread_id: str
    sender_device_id: str
    recipient_device_id: str
    session_id: str
    nonce_b64: str
    ciphertext_b64: str
    aad_b64: str
