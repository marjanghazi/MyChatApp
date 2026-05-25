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


## 11) Mandatory encrypted send payload shape

When `E2EE_REQUIRED=true`, client must send:

```json
{
  "threadType":"direct",
  "threadId":"u1_u2",
  "actorUid":"u1",
  "targetUid":"u2",
  "payload":{
    "ciphertext_b64":"...",
    "nonce_b64":"...",
    "aad_b64":"...",
    "protocol_version":"1.0",
    "kex_algorithm":"x25519",
    "kdf_algorithm":"hkdf-sha256",
    "cipher":"aes-256-gcm",
    "sender_device_id":"devA",
    "recipient_device_id":"devB",
    "session_id":"sess-123"
  }
}
```

## 12) Key management commands

```bash
# generate demo x25519 keypair for testing
curl -X POST http://127.0.0.1:4000/api/keys/demo/generate-x25519

# register device key bundle
curl -X POST http://127.0.0.1:4000/api/keys/devices/register   -H 'Content-Type: application/json'   -d '{"userId":"u1","deviceId":"devA","identityPublicKeyB64":"...","signedPrekeyPublicKeyB64":"...","signedPrekeySignatureB64":"..."}'

# fetch key bundle
curl http://127.0.0.1:4000/api/keys/bundle/u1/devA
```


## 13) One-time prekeys (forward secrecy bootstrap)

Upload one-time prekeys:

```bash
curl -X POST http://127.0.0.1:4000/api/keys/prekeys/upload   -H 'Content-Type: application/json'   -d '{
    "userId":"u2",
    "deviceId":"devB",
    "prekeys":[
      {"prekeyId":"pk-1","publicKeyB64":"..."},
      {"prekeyId":"pk-2","publicKeyB64":"..."}
    ]
  }'
```

Consume one-time prekey during session init:

```bash
curl -X POST http://127.0.0.1:4000/api/keys/prekeys/consume   -H 'Content-Type: application/json'   -d '{"userId":"u2","deviceId":"devB"}'
```


## 14) Protocol self-test and reset

If ratchet state desync happens, reset session state:

```bash
curl -X POST http://127.0.0.1:4000/api/keys/sessions/reset \
  -H "Content-Type: application/json" \
  -d "{\"threadId\":\"u1_u2\",\"userId\":\"u1\",\"peerUserId\":\"u2\"}"
```
