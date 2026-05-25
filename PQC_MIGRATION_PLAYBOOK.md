# PQC Migration Playbook (Classical -> Hybrid -> Full PQC)

Yes — this codebase is structured so you can migrate to PQC later.

This document gives a practical, file-by-file migration map.

---

## 1) Short answer

**Yes, you can migrate this implementation to PQC later** while preserving most of the app.

In this architecture, the primary intended swap is the **KEX layer**.
The following layers can stay stable in first migration stages:
- HKDF-SHA256
- AES-256-GCM envelope format
- JWT auth
- chat routes and storage model

---

## 2) What changes for PQC?

## Keep unchanged (initially)
- Message envelope transport shape (`ciphertext_b64`, `nonce_b64`, `aad_b64`, counters, metadata)
- `py_backend/app/routes/chat.py` envelope validation flow
- Conversation/message storage model in DB
- `KdfInterface` and `AeadInterface` contracts

## Replace/extend
- KEX implementation(s) and key bundle fields
- Client key generation and shared-secret derivation in frontend E2EE service
- Bundle/session metadata to indicate new algorithm(s)

---

## 3) Exact backend files to modify

## 3.1 Add new KEX implementation modules
Create new files (examples):
- `py_backend/app/crypto/implementations/mlkem_kex.py`
- `py_backend/app/crypto/implementations/frodokem_kex.py`
- optionally `py_backend/app/crypto/implementations/hybrid_x25519_mlkem_kex.py`

They must satisfy `KexInterface` contract in:
- `py_backend/app/crypto/interfaces/kex_interface.py`

## 3.2 Wire suite selection
Update:
- `py_backend/app/services/e2ee_service.py`
- `py_backend/app/crypto/orchestration/crypto_suite.py`

Goal:
- choose KEX adapter by config/env (e.g., `KEX_ALGORITHM=mlkem|frodokem|hybrid|x25519`)

## 3.3 Keys route metadata and bundle fields
Update:
- `py_backend/app/routes/keys.py`
- `py_backend/app/schemas/e2ee.py`

Add/extend support for:
- PQC public key fields,
- optional hybrid components,
- algorithm/version identifiers in bundle response.

## 3.4 Schema migration for new key material
Update:
- `py_backend/app/schema.sql`
- compatibility migration logic in `py_backend/app/db.py`

Add columns/tables for PQC key blobs (example columns):
- `pqc_kem_public_key_b64`
- `hybrid_public_key_b64`
- `kex_suite` / `kex_version`

---

## 4) Exact frontend files to modify

## 4.1 Core client crypto engine
Primary file:
- `frontend/src/services/e2eeService.js`

Replace/extend:
- device keypair generation,
- peer bundle interpretation,
- shared-secret derivation logic.

Keep:
- HKDF/AES-GCM envelope handling (unless you intentionally redesign it).

## 4.2 Transport integration points (usually minor)
Review/update metadata fields in:
- `frontend/src/services/chatService.js`
- `frontend/src/services/threadService.js`
- `frontend/src/services/authService.js`

Most changes here are metadata propagation (kex algorithm/suite ids), not full crypto rewrites.

---

## 5) Recommended migration phases

## Phase A: Classical baseline (current)
- `x25519_hkdfsha256_aes256gcm_v1`

## Phase B: Hybrid mode
- derive/compose shared secret from classical + PQC contributions
- continue HKDF and AES-GCM unchanged
- mark envelope `kex_algorithm=hybrid-x25519-mlkem`

## Phase C: Full PQC mode
- remove classical contribution
- keep HKDF/AES pipeline for compatibility and risk control

---

## 6) Suggested config additions

Add to backend `.env` (and docs):
- `KEX_ALGORITHM=x25519`
- `KEX_HYBRID_MODE=false`
- `KEX_VERSION=v1`

When migrating:
- `KEX_ALGORITHM=mlkem`
- or `KEX_ALGORITHM=hybrid-x25519-mlkem`

---

## 7) Compatibility strategy

For smooth rollout, keep backward compatibility for a period:
- accept both old and new bundle formats,
- store `kex_algorithm` per device/session,
- decrypt according to per-message/per-session metadata.

---

## 8) Risk controls during migration

- strict algorithm identifiers in bundle + envelope metadata,
- reject mixed/invalid key material,
- migration tests for cross-version chat (old client vs new client),
- feature flags per environment.

---

## 9) File-by-file checklist

Backend:
- [ ] `py_backend/app/crypto/interfaces/kex_interface.py` (confirm abstraction coverage)
- [ ] `py_backend/app/crypto/implementations/*` (add PQC/hybrid KEX adapters)
- [ ] `py_backend/app/services/e2ee_service.py` (suite selection)
- [ ] `py_backend/app/routes/keys.py` (bundle/register fields)
- [ ] `py_backend/app/schemas/e2ee.py` (request/response models)
- [ ] `py_backend/app/schema.sql` (new columns/tables)
- [ ] `py_backend/app/db.py` (compat migration statements)

Frontend:
- [ ] `frontend/src/services/e2eeService.js` (KEX/keygen/derive changes)
- [ ] `frontend/src/services/authService.js` (bundle registration payload)
- [ ] `frontend/src/services/chatService.js` (metadata consistency)
- [ ] `frontend/src/services/threadService.js` (no major crypto change expected)

Docs:
- [ ] `E2EE_IMPLEMENTATION_GUIDE.md` (update algorithm table)
- [ ] `E2EE_FILE_MAP.md` (map new PQC modules)
- [ ] `E2EE_VIVA_GUIDE.md` (update defense narrative)

