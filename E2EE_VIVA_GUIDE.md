# E2EE Viva / FYP Defense Guide

## 1) One-line project security statement

This chat system uses **client-side end-to-end encryption** where plaintext is encrypted in the browser before transmission and the backend stores only encrypted envelopes.

---

## 2) Implemented crypto stack (current)

- **Key Exchange (KEX): X25519**
- **Key Derivation: HKDF-SHA256**
- **Authenticated Encryption: AES-256-GCM**
- **Password Hashing: Argon2id**
- **Authentication Token: JWT**
- **Randomness:** WebCrypto/Python CSPRNG

Pipeline used for message secrecy:

`X25519 -> HKDF-SHA256 -> AES-256-GCM`

---

## 3) Why this is E2EE

1. Sender encrypts plaintext locally on device.
2. Network/backend receive ciphertext envelope only.
3. Receiver decrypts locally with derived message key.
4. Backend never runs plaintext decryption for chat bodies.

---

## 4) High-level sequence (direct chat)

1. Device bundle registration (`/api/keys/devices/register`)
2. Sender resolves recipient bundle (`/api/keys/bundle/{user}/{device}`)
3. Sender prepares envelope (nonce + aad + ciphertext + counters)
4. Sender posts envelope (`/api/chat/messages/send`)
5. Receiver fetches messages (`/api/chat/messages?...`)
6. Receiver derives key and decrypts client-side
7. Replay markers checked/updated (`/api/keys/replay/check`, `/api/keys/replay/mark`)

---

## 5) What each critical module does

### Frontend
- `frontend/src/services/e2eeService.js`
  - key material handling
  - envelope encryption/decryption
  - ratchet/session logic
  - safety-number fingerprint helper

- `frontend/src/services/chatService.js`
  - encrypt-before-send
  - decrypt-on-fetch
  - recovery/reset path for state drift

- `frontend/src/services/threadService.js`
  - decrypts sidebar preview placeholders

### Backend
- `py_backend/app/routes/keys.py`
  - key bundle, prekey, session, replay APIs
  - metadata persistence only

- `py_backend/app/routes/chat.py`
  - envelope validation
  - E2EE-required mode enforcement
  - message metadata persistence

- `py_backend/app/security/passwords.py`
  - Argon2id hash/verify

- `py_backend/app/security/jwt_service.py`
  - JWT issue/verify

---

## 6) Security properties achieved

- End-to-end confidentiality for message bodies
- AEAD integrity/authentication for envelopes
- Replay detection via `(thread, recipient, sender, counter)` index
- Key/session isolation by conversation direction
- Reduced backend trust (ciphertext-only storage)

---

## 7) Known limitations (honest defense points)

- Current implementation is a practical ratchet-like model, not full Signal Double Ratchet.
- Historical messages from earlier incompatible client states may remain undecryptable.
- Device trust UX (verification workflows) can be strengthened further.

---

## 8) PQC migration plan (defense-ready)

Architecture is crypto-agile:

- Keep KDF + AEAD layers stable (`HKDF-SHA256`, `AES-256-GCM`)
- Swap only KEX adapter (`X25519` -> `ML-KEM/FrodoKEM/hybrid`)
- Preserve transport/message envelope contracts where possible

Migration phases:

1. Classical (`X25519`)
2. Hybrid (`X25519 + PQC KEM`)
3. Full PQC KEM

---

## 9) Common viva questions and short answers

### Q: Can server admins read plaintext messages?
**A:** Not from stored message bodies, because server stores encrypted envelopes only; decryption is client-side.

### Q: Why AES-GCM?
**A:** It provides confidentiality and integrity in one AEAD primitive, with nonce-based safety and fast performance.

### Q: Why HKDF?
**A:** It safely derives context-bound keys from shared material and avoids direct key reuse.

### Q: Why X25519 now?
**A:** Mature, efficient, interoperable classical KEX; chosen as baseline before PQC transition.

### Q: How will you migrate to PQC?
**A:** Replace KEX implementation behind interfaces while keeping KDF/AEAD/transport unchanged.

---

## 10) Demo checklist (for final presentation)

1. Register/login two users
2. Verify `/api/health` and `/api/health/db`
3. Send encrypted direct message
4. Show backend DB row contains envelope fields (not plaintext)
5. Show receiver decrypts message client-side
6. Show sidebar preview hydration
7. Show replay endpoint behavior
8. Explain KEX swap strategy for PQC phase

