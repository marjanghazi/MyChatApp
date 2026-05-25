# E2EE Implementation Guide (Current State)

This document explains **what algorithms are implemented right now**, where they are implemented, and how the end-to-end flow works in this repository.

## 1) Implemented Algorithms and Purpose

| Security Layer | Algorithm | Where Used | Purpose |
|---|---|---|---|
| Key Exchange (KEX) | X25519 | Frontend WebCrypto + backend interface implementation | Derive shared secret material between devices |
| Key Derivation (KDF) | HKDF-SHA256 | Frontend session/chain derivations + backend implementation | Expand shared secret into AEAD/session keys |
| Message Encryption (AEAD) | AES-256-GCM | Frontend envelope encryption/decryption + backend implementation interface | Confidentiality + integrity/authentication of message payloads |
| Password Hashing | Argon2id | Backend auth/password service | Secure password storage |
| Token/Auth | JWT (HS256) | Backend JWT service/auth routes | Stateless API auth token |
| Randomness | OS CSPRNG / WebCrypto RNG | Python crypto + browser `crypto.getRandomValues` | Nonces/IDs/key material generation |
| Signatures (bundle authenticity) | Ed25519 (frontend-side signing/verification helper) | Device key bundle signing checks | Detect signed prekey tampering in current client flow |

> Note: The core E2EE message pipeline currently running is `X25519 -> HKDF-SHA256 -> AES-256-GCM`.

---

## 2) Where each algorithm is implemented

## Backend (FastAPI, Python)
- `py_backend/app/crypto/interfaces/kex_interface.py` – KEX abstraction contract.
- `py_backend/app/crypto/interfaces/kdf_interface.py` – KDF abstraction contract.
- `py_backend/app/crypto/interfaces/aead_interface.py` – AEAD abstraction contract.
- `py_backend/app/crypto/implementations/x25519_kex.py` – X25519 concrete implementation.
- `py_backend/app/crypto/implementations/hkdf_sha256.py` – HKDF-SHA256 implementation.
- `py_backend/app/crypto/implementations/aes256gcm.py` – AES-256-GCM implementation.
- `py_backend/app/security/passwords.py` – Argon2id hashing/verification.
- `py_backend/app/security/jwt_service.py` – JWT issue/verify.

## Frontend (React, browser WebCrypto)
- `frontend/src/services/e2eeService.js` – device key mgmt, session/ratchet chain, envelope encrypt/decrypt.
- `frontend/src/services/chatService.js` – encrypt-before-send and decrypt-on-fetch.
- `frontend/src/services/threadService.js` – sidebar preview hydration (decrypt last message preview).

---

## 3) End-to-End message flow

1. Sender client prepares plaintext.
2. Sender client derives/loads session chain key state.
3. Sender client derives per-message key for `msg_counter`.
4. Sender client encrypts plaintext with AES-256-GCM using a unique nonce and AAD metadata.
5. Sender sends envelope to backend (`ciphertext_b64`, `nonce_b64`, `aad_b64`, counters/device/session metadata).
6. Backend stores/transports envelope only (no plaintext decryption path).
7. Receiver fetches envelope and derives corresponding key from ratchet/session state.
8. Receiver decrypts envelope client-side and renders plaintext.
9. Sidebar preview uses same decrypt helper to replace placeholders with plaintext preview.

---

## 4) Crypto-agility / PQC migration path

The design already has backend crypto interfaces. To migrate:

- keep `KdfInterface` + `AeadInterface` unchanged,
- add new `KexInterface` implementations (e.g., ML-KEM/FrodoKEM/hybrid),
- switch suite wiring to new KEX adapter,
- preserve message envelope schema where possible.

This gives the intended path:
`Classical (X25519) -> Hybrid (X25519 + PQC) -> Full PQC`.

---

## 5) Important current operational notes

- Existing historical messages created with older experimental state may remain undecryptable if both endpoints did not share stable state at send time.
- Newly exchanged messages after both clients are synchronized should decrypt correctly.
- If decryption drifts, reset/re-establish session for the thread on both sides.

---

## 6) Why we are not adding "comment every single line"

Adding comments to every line across all files would:
- create heavy noise and reduce readability,
- become outdated quickly,
- make security review harder.

Recommended approach used here:
- module-level documentation,
- function-level intent comments/docstrings,
- architecture + flow docs (this file + blueprint files).



## 11) PQC migration file map

For a concrete file-by-file migration checklist, see `PQC_MIGRATION_PLAYBOOK.md`.
This includes backend and frontend files to change for Classical -> Hybrid -> Full PQC transition.
