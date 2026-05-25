# E2EE Secure Chat Architecture Blueprint (FastAPI + React)

This blueprint defines a **crypto-agile**, modular architecture for a real-time E2EE chat system where only the key-exchange adapter changes across:

- Classical: `X25519`
- Hybrid: `X25519 + ML-KEM/FrodoKEM`
- Full PQC: `ML-KEM/FrodoKEM`

Core invariant pipeline:

`KEX -> HKDF-SHA256 -> AES-256-GCM`

---

## 1) Recommended Project Folder Structure

```text
MyChatApp/
  backend/
    app/
      api/
        v1/
          routes/
            auth.py
            keys.py
            messages.py
            users.py
            sessions.py
      websocket/
        manager.py
        events.py
        handlers/
          chat_handler.py
          key_exchange_handler.py
      domain/
        models/
          user.py
          device.py
          prekey_bundle.py
          session.py
          message.py
        services/
          auth_service.py
          message_service.py
          session_service.py
          key_management_service.py
      crypto/
        interfaces/
          kex_interface.py
          aead_interface.py
          kdf_interface.py
          key_store_interface.py
        implementations/
          classical/
            x25519_kex.py
          pqc/
            mlkem_kex.py
            frodokem_kex.py
          hybrid/
            x25519_mlkem_kex.py
          hkdf_sha256.py
          aes256gcm.py
        orchestration/
          crypto_suite.py
          session_key_deriver.py
      infra/
        db/
          repositories/
            user_repo.py
            message_repo.py
            key_repo.py
            session_repo.py
          firebase/
            client.py
          postgres/
            client.py
        cache/
        config/
          settings.py
          secrets.py
      schemas/
        auth.py
        ws_events.py
        messages.py
        keys.py
      dependencies/
        auth_deps.py
        crypto_deps.py
        repo_deps.py
      main.py

  frontend/
    src/
      app/
        providers/
          AuthProvider.tsx
          CryptoProvider.tsx
          SocketProvider.tsx
      crypto/
        interfaces/
          KexAdapter.ts
          AeadAdapter.ts
          KdfAdapter.ts
        adapters/
          classical/
            x25519Adapter.ts
          pqc/
            mlkemAdapter.ts
            frodokemAdapter.ts
          hybrid/
            x25519MlkemAdapter.ts
          hkdfAdapter.ts
          aesGcmAdapter.ts
        orchestration/
          sessionEngine.ts
          ratchetEngine.ts
      sockets/
        wsClient.ts
        wsEvents.ts
      features/
        auth/
        chat/
        keys/
      storage/
        secureStore.ts
      hooks/
        useSessionKeys.ts
        useSendEncryptedMessage.ts
      types/
        api.ts
        crypto.ts
```

---

## 2) Backend Architecture for FastAPI

Layers and responsibilities:

- **API Layer**: Request validation, response contracts, no crypto math.
- **WebSocket Layer**: Connection lifecycle + event routing only.
- **Domain Services**: Business workflows (session bootstrap, message persist).
- **Crypto Layer**: Interface-driven implementations.
- **Infrastructure Layer**: Firebase/Postgres adapters, cache, KMS integration.

Dependency Injection pattern:

- `get_kex_provider()` returns active `KexInterface` (X25519 now, PQC later).
- `get_crypto_suite()` returns composable suite `(kex, hkdf, aead)`.
- Services depend on interfaces, never concrete classes.

---

## 3) Frontend Architecture for React

Principles:

- Crypto executes client-side (WebCrypto/libsodium wrappers).
- WebSocket client is transport-only.
- Session/key state isolated in `CryptoProvider` + dedicated hooks.

Recommended state split:

- `AuthContext`: JWT, device identity metadata.
- `CryptoContext`: identity keys, signed prekeys, session cache.
- `SocketContext`: connection state and event dispatch.

---

## 4) WebSocket Secure Messaging Flow

