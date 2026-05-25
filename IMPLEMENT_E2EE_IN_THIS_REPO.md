# Implementing E2EE in This Repository (Step-by-Step + Commands)

This guide maps the architecture to your current repo and gives concrete commands.

## 1) Install required backend dependencies

```bash
cd /workspace/MyChatApp/py_backend
pip install cryptography PyNaCl argon2-cffi passlib python-jose[cryptography]
```

Then pin in `requirements.txt`.

## 2) Added modular crypto scaffolding (already done)

Created modules:

- `app/crypto/interfaces/*`
- `app/crypto/implementations/*`
- `app/crypto/orchestration/*`
- `app/security/passwords.py`
- `app/security/jwt_service.py`
- `app/services/e2ee_service.py`
- `app/schemas/e2ee.py`

## 3) Replace password hashing to Argon2id

Use `PasswordHasher` from `app/security/passwords.py` in `routes/auth.py`.

## 4) Replace random token auth with JWT

Use `JwtService` and include `sub` + `did` claims for WS authentication.

## 5) Store encrypted envelopes only

For `messages` table, store:

- `ciphertext`
- `nonce`
- `aad`
- sender/recipient device IDs
- algorithm/suite version

No plaintext fields should be required for secure flows.

## 6) Add key bundle APIs

Add routes like:

- `GET /api/v1/keys/bundle/{user_id}/{device_id}`
- `POST /api/v1/keys/prekeys/upload`

## 7) WebSocket event contract

Use event names:

- `keys.bundle.request`
- `session.init`
- `message.send`
- `message.deliver`
- `message.ack`

All include `protocol_version`.

## 8) Frontend integration commands

```bash
cd /workspace/MyChatApp/frontend
npm install jose idb-keyval libsodium-wrappers
```

Then build:

```bash
npm run build
```

## 9) Backend run/test commands

```bash
cd /workspace/MyChatApp/py_backend
uvicorn app.main:app --reload --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/api/health
```

## 10) Suggested migration sequence

1. Introduce backend key-management endpoints.
2. Move frontend send/receive to encrypted envelope model.
3. Enforce JWT on WebSocket.
4. Deprecate plaintext message pathways.
5. Add hybrid KEX adapter without touching message transport/service contracts.
