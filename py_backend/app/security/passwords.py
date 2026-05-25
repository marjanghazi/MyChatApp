from __future__ import annotations

from passlib.hash import argon2


class PasswordHasher:
    def hash(self, password: str) -> str:
        return argon2.using(type='ID', rounds=3, memory_cost=65536, parallelism=2).hash(password)

    def verify(self, password: str, hashed_password: str) -> bool:
        return argon2.verify(password, hashed_password)
