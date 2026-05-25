from __future__ import annotations

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.crypto.interfaces.kdf_interface import KdfInterface


class HkdfSha256(KdfInterface):
    def derive(self, input_key_material: bytes, *, salt: bytes, info: bytes, length: int = 32) -> bytes:
        hkdf = HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info)
        return hkdf.derive(input_key_material)
