import { createMessageEncryption } from '../protocol/messageEncryption.js';
import { fromBase64 } from '../primitives/encoding.js';
import { getSuite } from '../suites.js';

// An isolated relay and two browser stores exercise the same protocol used by chat.
// Nothing from this demonstration is saved or sent to the application backend.
function memoryStore() {
  const entries = new Map();
  return {
    get: async (key) => entries.get(key),
    set: async (key, value) => { entries.set(key, value); },
  };
}

export async function runProtocolDemo({ plaintext, onStage = () => {} }) {
  const suiteId = 'pqc';
  const suite = getSuite(suiteId);
  if (typeof plaintext !== 'string' || plaintext.length > 400) {
    throw new Error('Enter a message of up to 400 characters.');
  }
  const bundles = new Map();
  const relay = async (path, options) => {
    if (path.endsWith('/register')) {
      for (const bundle of JSON.parse(options.body).bundles) {
        bundles.set(`${bundle.user_id}/${bundle.suite_id}`, bundle);
      }
      return { ok: true };
    }
    const bundle = bundles.get(path.split('/bundle/')[1]);
    if (!bundle) throw new Error('Demo public identity is missing');
    return bundle;
  };
  const alice = createMessageEncryption({ store: memoryStore(), apiRequest: relay });
  const bob = createMessageEncryption({ store: memoryStore(), apiRequest: relay });
  const started = performance.now();
  await onStage('identities');
  await Promise.all([alice.register('demo-alice'), bob.register('demo-bob')]);
  const identityMs = performance.now() - started;

  await onStage('encrypt');
  const encryptStarted = performance.now();
  const envelope = await alice.encrypt({
    threadId: 'local-demo', senderUid: 'demo-alice', recipientUid: 'demo-bob', plaintext, suiteId,
  });
  const encryptMs = performance.now() - encryptStarted;

  await onStage('decrypt');
  const decryptStarted = performance.now();
  const received = await bob.decrypt({
    threadId: 'local-demo', payload: envelope, userId: 'demo-bob',
    senderUid: 'demo-alice', recipientUid: 'demo-bob',
  });
  const decryptMs = performance.now() - decryptStarted;
  if (received !== plaintext) throw new Error('Demo message did not round trip');

  await onStage('tamper');
  const changed = { ...envelope, ciphertext_b64: envelope.ciphertext_b64 };
  const bytes = fromBase64(changed.ciphertext_b64);
  bytes[0] ^= 1;
  changed.ciphertext_b64 = btoa(String.fromCharCode(...bytes));
  let tamperRejected = false;
  try {
    await bob.decrypt({
      threadId: 'local-demo', payload: changed, userId: 'demo-bob',
      senderUid: 'demo-alice', recipientUid: 'demo-bob',
    });
  } catch { tamperRejected = true; }
  if (!tamperRejected) throw new Error('Modified ciphertext was accepted');

  const recipientWrap = envelope.key_wraps.find((wrap) => wrap.user_id === 'demo-bob');
  return {
    suiteId, suiteLabel: suite.label, kex: suite.kex.toUpperCase(), signature: suite.signature.toUpperCase(),
    plaintext: received, tamperRejected,
    metrics: {
      identityMs, encryptMs, decryptMs,
      kemPublicKeyBytes: fromBase64(bundles.get(`demo-bob/${suiteId}`).encryption_public_key_b64).length,
      kemCiphertextBytes: fromBase64(recipientWrap.kem_ciphertext_b64).length,
      signingPublicKeyBytes: fromBase64(bundles.get(`demo-alice/${suiteId}`).signing_public_key_b64).length,
      signatureBytes: fromBase64(envelope.signature_b64).length,
      ciphertextBytes: fromBase64(envelope.ciphertext_b64).length,
      envelopeBytes: new TextEncoder().encode(JSON.stringify(envelope)).length,
    },
    publicEvidence: {
      messageId: envelope.message_id,
      nonce: envelope.nonce_b64,
      ciphertextPrefix: `${envelope.ciphertext_b64.slice(0, 36)}…`,
      signaturePrefix: `${envelope.signature_b64.slice(0, 36)}…`,
      wraps: envelope.key_wraps.length,
    },
  };
}
