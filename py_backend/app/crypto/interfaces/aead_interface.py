from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class EncryptedMessage:
    nonce: bytes
    ciphertext: bytes


class AeadInterface(ABC):
    @abstractmethod
    def encrypt(self, key: bytes, plaintext: bytes, aad: bytes) -> EncryptedMessage:
        raise NotImplementedError

    @abstractmethod
    def decrypt(self, key: bytes, nonce: bytes, ciphertext: bytes, aad: bytes) -> bytes:
        raise NotImplementedError
