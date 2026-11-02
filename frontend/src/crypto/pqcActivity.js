// Demo telemetry contains stage labels, elapsed milliseconds, and byte counts.
// Never publish key material, plaintext, ciphertext, tokens, or message IDs.
import { apiRequest } from '../services/apiClient.js';

const listeners = new Set();

export const PQC_FLOWS = Object.freeze({
  register: {
    title: 'Account registration and PQC identity',
    steps: [
      ['auth', 'Registration API round trip (Argon2id account setup)'],
      ['kem', 'ML-KEM-768 keys ready'],
      ['dsa', 'ML-DSA-65 keys ready'],
      ['identity_sign', 'ML-DSA-65 public identity signature'],
      ['bundle', 'Signed public identity registered'],
    ],
  },
  login: {
    title: 'Sign-in and PQC identity setup',
    steps: [
      ['auth', 'Login API round trip (Argon2id verification)'],
      ['kem', 'ML-KEM-768 keys ready'],
      ['dsa', 'ML-DSA-65 keys ready'],
      ['identity_sign', 'ML-DSA-65 public identity signature'],
      ['bundle', 'Signed public identity registered'],
    ],
  },
  identity: {
    title: 'Restored session · PQC identity',
    steps: [
      ['kem', 'ML-KEM-768 keys ready'],
      ['dsa', 'ML-DSA-65 keys ready'],
      ['identity_sign', 'ML-DSA-65 public identity signature'],
      ['bundle', 'Signed public identity registered'],
    ],
  },
  send: {
    title: 'Protecting direct message',
    steps: [
      ['kem', 'ML-KEM-768 encapsulation'],
      ['kdf', 'HKDF-SHA256 + AES-GCM key wrapping'],
      ['aes', 'AES-256-GCM encryption'],
      ['dsa', 'ML-DSA-65 signature'],
      ['relay', 'Ciphertext accepted by relay'],
    ],
  },
  receive: {
    title: 'Opening new direct message',
    steps: [
      ['dsa', 'ML-DSA-65 verification'],
      ['kem', 'ML-KEM-768 decapsulation'],
      ['kdf', 'HKDF-SHA256 key derivation'],
      ['aes', 'AES-256-GCM decryption'],
    ],
  },
  attachment: {
    title: 'Protecting attachment',
    steps: [
      ['aes', 'AES-256-GCM file encryption'],
      ['relay', 'Encrypted file uploaded'],
    ],
  },
});

export function subscribePqcActivity(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function beginPqcActivity(kind, { user: suppliedUser, startedAt = performance.now() } = {}) {
  if (!Object.hasOwn(PQC_FLOWS, kind)) throw new Error(`Unknown PQC activity: ${kind}`);
  const id = crypto.randomUUID();
  let user = suppliedUser;
  if (!user) {
    try { user = JSON.parse(localStorage.getItem('pqc_auth_user') || 'null'); }
    catch { user = null; }
  }
  let sequence = 0;
  let recording = true;
  let telemetry = Promise.resolve();
  const publish = (step, status, detail = null, measurement = null) => {
    const event = { id, kind, step, status, detail, ...measurement };
    for (const listener of listeners) listener(event);
    // The server accepts these fixed stage labels only during a ten-minute
    // admin demo for this account. No cryptographic or message material goes.
    if (user?.uid && user?.idToken) {
      const body = { flowId: id, kind, step, status, detail, sequence: sequence++, ...measurement };
      telemetry = telemetry.then(async () => {
        if (!recording) return;
        const result = await apiRequest('/api/crypto/activity', {
          method: 'POST',
          headers: { Authorization: `Bearer ${user.idToken}` },
          body: JSON.stringify(body),
        });
        if (!result.recorded) recording = false;
      }).catch(() => { recording = false; });
    }
  };
  publish(null, 'start');
  const progress = (step, status = 'active', detail = null, measurement = null) => publish(step, status, detail, measurement);
  progress.complete = () => publish(null, 'complete', null, { durationMs: performance.now() - startedAt });
  progress.fail = () => publish(null, 'error', null, { durationMs: performance.now() - startedAt });
  return progress;
}
