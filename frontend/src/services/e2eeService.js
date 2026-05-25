const KEY_NS = 'pqc_e2ee_v3';
const te = new TextEncoder();
const td = new TextDecoder();

const b64 = {
  encode: (arr) => btoa(String.fromCharCode(...new Uint8Array(arr))),
  decode: (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0)),
};

const slot = (k) => `${KEY_NS}:${k}`;
const SKIPPED_NS = `${KEY_NS}:skipped`;
const ordered = (a, b) => [String(a || ''), String(b || '')].sort();

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

async function sha256Bytes(input) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', input));
}

async function peerFingerprint(pubB64) {
  const digest = await sha256Bytes(b64.decode(pubB64));
  return Array.from(digest).map((b) => b.toString(16).padStart(2, '0')).join('');
}



function skippedSlot(threadId, userId, peerUserId, counter) {
  return `${SKIPPED_NS}:${threadId}:${userId}:${peerUserId}:${counter}`;
}

function setSkippedKey(threadId, userId, peerUserId, counter, keyB64) {
  localStorage.setItem(skippedSlot(threadId, userId, peerUserId, counter), keyB64);
}

function getSkippedKey(threadId, userId, peerUserId, counter) {
  return localStorage.getItem(skippedSlot(threadId, userId, peerUserId, counter));
}



async function ensureSigningIdentity(userId) {
  const pubSlot = slot(`sign_pub_${userId}`);
  const privSlot = slot(`sign_priv_${userId}`);
  if (localStorage.getItem(pubSlot) && localStorage.getItem(privSlot)) {
    return { pub: localStorage.getItem(pubSlot), priv: localStorage.getItem(privSlot) };
  }
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const priv = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  localStorage.setItem(pubSlot, b64.encode(pub));
  localStorage.setItem(privSlot, b64.encode(priv));
  return { pub: b64.encode(pub), priv: b64.encode(priv) };
}

async function signBytesEd25519(userId, msgBytes) {
  const raw = localStorage.getItem(slot(`sign_priv_${userId}`));
  if (!raw) throw new Error('Missing signing private key');
  const key = await crypto.subtle.importKey('pkcs8', b64.decode(raw), { name: 'Ed25519' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, key, msgBytes);
  return b64.encode(sig);
}

async function verifyBytesEd25519(pubB64, msgBytes, sigB64) {
  const key = await crypto.subtle.importKey('raw', b64.decode(pubB64), { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify({ name: 'Ed25519' }, key, b64.decode(sigB64), msgBytes);
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
  const signing = await ensureSigningIdentity(userId);
  const signedPrekeySignatureB64 = await signBytesEd25519(userId, b64.decode(signedPrekeyPublicKeyB64));
  await apiRequest('/api/keys/devices/register', {
    method: 'POST',
    body: JSON.stringify({ userId, deviceId: ensured.deviceId, identityPublicKeyB64, signedPrekeyPublicKeyB64, signedPrekeySignatureB64, identitySignPublicKeyB64: signing.pub }),
  });
  return ensured.deviceId;
}

async function resolvePeerBundle(apiRequest, recipientUid) {
  const forcedDev = localStorage.getItem(slot(`peer_dev_${recipientUid}`)) || recipientUid;
  try {
    const bundle = await apiRequest(`/api/keys/bundle/${encodeURIComponent(recipientUid)}/${encodeURIComponent(forcedDev)}`);
    localStorage.setItem(slot(`peer_dev_${recipientUid}`), bundle.device_id || forcedDev);
    if (bundle.identity_sign_public_key_b64 && bundle.signed_prekey_signature_b64 && bundle.signed_prekey_public_key_b64) {
      const ok = await verifyBytesEd25519(bundle.identity_sign_public_key_b64, b64.decode(bundle.signed_prekey_public_key_b64), bundle.signed_prekey_signature_b64);
      if (!ok) throw new Error('Signed prekey verification failed');
    }
    if (bundle.identity_public_key_b64) {
      const fpr = await peerFingerprint(bundle.identity_public_key_b64);
      const fprSlot = slot(`peer_fpr_${recipientUid}`);
      const previous = localStorage.getItem(fprSlot);
      if (previous && previous !== fpr) {
        throw new Error('Peer identity key changed. Potential MITM detected. Re-verify safety number.');
      }
      localStorage.setItem(fprSlot, fpr);
      localStorage.setItem(slot(`peer_pub_${recipientUid}`), bundle.identity_public_key_b64);
    }
    return bundle;
  } catch {
    const cached = localStorage.getItem(slot(`peer_pub_${recipientUid}`));
    if (!cached) throw new Error('Peer bundle unavailable and no cached key exists');
    return { device_id: forcedDev, identity_public_key_b64: cached };
  }
}

async function getOrCreateSessionKey(apiRequest, { threadId, senderUid, recipientUid }) {
  const [u1, u2] = ordered(senderUid, recipientUid);
  const sessionSlot = slot(`session_${threadId}_${u1}_${u2}`);
  const existing = localStorage.getItem(sessionSlot);
  if (existing) {
    return crypto.subtle.importKey('raw', b64.decode(existing), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  const myPriv = await getPrivateKey(senderUid);
  const bundle = await resolvePeerBundle(apiRequest, recipientUid);
  const peerPub = await importX25519Public(b64.decode(bundle.identity_public_key_b64));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'X25519', public: peerPub }, myPriv, 256));

  const salt = await sha256Bytes(te.encode(`chat/v1/salt/${threadId}/${u1}/${u2}`));
  const info = te.encode(`chat/v1/session/${threadId}/${u1}/${u2}`);
  const key = await hkdfKey(shared, salt, info);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  localStorage.setItem(sessionSlot, b64.encode(raw));
  return key;
}

export async function encryptMessageEnvelope(apiRequest, { threadId, senderUid, recipientUid, plaintext }) {
  const state = await loadOrCreateRatchetState(apiRequest, threadId, senderUid, recipientUid);
  const step = await nextChain(state.sendChainKeyB64);
  state.sendChainKeyB64 = step.nextChainKeyB64;
  state.sendCounter = (state.sendCounter || 0) + 1;
  localStorage.setItem(slot(`ratchet_${threadId}_${senderUid}_${recipientUid}`), JSON.stringify(state));
  await apiRequest('/api/keys/sessions/upsert', { method: 'POST', body: JSON.stringify(state) });
  const key = await crypto.subtle.importKey('raw', step.msgKeyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const senderDeviceId = localStorage.getItem(slot(`device_id_${senderUid}`)) || senderUid;
  const recipientDeviceId = localStorage.getItem(slot(`peer_dev_${recipientUid}`)) || recipientUid;
  const [u1, u2] = ordered(senderUid, recipientUid);
  const sessionId = `${threadId}:${u1}:${u2}`;
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const aad = te.encode(JSON.stringify({ threadId, senderDeviceId, recipientDeviceId, sessionId, protocol_version: '1.0' }));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: aad }, key, te.encode(plaintext));
  return {
    ciphertext_b64: b64.encode(ciphertext), nonce_b64: b64.encode(nonce), aad_b64: b64.encode(aad),
    protocol_version: '1.0', kex_algorithm: 'x25519', kdf_algorithm: 'hkdf-sha256', cipher: 'aes-256-gcm',
    sender_device_id: senderDeviceId, recipient_device_id: recipientDeviceId, session_id: sessionId, msg_counter: state.sendCounter, type: 'e2ee',
  };
}

export async function tryDecryptEnvelopeWithParticipants(apiRequest, threadId, payload, recipientUid, senderUid) {
  if (!payload?.ciphertext_b64 || !payload?.nonce_b64 || !payload?.aad_b64) return null;
  try {
    const state = await loadOrCreateRatchetState(apiRequest, threadId, recipientUid, senderUid);
    const targetCounter = Number(payload.msg_counter || 0);

    const skipped = getSkippedKey(threadId, recipientUid, senderUid, targetCounter);
    let keyBytes = null;
    if (skipped) {
      keyBytes = b64.decode(skipped);
      localStorage.removeItem(skippedSlot(threadId, recipientUid, senderUid, targetCounter));
    } else {
      while ((state.recvCounter || 0) < targetCounter - 1) {
        const inter = await nextChain(state.recvChainKeyB64);
        const futureCounter = (state.recvCounter || 0) + 1;
        setSkippedKey(threadId, recipientUid, senderUid, futureCounter, b64.encode(inter.msgKeyBytes));
        state.recvChainKeyB64 = inter.nextChainKeyB64;
        state.recvCounter = futureCounter;
      }
      const step = await nextChain(state.recvChainKeyB64);
      keyBytes = step.msgKeyBytes;
      state.recvChainKeyB64 = step.nextChainKeyB64;
      state.recvCounter = (state.recvCounter || 0) + 1;
      localStorage.setItem(slot(`ratchet_${threadId}_${recipientUid}_${senderUid}`), JSON.stringify(state));
      await apiRequest('/api/keys/sessions/upsert', { method: 'POST', body: JSON.stringify(state) });
    }

    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
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


async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, dataBytes));
}

