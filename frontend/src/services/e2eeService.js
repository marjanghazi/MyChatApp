const KEY_NS = 'pqc_e2ee_v2';
const te = new TextEncoder();
const td = new TextDecoder();

const b64 = {
  encode: (arr) => btoa(String.fromCharCode(...new Uint8Array(arr))),
  decode: (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0)),
};

const slot = (k) => `${KEY_NS}:${k}`;

async function importAesKey(raw) {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function importX25519Public(rawBytes) {
  return crypto.subtle.importKey('raw', rawBytes, { name: 'X25519' }, true, []);
}

async function hkdfKey(sharedSecret, saltBytes, infoBytes) {
  const ikm = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: infoBytes },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function ensureDeviceIdentity(userId) {
  const pubSlot = slot(`device_pub_${userId}`);
  const privSlot = slot(`device_priv_${userId}`);
  if (localStorage.getItem(pubSlot) && localStorage.getItem(privSlot)) {
    return { deviceId: localStorage.getItem(slot(`device_id_${userId}`)) || userId };
  }
  const kp = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const priv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  const deviceId = crypto.randomUUID ? crypto.randomUUID() : `${userId}-${Date.now()}`;
  localStorage.setItem(pubSlot, b64.encode(pub));
  localStorage.setItem(privSlot, b64.encode(priv));
  localStorage.setItem(slot(`device_id_${userId}`), deviceId);
  return { deviceId, identityPublicKeyB64: b64.encode(pub) };
}

async function getPrivateKey(userId) {
  const raw = localStorage.getItem(slot(`device_priv_${userId}`));
  if (!raw) throw new Error('Missing local device private key');
  return crypto.subtle.importKey('pkcs8', b64.decode(raw), { name: 'X25519' }, false, ['deriveBits']);
}

export async function registerDeviceBundle(apiRequest, userId) {
  const ensured = await ensureDeviceIdentity(userId);
  const identityPublicKeyB64 = localStorage.getItem(slot(`device_pub_${userId}`));
  const signedPrekeyPublicKeyB64 = identityPublicKeyB64;
  const signedPrekeySignatureB64 = b64.encode(crypto.getRandomValues(new Uint8Array(64)));
  await apiRequest('/api/keys/devices/register', {
    method: 'POST',
    body: JSON.stringify({ userId, deviceId: ensured.deviceId, identityPublicKeyB64, signedPrekeyPublicKeyB64, signedPrekeySignatureB64 }),
  });
  return ensured.deviceId;
}

async function getOrCreateSessionKey(apiRequest, { threadId, senderUid, recipientUid }) {
  const sessionSlot = slot(`session_${threadId}_${senderUid}_${recipientUid}`);
  const existing = localStorage.getItem(sessionSlot);
  if (existing) return importAesKey(b64.decode(existing));

  const myPriv = await getPrivateKey(senderUid);
  const myDeviceId = localStorage.getItem(slot(`device_id_${senderUid}`)) || senderUid;
  const peerDeviceId = localStorage.getItem(slot(`peer_dev_${recipientUid}`)) || recipientUid;
  const bundle = await apiRequest(`/api/keys/bundle/${encodeURIComponent(recipientUid)}/${encodeURIComponent(peerDeviceId)}`);
  const peerPub = await importX25519Public(b64.decode(bundle.identity_public_key_b64));
  const shared = await crypto.subtle.deriveBits({ name: 'X25519', public: peerPub }, myPriv, 256);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const info = te.encode(`chat/v1/session/${threadId}/${senderUid}/${recipientUid}`);
  const key = await hkdfKey(new Uint8Array(shared), salt, info);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  localStorage.setItem(sessionSlot, b64.encode(raw));
  return key;
}

export async function encryptMessageEnvelope(apiRequest, { threadId, senderUid, recipientUid, plaintext }) {
  const key = await getOrCreateSessionKey(apiRequest, { threadId, senderUid, recipientUid });
  const senderDeviceId = localStorage.getItem(slot(`device_id_${senderUid}`)) || senderUid;
  const recipientDeviceId = localStorage.getItem(slot(`peer_dev_${recipientUid}`)) || recipientUid;
  const sessionId = `${threadId}:${senderUid}:${recipientUid}`;
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aad = te.encode(JSON.stringify({ threadId, senderDeviceId, recipientDeviceId, sessionId, protocol_version: '1.0' }));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad }, key, te.encode(plaintext));
  return {
    ciphertext_b64: b64.encode(ciphertext), nonce_b64: b64.encode(nonce), aad_b64: b64.encode(aad),
    protocol_version: '1.0', kex_algorithm: 'x25519', kdf_algorithm: 'hkdf-sha256', cipher: 'aes-256-gcm',
    sender_device_id: senderDeviceId, recipient_device_id: recipientDeviceId, session_id: sessionId, type: 'e2ee',
  };
}

export async function tryDecryptEnvelopeWithParticipants(apiRequest, threadId, payload, recipientUid, senderUid) {
  if (!payload?.ciphertext_b64 || !payload?.nonce_b64 || !payload?.aad_b64) return null;
  try {
    const key = await getOrCreateSessionKey(apiRequest, { threadId, senderUid: recipientUid, recipientUid: senderUid });
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64.decode(payload.nonce_b64), additionalData: b64.decode(payload.aad_b64) }, key, b64.decode(payload.ciphertext_b64));
    return td.decode(plaintext);
  } catch { return null; }
}
