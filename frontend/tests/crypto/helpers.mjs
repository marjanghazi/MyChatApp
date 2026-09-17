import { createMessageEncryption } from '../../src/crypto/protocol/messageEncryption.js';
export function memoryStore() {
  const values = new Map();
  return { values, get: async (key) => structuredClone(values.get(key)), set: async (key, value) => { values.set(key, structuredClone(value)); } };
}
export async function setup() {
  const bundles = new Map();
  const requests = [];
  const apiRequest = async (path, options) => {
    requests.push({ path, options });
    if (path.endsWith('/register')) {
      for (const bundle of JSON.parse(options.body).bundles) bundles.set(`${bundle.user_id}/${bundle.suite_id}`, bundle);
      return { ok: true };
    }
    const bundle = bundles.get(path.split('/bundle/')[1]);
    if (!bundle) throw new Error('No compatible bundle');
    return structuredClone(bundle);
  };
  const aliceStore = memoryStore();
  const bobStore = memoryStore();
  const alice = createMessageEncryption({ store: aliceStore, apiRequest });
  const bob = createMessageEncryption({ store: bobStore, apiRequest });
  await alice.register('alice');
  await bob.register('bob');
  return { alice, bob, aliceStore, bobStore, apiRequest, bundles, requests };
}
export const message = (suiteId, plaintext = 'Hello مرحبا 🔐') => ({ threadId: 'alice_bob', senderUid: 'alice', recipientUid: 'bob', plaintext, suiteId });
export const received = (payload, userId = 'bob') => ({ threadId: 'alice_bob', senderUid: 'alice', recipientUid: 'bob', userId, payload });