1. Client authenticates via JWT over HTTPS.
2. Client opens `wss://` with JWT (header or short-lived WS token).
3. Sender requests recipient key bundle (REST or WS event).
4. Sender performs client-side KEX + HKDF, derives session key.
5. Sender encrypts payload using AES-256-GCM.
6. Sender sends ciphertext envelope via WS.
7. Server relays/stores encrypted envelope only.
8. Recipient decrypts client-side.

---

## 5) Key Generation Flow

Per device:

- Identity key pair (longer-lived, rotation policy).
- Signed prekey pair (medium-lived, e.g., weekly).
- One-time prekeys batch (for asynchronous initiation).
- Secure random source: `os.urandom` on backend; CSPRNG on frontend.

---

## 6) Shared Secret Derivation Flow

Classical now:

- `shared_secret = X25519(ephemeral_priv, peer_pub)`

Hybrid later:

- `ss_classical = X25519(...)`
- `ss_pqc = MLKEM.decapsulate(...)` (or FrodoKEM)
- `combined = concat(ss_classical, ss_pqc)`
- Pass to HKDF as IKM.

---

## 7) Session Key Derivation Using HKDF

Use HKDF-SHA256 with explicit context labels:

- `salt = handshake_hash_or_random_32B`
- `info = b"chat/v1/session/{sender_device}/{recipient_device}"`
- Output expansion:
  - `k_enc_send` (32B)
  - `k_enc_recv` (32B)
  - optional `k_header`, `k_ratchet`

Never reuse derived keys across sessions.

---

## 8) AES-256-GCM Encryption/Decryption Flow

Encryption envelope fields:

- `ciphertext`
- `nonce` (12 bytes, unique per key)
- `aad` (metadata integrity: message_id, sender_device_id, timestamp bucket)
- `tag` (if library separates it)

Rules:

- New nonce per message.
- Include protocol version in AAD.
- Reject on auth failure without plaintext fallback.

---

## 9) JWT Authentication Flow

- Access token short TTL (e.g., 10-15 min).
- Refresh token rotation with revocation list.
- WS auth via:
  - validated bearer during handshake, or
  - one-time WS token minted via HTTPS.

Claims:

- `sub` (user_id), `did` (device_id), `exp`, `iat`, `jti`, `scope`.

---

## 10) Secure Password Hashing Using Argon2id

Recommended baseline (tune by benchmark):

- `memory_cost`: 64-256 MB
- `time_cost`: 2-4
- `parallelism`: 1-4

Store only hash string + algorithm params (built into Argon2 format).

---

## 11) Database Schema Design

Core tables/collections:

- `users(id, username, email, password_hash, created_at)`
- `devices(id, user_id, device_label, identity_pubkey, signed_prekey_pub, signed_prekey_sig, created_at, revoked_at)`
- `one_time_prekeys(id, device_id, prekey_id, prekey_pub, consumed_at)`
- `sessions(id, local_device_id, remote_device_id, session_version, kex_algorithm, created_at, last_used_at, state_ciphertext)`
- `messages(id, thread_id, sender_device_id, recipient_device_id, ciphertext, nonce, aad, created_at, delivery_state)`
- `threads(id, type, created_at)`
- `thread_members(thread_id, user_id, role)`

Never store plaintext message body.

---

## 12) Secure Storage Recommendations

Client:

- Private keys in platform secure storage (Web: IndexedDB + wrapping; mobile: keystore/keychain).
- Optionally wrap at-rest keys with device-bound master key.

Server:

- Store public keys and encrypted session state only.
- Secrets/JWT keys in environment + secret manager (Vault/KMS).

---

## 13) Message Lifecycle Architecture

1. Compose plaintext locally.
2. Load/create session locally.
3. Encrypt plaintext with session send key.
4. Send envelope to backend.
5. Backend validates schema/auth, persists encrypted envelope.
6. Deliver to recipient over WS.
7. Recipient decrypts locally and updates UI.

---

## 14) API Routes

