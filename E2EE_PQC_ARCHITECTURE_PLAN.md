# E2EE + PQC-Ready Architecture Plan (FYP)

## 1) Algorithm choices for **now** (classical-first, PQC-ready)

### Key agreement (initial)
- **X25519 (ECDH)** for asynchronous session bootstrap.
- Why now:
  - Industry-standard, widely reviewed, fast.
  - Small keys, low latency, excellent support in libsodium/Signal ecosystem.
  - Clean drop-in abstraction target for later **ML-KEM/FrodoKEM**.

### AEAD encryption
- Preferred: **ChaCha20-Poly1305** (especially on mobile / no AES acceleration).
- Alternative: **AES-256-GCM** (excellent with hardware AES-NI).
- Rule: choose one AEAD suite per session; include `aead_id` in metadata.

### KDF / key schedule
- **HKDF-SHA256** for root/session/message key derivation.
- Use domain separation labels (e.g., `"root"`, `"chain"`, `"msg"`, `"header"`).

### Signatures (identity binding)
- **Ed25519** for long-term identity signatures and signed prekeys.
- Why: compact, fast, robust API ergonomics.

### Hash / transcript binding
- **SHA-256** baseline (or BLAKE2s if required for performance experiments).

---

## 2) Crypto-agile modules (for future PQC replacement)

Design around interfaces, not concrete algorithms.

- `KEMProvider` (today: X25519-DH adapter; later: ML-KEM adapter)
- `SignatureProvider` (today: Ed25519)
- `AEADProvider` (ChaCha20-Poly1305 / AES-GCM)
- `KDFProvider` (HKDF)
- `RatchetProvider` (Phase 2+)

All protocol logic consumes interfaces:
- `encapsulate() / decapsulate()` for KEM-like usage
- `derive_root_keys()` / `derive_chain_key()` / `derive_message_key()`
- `seal()` / `open()`

This enables migration path:
- **Classical**: X25519 only
- **Hybrid**: X25519 + ML-KEM combined secret
- **Full PQC**: ML-KEM-only (post-standardization readiness)

---

## 3) Secure system architecture (backend/frontend separation)

## Backend (FastAPI) responsibilities
- AuthN/AuthZ, device registration, key directory, prekey distribution, message relay.
- Never decrypt message bodies.
- Stores only ciphertext envelopes + public key material.
- Enforces anti-abuse controls (rate limits, replay window IDs, device auth).

## Frontend (React) responsibilities
- All private key generation, local secure storage, encryption/decryption, ratchet state.
- Handles per-conversation session state machine.

## Hard rule
- No business/service layer should directly call low-level crypto primitives.
- Only `crypto_core` adapter layer can invoke crypto library functions.

---

## 4) Correct E2EE implementation pattern (Signal-lite academic scope)

For asynchronous messaging:
1. Receiver uploads **KeyBundle**:
   - Identity key (Ed25519 + X25519 static)
   - Signed prekey
   - One-time prekeys (OPKs)
2. Sender fetches bundle and performs X3DH-style handshake.
3. Sender derives initial root key via HKDF.
4. Sender encrypts first message with AEAD and includes header metadata.
5. Receiver performs same derivation and decrypts.

Then (Phase 2):
- Introduce Double Ratchet chain evolution per message.

---

## 5) Key generation, storage, exchange

## Key types
- Identity signing keypair (Ed25519) — long-term per device.
- Identity DH keypair (X25519) — long-term per device.
- Signed prekey (X25519) — medium-term (rotate daily/weekly).
- One-time prekeys (X25519) — consumed per new session.

## Storage
- Private keys: client-only (WebCrypto non-extractable where possible).
- At-rest local protection: IndexedDB + optional OS keystore wrapping.
- Server stores only public keys + signatures + key IDs.

## Exchange
- Key bundles signed by identity signing key.
- Client must verify signature before use.

---

## 6) Session key model

- Handshake output → `root_key`.
- `root_key` via HKDF produces:
  - `send_chain_key`
  - `recv_chain_key`
