import { getSuite, suites } from '../suites.js';
import { canonical, encodeObject, fromBase64, toBase64, fingerprint, randomBytes, utf8, decodeUtf8 } from '../primitives/encoding.js';
import { deriveWrappingKey, seal, open } from '../primitives/symmetric.js';

const VERSION = '2.0';
const identitySlot = (uid, suite) => `identity:${uid}:${suite}`;
const pinSlot = (owner, peer, suite) => `trust:${owner}:${peer}:${suite}`;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function publicBundle(identity) {
  return {
    protocol_version: VERSION, suite_id: identity.suiteId, user_id: identity.userId,
    device_id: identity.deviceId, encryption_public_key_b64: toBase64(identity.encryption.publicKey),
    signing_public_key_b64: toBase64(identity.signing.publicKey),
  };
}
function unsignedBundle(bundle) {
  const { signature_b64, ...unsigned } = bundle;
  return unsigned;
}
async function validateBundle(bundle, userId, suiteId) {
  const suite = getSuite(suiteId);
  if (bundle?.protocol_version !== VERSION || bundle.suite_id !== suiteId || bundle.user_id !== userId || !bundle.device_id) {
    throw new Error('Peer has no compatible encryption identity. Ask them to sign in with the updated app.');
  }
  if (!await suite.verify(fromBase64(bundle.signature_b64), encodeObject(unsignedBundle(bundle)), fromBase64(bundle.signing_public_key_b64))) {
    throw new Error('Invalid identity signature');
  }
}
function coreHeader(envelope) {
  const fields = ['protocol_version', 'suite_id', 'kex_algorithm', 'signature_algorithm', 'kdf_algorithm', 'cipher',
    'thread_id', 'sender_user_id', 'recipient_user_id', 'sender_device_id', 'recipient_device_id',
    'session_id', 'message_id', 'sender_bundle'];
  return Object.fromEntries(fields.map((key) => [key, envelope[key]]));
}
function header(envelope) { return { ...coreHeader(envelope), key_wraps: envelope.key_wraps }; }
function signedMessage(envelope) {
  return encodeObject({ header: header(envelope), nonce_b64: envelope.nonce_b64, ciphertext_b64: envelope.ciphertext_b64 });
}