Suggested REST:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/keys/bundle/{user_id}/{device_id}`
- `POST /api/v1/keys/prekeys/upload`
- `POST /api/v1/sessions/bootstrap`
- `GET /api/v1/messages/{thread_id}` (encrypted envelopes)
- `POST /api/v1/messages` (fallback to WS unavailable)

---

## 15) WebSocket Event Definitions

- `auth.ws_init`
- `keys.bundle.request`
- `keys.bundle.response`
- `session.init`
- `session.ack`
- `message.send`
- `message.deliver`
- `message.ack`
- `message.read`
- `key.rotate.notice`

All event payloads versioned: `protocol_version`.

---

## 16) Secure Nonce/IV Handling

For AES-GCM 96-bit nonce:

- Option A: random 12-byte nonce via CSPRNG (track collisions per keyspace).
- Option B: deterministic counter nonce with per-session random prefix.

For chat scale, deterministic counter is safer for uniqueness if implemented correctly.

---

## 17) Forward Secrecy Design Recommendations

- Use ephemeral sender key per session-init and periodic rekey.
- Rotate session keys after N messages or T minutes.
- Maintain per-direction chain keys (send/recv).
- Destroy old ephemeral private material after derivation.

---

## 18) Future PQC Migration Strategy

Adopt algorithm registry:

- `KEX_ALGO = x25519 | hybrid_x25519_mlkem | mlkem`
- Session metadata stores algorithm id + suite version.

Migration phases:

1. Classical default, hybrid available.
2. Hybrid default, classical fallback.
3. PQC default, hybrid fallback.
4. PQC-only when ecosystem stable.

---

## 19) Hybrid PQC Architecture Suggestions

Hybrid combiner pattern:

- Run both KEX methods.
- Concatenate secrets in fixed order.
- HKDF extracts unified secret.

Security rationale:

- If one primitive weakens, the other can preserve security margin.

---

## 20) Suggested Python Libraries

- `cryptography` (X25519, HKDF, AESGCM)
- `PyNaCl` (libsodium helpers, optional)
- `argon2-cffi` or `passlib[argon2]`
- `python-jose` or `PyJWT`
- `fastapi`, `uvicorn`, `pydantic`
- `websockets` (if needed outside FastAPI native)

---

## 21) Suggested React Libraries

- Native Web Crypto API wrappers
- `libsodium-wrappers` (if needed)
- `jose` (JWT parsing/verification client-side when required)
- `zustand` or context + reducer for key/session cache
- `idb-keyval` for IndexedDB abstraction

---

## 22) Threat Model Overview

Threats:

- MITM during key exchange
- Compromised backend storage
- Token theft/session hijack
- Replay attacks
- Metadata leakage
- XSS stealing local secrets

Controls:

- Signed prekeys, authenticated key bundles
- TLS + cert hygiene + WS over TLS
- Short JWT TTL + rotation/revocation
- Message IDs + replay windows
- CSP, strict input sanitization, secure headers

---

## 23) Security Best Practices

- Enforce TLS 1.2+ (prefer 1.3).
- Constant-time comparison for secret checks.
- Structured audit logs without sensitive payloads.
- Key rotation policies + incident playbooks.
- Security tests: property tests, fuzzing for parsers, negative crypto tests.

---

## 24) Common Cryptographic Mistakes to Avoid

- Nonce reuse with AES-GCM.
- Reusing long-term static keys for all sessions.
- Mixing signing/encryption semantics incorrectly.
- Not binding context in HKDF `info` and AEAD `aad`.
- Storing private keys unwrapped in browser storage.
- Silent decryption failure fallbacks.

---

## Practical Implementation Notes for Your FYP

1. Start with `KexInterface` and one implementation (`X25519Kex`).
2. Build all services against `KexInterface` only.
3. Add `HybridKex` adapter without touching WS/message services.
4. Add protocol version negotiation in handshake.
5. Keep migration toggles in server config + client capabilities advertisement.

This ensures your research deliverable clearly demonstrates **crypto-agility by design**.
