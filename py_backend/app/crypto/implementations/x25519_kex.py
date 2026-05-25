from __future__ import annotations

from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat, PrivateFormat, NoEncryption

from app.crypto.interfaces.kex_interface import KeyPair, KexInterface


class X25519Kex(KexInterface):
    algorithm_id = 'x25519'

    def generate_keypair(self) -> KeyPair:
        private = X25519PrivateKey.generate()
        public = private.public_key()
        return KeyPair(
            private_key=private.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption()),
            public_key=public.public_bytes(Encoding.Raw, PublicFormat.Raw),
        )

    def derive_shared_secret(self, private_key: bytes, peer_public_key: bytes) -> bytes:
        private = X25519PrivateKey.from_private_bytes(private_key)
        peer = X25519PublicKey.from_public_bytes(peer_public_key)
        return private.exchange(peer)
