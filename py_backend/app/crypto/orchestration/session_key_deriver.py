from __future__ import annotations

import os

from app.crypto.interfaces.kdf_interface import KdfInterface


def derive_session_key(shared_secret: bytes, kdf: KdfInterface, *, session_context: str) -> tuple[bytes, bytes]:
    salt = os.urandom(32)
    info = f'chat/v1/session/{session_context}'.encode('utf-8')
    key = kdf.derive(shared_secret, salt=salt, info=info, length=32)
    return key, salt
