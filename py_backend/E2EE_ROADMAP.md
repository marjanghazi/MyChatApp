# End-to-End Encryption (E2EE) rollout guide

This backend now enforces ciphertext-only chat writes, but **true E2EE requires clients to encrypt/decrypt locally**.

## 1) Cryptography profile (current)
- Key agreement: **X25519**
- Message cipher: **AES-256-GCM**
- Payload contract: `encrypted.{ciphertext, nonce, algorithm, version}` required
- Allowed algorithm string: `X25519+AES-256-GCM`

## 2) Backend responsibilities (already implemented)
1. Reject plaintext chat content writes.
2. Persist only encrypted payload objects.
3. Store per-device key bundles.
4. Store session/ratchet metadata references.

## 3) Client responsibilities (required for 100% E2EE)
1. Generate long-term identity keypair per device.
2. Generate signed pre-key + one-time prekeys.
3. Publish public key bundle to `/api/e2ee/keys/publish`.
4. On first message, fetch recipient bundle via `/api/e2ee/keys/{uid}` and establish X25519 shared secret.
5. Derive AES-256-GCM message key (HKDF-SHA256 recommended).
6. Encrypt locally; send only `payload.encrypted`.
7. Decrypt locally after fetch.
8. Rotate prekeys and ratchet state periodically and on device change.

## 4) Minimal encrypted message envelope
```json
{
  "payload": {
    "type": "text",
    "encrypted": {
      "algorithm": "X25519+AES-256-GCM",
      "version": 1,
      "ciphertext": "<base64>",
      "nonce": "<base64-12-byte>",
      "aad": "<optional base64>",
      "keyId": "<optional>",
      "senderDeviceId": "<optional>",
      "ephemeralPubKey": "<optional base64>",
      "signature": "<optional base64>"
    }
  }
}
```

## 5) Production hardening checklist
- Add device registration and trust UX (fingerprints / safety numbers).
- Add replay protection (message counter in AAD + reject duplicates).
- Add key rotation policy and key revocation endpoint.
- Add sealed sender / sender anonymity design if required.
- Encrypt attachments client-side with envelope keys.
- Add integration tests for malformed envelope rejection.

## 6) PQC migration plan
When you are ready for PQC:
1. Add new algorithm IDs (e.g. `ML-KEM + AES-256-GCM`) in `app/e2ee/schemas.py`.
2. Extend key bundle schema with PQC public keys.
3. Version envelope by `encrypted.version`.
4. Run dual-stack (X25519 + PQC hybrid) during migration window.
