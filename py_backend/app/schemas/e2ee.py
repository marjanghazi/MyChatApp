"""Public protocol v2 contracts. Secret key material is never accepted by the relay."""
import base64
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

SUITES = {
    # Classical suite retained only as historical reference; the API rejects it.
    # 'classical': {'kex': 'x25519', 'signature': 'ed25519', 'public': 32, 'sign_public': 32, 'sig': 64, 'kem': 32},
    'pqc': {'kex': 'ml-kem-768', 'signature': 'ml-dsa-65', 'public': 1184, 'sign_public': 1952, 'sig': 3309, 'kem': 1088},
}

def check_b64(value: str, size: int | None = None, maximum: int = 2_000_000) -> bytes:
    if len(value) > maximum * 2:
        raise ValueError('Encoded field too large')
    try:
        raw = base64.b64decode(value, validate=True)
    except Exception as exc:
        raise ValueError('Invalid base64') from exc
    if base64.b64encode(raw).decode() != value or len(raw) > maximum or (size is not None and len(raw) != size):
        raise ValueError('Invalid encoded field length or encoding')
    return raw

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')

class KeyBundle(StrictModel):
    protocol_version: Literal['2.0']
    suite_id: Literal['pqc']
    user_id: str = Field(min_length=1, max_length=128)
    device_id: str = Field(min_length=1, max_length=128)
    encryption_public_key_b64: str
    signing_public_key_b64: str
    signature_b64: str

    @model_validator(mode='after')
    def validate_material(self):
        suite = SUITES[self.suite_id]
        check_b64(self.encryption_public_key_b64, suite['public'])
        check_b64(self.signing_public_key_b64, suite['sign_public'])
        check_b64(self.signature_b64, suite['sig'])
        return self

class RegisterBundles(StrictModel):
    bundles: list[KeyBundle] = Field(min_length=1, max_length=1)

    @model_validator(mode='after')
    def validate_pqc_suite(self):
        if {b.suite_id for b in self.bundles} != set(SUITES):
            raise ValueError('Register exactly one PQC identity')
        return self

class KeyWrap(StrictModel):
    user_id: str = Field(min_length=1, max_length=128)
    device_id: str = Field(min_length=1, max_length=128)
    kem_ciphertext_b64: str
    nonce_b64: str
    wrapped_key_b64: str

class EncryptedEnvelope(StrictModel):
    protocol_version: Literal['2.0']
    suite_id: Literal['pqc']
    kex_algorithm: str
    signature_algorithm: str
    kdf_algorithm: Literal['hkdf-sha256']
    cipher: Literal['aes-256-gcm']
    type: Literal['e2ee']
    thread_id: str = Field(min_length=1, max_length=256)
    sender_user_id: str = Field(min_length=1, max_length=128)
    recipient_user_id: str = Field(min_length=1, max_length=128)
    sender_device_id: str
    recipient_device_id: str
    session_id: str
    message_id: str
    sender_bundle: KeyBundle
    key_wraps: list[KeyWrap] = Field(min_length=1, max_length=2)
    nonce_b64: str
    ciphertext_b64: str
    aad_b64: str
    signature_b64: str

    @model_validator(mode='after')
    def validate_envelope(self):
        suite = SUITES[self.suite_id]
        UUID(self.message_id)
        if self.session_id != self.message_id or self.kex_algorithm != suite['kex'] or self.signature_algorithm != suite['signature']:
            raise ValueError('Suite or message identifier mismatch')
        bundle = self.sender_bundle
        if (bundle.user_id, bundle.device_id, bundle.suite_id) != (self.sender_user_id, self.sender_device_id, self.suite_id):
            raise ValueError('Sender bundle mismatch')
        expected = {(self.sender_user_id, self.sender_device_id), (self.recipient_user_id, self.recipient_device_id)}
        if len(self.key_wraps) != len(expected) or {(w.user_id, w.device_id) for w in self.key_wraps} != expected:
            raise ValueError('Key wrap participants mismatch')
        for wrap in self.key_wraps:
            check_b64(wrap.kem_ciphertext_b64, suite['kem'])
            check_b64(wrap.nonce_b64, 12)
            check_b64(wrap.wrapped_key_b64, 48)
        check_b64(self.nonce_b64, 12)
        if len(check_b64(self.ciphertext_b64)) < 16:
            raise ValueError('Ciphertext is too short')
        check_b64(self.aad_b64, maximum=40_000)
        check_b64(self.signature_b64, suite['sig'])
        return self
