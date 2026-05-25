from __future__ import annotations

from dataclasses import dataclass

from app.crypto.interfaces.aead_interface import AeadInterface
from app.crypto.interfaces.kdf_interface import KdfInterface
from app.crypto.interfaces.kex_interface import KexInterface


@dataclass
class CryptoSuite:
    kex: KexInterface
    kdf: KdfInterface
    aead: AeadInterface
    suite_id: str = 'x25519_hkdfsha256_aes256gcm_v1'
