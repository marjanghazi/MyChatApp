# E2EE File Map (What each file does)

## Frontend
- `frontend/src/services/e2eeService.js`  
  Core browser cryptography service: key generation, bundle registration, ratchet/session handling, envelope encrypt/decrypt, safety number helpers.

- `frontend/src/services/chatService.js`  
  Chat transport wrapper that encrypts plaintext before send and decrypts envelopes when loading messages.

- `frontend/src/services/threadService.js`  
  Thread/conversation APIs and preview hydration that decrypts sidebar last-message placeholders.

- `frontend/src/services/authService.js`  
  Authentication helpers; registers device bundle after auth success.

- `frontend/src/components/chatwindow/header-options/safetyNumber.js`  
  UI action to show peer safety number/fingerprint.

## Backend
- `py_backend/app/crypto/interfaces/*.py`  
  Crypto abstraction contracts (KEX/KDF/AEAD).

- `py_backend/app/crypto/implementations/*.py`  
  Concrete classical implementations: X25519, HKDF-SHA256, AES-256-GCM.

- `py_backend/app/crypto/orchestration/*.py`  
  Suite composition and key-derivation orchestration helpers.

- `py_backend/app/services/e2ee_service.py`  
  App-facing E2EE service that wires default crypto suite.

- `py_backend/app/routes/keys.py`  
  Device bundle/prekey/session/replay endpoints.

- `py_backend/app/routes/chat.py`  
  Message endpoints; validates encrypted envelopes; enforces `E2EE_REQUIRED` mode.

- `py_backend/app/security/passwords.py`  
  Argon2id hashing and verification.

- `py_backend/app/security/jwt_service.py`  
  JWT create/verify utilities for auth tokens.

- `py_backend/app/db.py`  
  PostgreSQL pool, compat migrations, query helpers, health check.

- `py_backend/app/schema.sql`  
  Relational schema including `user_devices`, `one_time_prekeys`, `e2ee_sessions`, and replay index table.