- Per message:
  - `message_key = HKDF(chain_key, info="msg")`
  - `next_chain_key = HKDF(chain_key, info="chain")`
- Delete used message keys after encryption/decryption.

---

## 7) Encrypted messaging flow (envelope design)

`EncryptedEnvelope` fields:
- `conversation_id`
- `sender_device_id`
- `recipient_device_id`
- `session_id`
- `msg_index`
- `prev_chain_length`
- `ratchet_pub` (if ratchet step)
- `aead_id`, `kdf_id`, `kem_id`, `sig_id`
- `nonce`
- `ciphertext`
- `tag` (if separate)
- `associated_data_hash`
- `sent_at`

Associated Data (AAD) should include immutable routing metadata.

---

## 8) WebSocket security

Use **WSS + short-lived access token + device binding**.

- JWT access token (5–15 min), refresh token via HTTPS-only route.
- WebSocket connect with bearer token + device ID.
- Backend validates:
  - token validity
  - device membership in conversation
  - rate limits
- Message payload is already ciphertext; TLS protects metadata in transit.

Replay mitigation:
- enforce monotonic `msg_index`/unique `message_id`
- reject duplicates by `(session_id, msg_index)`

---

## 9) Authentication alongside E2EE

- Authentication proves user/device identity to server.
- E2EE proves confidentiality/integrity from sender device to recipient device.
- Keep these layers independent:
  - Auth tokens never used as encryption keys.
  - Crypto identity keys never replaced by auth keypair.

Recommended auth stack:
- OIDC-compatible JWT access tokens
- refresh token rotation
- device registration with signed challenge

---

## 10) Common mistakes to avoid

- Reusing nonces with same AEAD key (catastrophic).
- Using raw ECDH output directly without HKDF.
- Not authenticating key bundles/signatures.
- Storing private keys server-side.
- Coupling crypto state with UI state updates.
- Ignoring multi-device identity semantics.
- No key rotation / no prekey replenishment monitoring.

---

## 11) Double Ratchet suitability

Yes, but phase it:
- Phase 1: X3DH-style handshake + static session chain.
- Phase 2: add symmetric-key ratchet first.
- Phase 2b: add DH ratchet for full PFS and post-compromise security.

For FYP, a simplified ratchet with clear proofs/assumptions is publishable.

---

## 12) Hybrid PQC migration design

When ML-KEM/FrodoKEM added:

- Run classical + PQC in parallel during session bootstrap.
- `ss_classical = X25519(...)`
- `ss_pqc = MLKEM.decaps(...)`
- `ikm = concat(ss_classical, ss_pqc)`
- `root_key = HKDF(ikm, salt, info="hybrid-root-v1")`

Negotiation metadata:
- `kem_id = x25519 | mlkem768 | hybrid-x25519-mlkem768`
- include in signed handshake transcript to prevent downgrade.

Transition:
1. Classical-only default.
2. Hybrid opt-in by capability.
3. Hybrid default.
4. PQC-only profile (research mode).

---

## 13) Suggested FastAPI backend structure

```text
backend/
  app/
    api/
      v1/
        auth_routes.py
        key_routes.py
        message_routes.py
        ws_routes.py
    core/
      config.py
      security.py
      rate_limit.py
    services/
      auth_service.py
      key_directory_service.py
      message_relay_service.py
      session_service.py
    crypto_abstractions/
      models.py              # algorithm IDs, envelope schemas
      validators.py          # signature / bundle validation logic only
    db/
      models/
        user.py
        device.py
        key_bundle.py
        message_envelope.py
        session_state.py
      repositories/
    websocket/
      connection_manager.py
      event_handlers.py
```

---

## 14) Suggested React frontend structure

```text
frontend/src/
  crypto/
    providers/
      kem_provider.ts
      aead_provider.ts
      kdf_provider.ts
      sig_provider.ts
    implementations/
      x25519_provider.ts
      chacha20poly1305_provider.ts
      hkdf_sha256_provider.ts
      ed25519_provider.ts
    protocol/
      x3dh.ts
      session_state.ts
      ratchet.ts
    storage/
      key_store.ts
      session_store.ts
    types/
      envelope.ts
      algorithm_ids.ts
  services/
    authService.ts
    keyDirectoryService.ts
    messagingService.ts
    websocketService.ts
  features/chat/
```

