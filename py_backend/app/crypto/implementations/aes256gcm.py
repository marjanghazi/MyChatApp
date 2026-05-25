from __future__ import annotations

import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.crypto.interfaces.aead_interface import AeadInterface, EncryptedMessage


class Aes256Gcm(AeadInterface):
    NONCE_SIZE = 12

    def encrypt(self, key: bytes, plaintext: bytes, aad: bytes) -> EncryptedMessage:
        nonce = os.urandom(self.NONCE_SIZE)
        ciphertext = AESGCM(key).encrypt(nonce, plaintext, aad)
        return EncryptedMessage(nonce=nonce, ciphertext=ciphertext)

    def decrypt(self, key: bytes, nonce: bytes, ciphertext: bytes, aad: bytes) -> bytes:
        return AESGCM(key).decrypt(nonce, ciphertext, aad)
