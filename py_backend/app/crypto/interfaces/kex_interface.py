from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class KeyPair:
    private_key: bytes
    public_key: bytes


class KexInterface(ABC):
    algorithm_id: str

    @abstractmethod
    def generate_keypair(self) -> KeyPair:
        raise NotImplementedError

    @abstractmethod
    def derive_shared_secret(self, private_key: bytes, peer_public_key: bytes) -> bytes:
        raise NotImplementedError