async function nextChain(chainKeyB64) {
  const ck = b64.decode(chainKeyB64);
  const nextCk = await hmacSha256(ck, te.encode('chain-next'));
  const msgKey = await hmacSha256(ck, te.encode('msg-key'));
  return { nextChainKeyB64: b64.encode(nextCk), msgKeyBytes: msgKey.slice(0, 32) };
}

export async function loadOrCreateRatchetState(apiRequest, threadId, userId, peerUserId) {
  const cache = localStorage.getItem(slot(`ratchet_${threadId}_${userId}_${peerUserId}`));
  if (cache) return JSON.parse(cache);
  try {
    const srv = await apiRequest(`/api/keys/sessions/${encodeURIComponent(threadId)}/${encodeURIComponent(userId)}/${encodeURIComponent(peerUserId)}`);
    localStorage.setItem(slot(`ratchet_${threadId}_${userId}_${peerUserId}`), JSON.stringify(srv));
    return srv;
  } catch {
    const base = await sha256Bytes(te.encode(`rk/${threadId}/${ordered(userId, peerUserId).join('/')}`));
    const send = await hmacSha256(base, te.encode('send-init'));
    const recv = await hmacSha256(base, te.encode('recv-init'));
    const state = { threadId, userId, peerUserId, rootKeyB64: b64.encode(base), sendChainKeyB64: b64.encode(send), recvChainKeyB64: b64.encode(recv), sendCounter: 0, recvCounter: 0 };
    localStorage.setItem(slot(`ratchet_${threadId}_${userId}_${peerUserId}`), JSON.stringify(state));
    await apiRequest('/api/keys/sessions/upsert', { method: 'POST', body: JSON.stringify(state) });
    return state;
  }
}


export async function getSafetyNumber(recipientUid) {
  const peerPub = localStorage.getItem(slot(`peer_pub_${recipientUid}`));
  if (!peerPub) return null;
  const fpr = await peerFingerprint(peerPub);
  return fpr.match(/.{1,4}/g)?.join(' ') || fpr;
}
