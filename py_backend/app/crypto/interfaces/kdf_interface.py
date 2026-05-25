from __future__ import annotations

from abc import ABC, abstractmethod


class KdfInterface(ABC):
    @abstractmethod
    def derive(self, input_key_material: bytes, *, salt: bytes, info: bytes, length: int = 32) -> bytes:
        raise NotImplementedError