---

## 15) Recommended libraries

## Python / FastAPI
- `cryptography` (hazmat carefully)
- `PyNaCl` (libsodium primitives, safer high-level APIs)
- `pydantic` for strict schema validation
- `python-jose` or `Authlib` for JWT/OIDC

## React / Browser
- `Web Crypto API` first choice (native)
- `libsodium-wrappers-sumo` for X25519/Ed25519/ChaCha20-Poly1305 where needed
- `idb` for IndexedDB structured key/session state

Note: browser-native ML-KEM support may require WASM libs later.

---

## 16) Database schema (ciphertext-oriented)

Core tables/collections:
- `users`
- `devices` (device_id, user_id, status, created_at)
- `identity_keys` (device_id, sig_pub, dh_pub, version)
- `signed_prekeys` (device_id, key_id, pub, signature, valid_from/to)
- `one_time_prekeys` (device_id, key_id, pub, consumed_at)
- `sessions` (session_id, participants, algorithm_suite, created_at)
- `message_envelopes` (ids, routing metadata, ciphertext, nonce, alg IDs, created_at)
- `delivery_receipts` (message_id, device_id, delivered_at)

Never store plaintext content.

---

## 17) Suggested API routes

- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/devices/register`
- `POST /v1/keys/bundle/publish`
- `GET /v1/keys/bundle/{user_id}`
- `POST /v1/keys/opk/replenish`
- `POST /v1/messages/send` (ciphertext envelope)
- `GET /v1/messages/sync?cursor=...`
- `WS /v1/ws/chat`

---

## 18) Threat model (high-level)

Defend against:
- passive network adversary
- active MITM at transport layer
- malicious/curious server reading message content
- token theft and replay attempts
- device compromise (limit blast radius with ratchets + rotation)

Out of scope initially (document explicitly):
- global traffic analysis
- fully compromised endpoints
- nation-state side-channel labs

---

## 19) Benchmarking plan (Phase 4)

Measure:
- handshake latency (p50/p95)
- encrypt/decrypt throughput
- message expansion overhead
- battery/CPU impact (mobile browser if possible)
- reconnection + session recovery time

Compare profiles:
- X25519-only
- Hybrid X25519+ML-KEM
- ML-KEM-only (if feasible)

Publish with controlled hardware/software baselines.

---

## 20) Phased implementation roadmap

## Phase 1 — Basic secure E2EE chat
- Implement device identities, signed bundles, OPKs, X3DH-like bootstrap.
- AEAD encryption for message payloads.
- Server as blind relay.

## Phase 2 — Forward secrecy
- Add chain-key evolution per message.
- Add DH ratchet steps (Double Ratchet-lite/full).
- Add key rotation + session healing.

## Phase 3 — Hybrid PQC
- Introduce `KEMProvider` hybrid mode.
- Add ML-KEM encapsulation/decapsulation path.
- Transcript-sign and anti-downgrade checks.

## Phase 4 — Benchmarking + research
- Run repeatable experiments.
- Evaluate security/performance tradeoffs.
- Produce architecture + results suitable for paper submission.

---

## Why X25519 initially?
- Best maturity/performance/interop point today.
- Cleanly maps to KEM abstraction for future PQ migration.
- Lower implementation risk than bespoke or less-supported curves.

## Why ChaCha20-Poly1305 or AES-GCM?
- Both are modern AEAD standards with confidentiality + integrity.
- ChaCha20-Poly1305: robust software performance and misuse resistance profile.
- AES-GCM: excellent on hardware-accelerated platforms.

## How HKDF should be used?
- Always post-handshake, never raw shared secret directly.
- Use labeled `info` context and per-stage derivation.
- Keep separate keys for send/recv/chains/headers.

## Is Double Ratchet suitable?
- Yes, ideal for your research direction.
- Start simple then extend; document security properties per phase.
