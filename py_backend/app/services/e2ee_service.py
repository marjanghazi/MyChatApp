from __future__ import annotations

from app.crypto.implementations.aes256gcm import Aes256Gcm
from app.crypto.implementations.hkdf_sha256 import HkdfSha256
from app.crypto.implementations.x25519_kex import X25519Kex
from app.crypto.orchestration.crypto_suite import CryptoSuite


class E2EEService:
    """Application-facing crypto service.

    Keep WebSocket/database layers decoupled: they pass opaque bytes/envelopes only.
    """

    def __init__(self) -> None:
        self.suite = CryptoSuite(kex=X25519Kex(), kdf=HkdfSha256(), aead=Aes256Gcm())

    @property
    def kex_algorithm(self) -> str:
        return self.suite.kex.algorithm_id
