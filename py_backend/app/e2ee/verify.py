from __future__ import annotations

import base64
import json
from typing import Any

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, utils


def _b64decode(data: str) -> bytes:
    return base64.b64decode(data.encode("utf-8"))


def _b64url_to_int(value: str) -> int:
    padding = "=" * (-len(value) % 4)
    return int.from_bytes(base64.urlsafe_b64decode((value + padding).encode("utf-8")), "big")


def _jwk_to_public_key(jwk: dict[str, Any]) -> ec.EllipticCurvePublicKey:
    if jwk.get("kty") != "EC" or jwk.get("crv") != "P-256":
        raise ValueError("Unsupported JWK key type/curve")
    x = _b64url_to_int(jwk["x"])
    y = _b64url_to_int(jwk["y"])
    pub_numbers = ec.EllipticCurvePublicNumbers(x, y, ec.SECP256R1())
    return pub_numbers.public_key()


def _signing_transcript(encrypted: dict[str, Any]) -> bytes:
    parts = [
        encrypted.get("ciphertext", ""),
        encrypted.get("nonce", ""),
        encrypted.get("salt", ""),
        encrypted.get("kem", ""),
        encrypted.get("aead", ""),
        encrypted.get("kdf", ""),
        encrypted.get("sig", ""),
        str(encrypted.get("version", "")),
    ]
    return ".".join(parts).encode("utf-8")


def verify_envelope_signature(encrypted: dict[str, Any], trusted_signing_jwk_json: str) -> bool:
    claimed_key = json.loads(base64.b64decode(encrypted["keyId"]).decode("utf-8"))
    trusted_key = json.loads(trusted_signing_jwk_json)
    if claimed_key != trusted_key:
        return False

    public_key = _jwk_to_public_key(trusted_key)
    signature = _b64decode(encrypted["signature"])
    message = _signing_transcript(encrypted)
    try:
        try:
            public_key.verify(signature, message, ec.ECDSA(hashes.SHA256()))
            return True
        except Exception:
            # WebCrypto ECDSA may return raw P1363 (r||s) instead of DER.
            if len(signature) == 64:
                r = int.from_bytes(signature[:32], "big")
                s = int.from_bytes(signature[32:], "big")
                der_sig = utils.encode_dss_signature(r, s)
                public_key.verify(der_sig, message, ec.ECDSA(hashes.SHA256()))
                return True
            raise
    except Exception:
        return False


def verify_signed_prekey(signing_public_jwk_json: str, signed_prekey_payload: str, signature_b64: str) -> bool:
    try:
        trusted_key = json.loads(signing_public_jwk_json)
        public_key = _jwk_to_public_key(trusted_key)
        signature = _b64decode(signature_b64)
        message = signed_prekey_payload.encode("utf-8")
        try:
            public_key.verify(signature, message, ec.ECDSA(hashes.SHA256()))
            return True
        except Exception:
            if len(signature) == 64:
                r = int.from_bytes(signature[:32], "big")
                s = int.from_bytes(signature[32:], "big")
                der_sig = utils.encode_dss_signature(r, s)
                public_key.verify(der_sig, message, ec.ECDSA(hashes.SHA256()))
                return True
            raise
    except Exception:
        return False
