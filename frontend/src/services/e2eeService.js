const KEY_NS = 'pqc_e2ee_thread_key_v1';

const te = new TextEncoder();
const td = new TextDecoder();

const b64 = {
  encode: (arr) => btoa(String.fromCharCode(...new Uint8Array(arr))),
  decode: (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0)),
};

const keySlot = (threadId) => `${KEY_NS}:${threadId}`;

async function importAesKey(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function getOrCreateThreadKey(threadId) {
  const slot = keySlot(threadId);
  const existing = localStorage.getItem(slot);
  if (existing) return importAesKey(b64.decode(existing));
  const raw = crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(slot, b64.encode(raw));
  return importAesKey(raw);
}

export async function encryptMessageEnvelope({ threadId, senderDeviceId, recipientDeviceId, sessionId, plaintext }) {
  const key = await getOrCreateThreadKey(threadId);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aadPayload = JSON.stringify({ threadId, senderDeviceId, recipientDeviceId, sessionId, protocol_version: '1.0' });
  const aad = te.encode(aadPayload);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad }, key, te.encode(plaintext));
  return {
    ciphertext_b64: b64.encode(ciphertext),
    nonce_b64: b64.encode(nonce),
    aad_b64: b64.encode(aad),
    protocol_version: '1.0',
    kex_algorithm: 'x25519',
    kdf_algorithm: 'hkdf-sha256',
    cipher: 'aes-256-gcm',
    sender_device_id: senderDeviceId,
    recipient_device_id: recipientDeviceId,
    session_id: sessionId,
    type: 'e2ee',
  };
}

export async function tryDecryptEnvelope(threadId, payload) {
  if (!payload?.ciphertext_b64 || !payload?.nonce_b64 || !payload?.aad_b64) return null;
  try {
    const key = await getOrCreateThreadKey(threadId);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64.decode(payload.nonce_b64), additionalData: b64.decode(payload.aad_b64) },
      key,
      b64.decode(payload.ciphertext_b64),
    );
    return td.decode(plaintext);
  } catch {
    return null;
  }
}