export function createMessageEncryption({ store, apiRequest }) {
  const pendingIdentities = new Map();
  const lock = (name, fn) => typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request(`quantx:${name}`, fn) : fn();

  async function ensureIdentity(userId, suiteId) {
    if (!userId) throw new Error('Sign in before creating encryption keys');
    const key = identitySlot(userId, suiteId);
    if (!pendingIdentities.has(key)) {
      const pending = lock(key, async () => {
        const existing = await store.get(key);
        if (existing) return existing;
        const suite = getSuite(suiteId);
        const identity = { userId, suiteId, deviceId: crypto.randomUUID(),
          encryption: await suite.keygen(), signing: await suite.signingKeygen() };
        const bundle = publicBundle(identity);
        identity.bundle = { ...bundle, signature_b64: toBase64(await suite.sign(encodeObject(bundle), identity.signing.secretKey)) };
        await store.set(key, identity);
        return identity;
      });
      pendingIdentities.set(key, pending);
      pending.catch(() => pendingIdentities.delete(key));
    }
    return pendingIdentities.get(key);
  }

  async function register(userId) {
    const identities = await Promise.all(Object.keys(suites).map((id) => ensureIdentity(userId, id)));
    await apiRequest('/api/keys/v2/devices/register', {
      method: 'POST', body: JSON.stringify({ bundles: identities.map((identity) => identity.bundle) }),
    });
    return identities[0].deviceId;
  }

  async function checkTrust(owner, bundle, commit = false) {
    const key = pinSlot(owner, bundle.user_id, bundle.suite_id);
    const current = await fingerprint(unsignedBundle(bundle));
    await lock(key, async () => {
      const stored = await store.get(key);
      // Version 2 originally stored one fingerprint. Preserve it while moving
      // to a list so a verified key rotation does not make authentic history
      // look tampered with.
      const trusted = Array.isArray(stored) ? stored : (stored ? [stored] : []);
      if (trusted.length && !trusted.includes(current)) {
        throw new Error('Contact encryption identity changed. Open the chat menu, choose Safety number, compare it on both devices, then choose OK.');
      }
      if (commit && !trusted.includes(current)) await store.set(key, [...trusted, current]);
    });
    return current;
  }

  async function recipientBundle(recipientUid, suiteId) {
    const path = `/api/keys/v2/bundle/${encodeURIComponent(recipientUid)}/${suiteId}`;
    let lastError;
    // The recipient may be registering automatically at the same time this
    // sender opens the conversation. Brief retries remove that startup race.
    for (const delay of [0, 500, 1500, 3000]) {
      if (delay) await sleep(delay);
      try {
        return await apiRequest(path);
      } catch (error) {
        lastError = error;
        if (!/sign in with the updated app|compatible encryption identity/i.test(error?.message || '')) throw error;
      }
    }
    throw lastError;
  }

  async function encrypt({ threadId, senderUid, recipientUid, plaintext, suiteId }) {
    if (!threadId || !senderUid || !recipientUid) throw new Error('Direct message participants are required');
    const suite = getSuite(suiteId);
    const sender = await ensureIdentity(senderUid, suiteId);
    const recipient = senderUid === recipientUid ? sender.bundle
      : await recipientBundle(recipientUid, suiteId);
    await validateBundle(recipient, recipientUid, suiteId);
    await checkTrust(senderUid, recipient);
    const messageId = crypto.randomUUID();
    const core = {
      protocol_version: VERSION, suite_id: suiteId, kex_algorithm: suite.kex,
      signature_algorithm: suite.signature, kdf_algorithm: 'hkdf-sha256', cipher: 'aes-256-gcm',
      thread_id: threadId, sender_user_id: senderUid, recipient_user_id: recipientUid,
      sender_device_id: sender.deviceId, recipient_device_id: recipient.device_id,
      session_id: messageId, message_id: messageId, sender_bundle: sender.bundle,
    };
    // Fresh content key per message, wrapped for the receiver AND sender's history.
    const contentKey = randomBytes(32);
    try {
      const keyWraps = [];
      for (const bundle of senderUid === recipientUid ? [recipient] : [sender.bundle, recipient]) {
        const encapsulated = await suite.encapsulate(fromBase64(bundle.encryption_public_key_b64));
        const wrap = { user_id: bundle.user_id, device_id: bundle.device_id, kem_ciphertext_b64: toBase64(encapsulated.cipherText) };
        const context = encodeObject({ ...core, ...wrap });
        const wrappingKey = await deriveWrappingKey(encapsulated.sharedSecret, context);
        try {
          const sealed = await seal(wrappingKey, contentKey, context);
          keyWraps.push({ ...wrap, nonce_b64: toBase64(sealed.nonce), wrapped_key_b64: toBase64(sealed.ciphertext) });
        } finally { encapsulated.sharedSecret.fill(0); wrappingKey.fill(0); }
      }
      const envelope = { ...core, key_wraps: keyWraps };
      const aad = encodeObject(header(envelope));
      const sealed = await seal(contentKey, utf8(plaintext), aad);
      Object.assign(envelope, { aad_b64: toBase64(aad), nonce_b64: toBase64(sealed.nonce), ciphertext_b64: toBase64(sealed.ciphertext), type: 'e2ee' });
      envelope.signature_b64 = toBase64(await suite.sign(signedMessage(envelope), sender.signing.secretKey));
      await checkTrust(senderUid, recipient, true);
      return envelope;
    } finally { contentKey.fill(0); }
  }

  async function decrypt({ threadId, payload, userId, senderUid, recipientUid }) {
    if (payload.protocol_version !== VERSION) throw new Error('Legacy message uses an insecure retired protocol');
    const suite = getSuite(payload.suite_id);
    const mismatches = [];
    if (payload.thread_id !== threadId) mismatches.push('thread');
    if (payload.sender_user_id !== senderUid) mismatches.push('sender');
    if (payload.recipient_user_id !== recipientUid) mismatches.push('recipient');
    if (![senderUid, recipientUid].includes(userId)) mismatches.push('viewer');
    if (payload.kex_algorithm !== suite.kex) mismatches.push('key-exchange algorithm');
    if (payload.signature_algorithm !== suite.signature) mismatches.push('signature algorithm');
    if (payload.kdf_algorithm !== 'hkdf-sha256') mismatches.push('KDF');
    if (payload.cipher !== 'aes-256-gcm') mismatches.push('cipher');
    if (payload.session_id !== payload.message_id) mismatches.push('message identifier');
    if (mismatches.length) throw new Error(`Encrypted message context mismatch (${mismatches.join(', ')})`);
    const senderBundle = payload.sender_bundle;
    await validateBundle(senderBundle, senderUid, suite.id);
    if (senderBundle.device_id !== payload.sender_device_id) throw new Error('Sender device mismatch');
    await checkTrust(userId, senderBundle);
    if (payload.aad_b64 !== toBase64(encodeObject(header(payload)))) throw new Error('Message metadata was modified');
    if (!await suite.verify(fromBase64(payload.signature_b64), signedMessage(payload), fromBase64(senderBundle.signing_public_key_b64))) {
      throw new Error('Message signature verification failed');
    }
    const identity = await store.get(identitySlot(userId, suite.id));
    if (!identity) throw new Error('Message keys are not available in this browser');
    if (userId === senderUid && canonical(senderBundle) !== canonical(identity.bundle)) throw new Error('Own signing identity mismatch');
    const expectedDevice = userId === senderUid ? payload.sender_device_id : payload.recipient_device_id;
    const wrap = payload.key_wraps.find((entry) => entry.user_id === userId && entry.device_id === identity.deviceId);
    if (!wrap || identity.deviceId !== expectedDevice) throw new Error('Message belongs to another device');
    const context = encodeObject({ ...coreHeader(payload), user_id: wrap.user_id, device_id: wrap.device_id, kem_ciphertext_b64: wrap.kem_ciphertext_b64 });
    const secret = await suite.decapsulate(fromBase64(wrap.kem_ciphertext_b64), identity.encryption.secretKey);
    const wrappingKey = await deriveWrappingKey(secret, context);
    let contentKey;
    try {
      contentKey = await open(wrappingKey, fromBase64(wrap.wrapped_key_b64), fromBase64(wrap.nonce_b64), context);
      const bytes = await open(contentKey, fromBase64(payload.ciphertext_b64), fromBase64(payload.nonce_b64), fromBase64(payload.aad_b64));
      await checkTrust(userId, senderBundle, true);
      return decodeUtf8(bytes);
    } finally { secret.fill(0); wrappingKey.fill(0); contentKey?.fill(0); }
  }

  async function safetyNumber(userId, peerId, suiteId) {
    const identity = await ensureIdentity(userId, suiteId);
    const peer = peerId === userId ? identity.bundle : await apiRequest(`/api/keys/v2/bundle/${encodeURIComponent(peerId)}/${suiteId}`);
    await validateBundle(peer, peerId, suiteId);
    const fingerprints = await Promise.all([identity.bundle, peer].map((bundle) => fingerprint(unsignedBundle(bundle))));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(canonical(fingerprints.sort()))));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('').match(/.{1,4}/g).join(' ');
  }

  async function trustContact(userId, peerId, suiteId, verifiedNumber) {
    const peer = await apiRequest(`/api/keys/v2/bundle/${encodeURIComponent(peerId)}/${suiteId}`);
    await validateBundle(peer, peerId, suiteId);
    // Compare the exact fetched key pair to the number the user verified.
    const identity = await ensureIdentity(userId, suiteId);
    const fingerprints = await Promise.all([identity.bundle, peer].map((bundle) => fingerprint(unsignedBundle(bundle))));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(canonical(fingerprints.sort()))));
    const number = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('').match(/.{1,4}/g).join(' ');
    if (number !== verifiedNumber) throw new Error('Identity changed during verification. Compare safety numbers again.');
    const key = pinSlot(userId, peerId, suiteId);
    const stored = await store.get(key);
    const trusted = Array.isArray(stored) ? stored : (stored ? [stored] : []);
    const current = await fingerprint(unsignedBundle(peer));
    if (!trusted.includes(current)) await store.set(key, [...trusted, current]);
  }
  return { register, encrypt, decrypt, safetyNumber, trustContact };
}
