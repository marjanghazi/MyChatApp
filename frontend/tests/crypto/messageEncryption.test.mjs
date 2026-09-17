import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, message, received, memoryStore } from './helpers.mjs';
import { createMessageEncryption } from '../../src/crypto/protocol/messageEncryption.js';
import { getSuite } from '../../src/crypto/suites.js';

const corrupt = (value) => { const bytes = Buffer.from(value, 'base64'); bytes[0] ^= 1; return bytes.toString('base64'); };

for (const suiteId of ['classical', 'pqc']) {
  test(`${suiteId}: independent clients, sender history, reload, out-of-order, empty and Unicode messages`, async () => {
    const f = await setup();
    const first = await f.alice.encrypt(message(suiteId));
    const second = await f.alice.encrypt(message(suiteId, ''));
    assert.notEqual(first.message_id, second.message_id);
    assert.notEqual(first.nonce_b64, second.nonce_b64);
    assert.equal(await f.bob.decrypt(received(second)), '');
    assert.equal(await f.bob.decrypt(received(first)), message(suiteId).plaintext);
    assert.equal(await f.alice.decrypt(received(first, 'alice')), message(suiteId).plaintext);
    const reloaded = createMessageEncryption({ store: f.bobStore, apiRequest: f.apiRequest });
    assert.equal(await reloaded.decrypt(received(first)), message(suiteId).plaintext);
    assert.equal(await reloaded.decrypt(received(first)), message(suiteId).plaintext); // History rendering isn't a replayed send.
    const reply = await f.bob.encrypt({ ...message(suiteId), senderUid: 'bob', recipientUid: 'alice' });
    assert.equal(await f.alice.decrypt({ ...received(reply, 'alice'), senderUid: 'bob', recipientUid: 'alice' }), message(suiteId).plaintext);
  });
  test(`${suiteId}: rejects altered ciphertext, nonce, signatures, wraps, metadata, and wrong participants`, async () => {
    const f = await setup();
    const original = await f.alice.encrypt(message(suiteId));
    const mutations = [
      (p) => { p.ciphertext_b64 = corrupt(p.ciphertext_b64); },
      (p) => { p.nonce_b64 = corrupt(p.nonce_b64); },
      (p) => { p.signature_b64 = corrupt(p.signature_b64); },
      (p) => { p.sender_bundle.signature_b64 = 'AA=='; },
      (p) => { p.key_wraps[1].kem_ciphertext_b64 = 'AA=='; },
      (p) => { p.key_wraps[1].wrapped_key_b64 = 'AA=='; },
      (p) => { p.message_id = crypto.randomUUID(); },
      (p) => { p.recipient_user_id = 'mallory'; },
      (p) => { p.signature_algorithm = 'none'; },
      (p) => { p.aad_b64 = ''; },
      (p) => { p.suite_id = 'unknown'; },
      (p) => { p.protocol_version = '1.0'; },
    ];
    for (const mutate of mutations) {
      const modified = structuredClone(original); mutate(modified);
      await assert.rejects(() => f.bob.decrypt(received(modified)));
    }
    await assert.rejects(() => f.bob.decrypt({ ...received(original), threadId: 'other-thread' }));
    await assert.rejects(() => f.bob.decrypt(received(original, 'mallory')));
    assert.equal(await f.bob.decrypt(received(original)), message(suiteId).plaintext, 'Failed verification must not corrupt state');
  });
  test(`${suiteId}: no secrets uploaded, IDs alone cannot decrypt`, async () => {
    const f = await setup();
    const envelope = await f.alice.encrypt(message(suiteId));
    const uploaded = JSON.stringify(f.requests);
    assert.ok(!uploaded.includes('secretKey') && !uploaded.includes('rootKey') && !uploaded.includes('ChainKey'));
    assert.ok(!JSON.stringify(envelope).includes(message(suiteId).plaintext));
    const attacker = createMessageEncryption({ store: memoryStore(), apiRequest: f.apiRequest });
    await assert.rejects(() => attacker.decrypt(received(envelope)));
  });
  test(`${suiteId}: pins identities and refuses changed contacts or invalid bundles without fallback`, async () => {
    const f = await setup();
    await f.alice.encrypt(message(suiteId));
    const replacement = createMessageEncryption({ store: memoryStore(), apiRequest: f.apiRequest });
    await replacement.register('bob');
    await assert.rejects(() => f.alice.encrypt(message(suiteId)), /identity changed/);
    const bundle = f.bundles.get(`bob/${suiteId}`);
    bundle.signature_b64 = 'AA==';
    await assert.rejects(() => f.alice.encrypt(message(suiteId)));
    f.bundles.delete(`bob/${suiteId}`);
    await assert.rejects(() => f.alice.encrypt(message(suiteId)), /No compatible/);
  });
  test(`${suiteId}: explicit safety-number verification trusts only the compared replacement`, async () => {
    const f = await setup();
    await f.alice.encrypt(message(suiteId));
    const replacement = createMessageEncryption({ store: memoryStore(), apiRequest: f.apiRequest });
    await replacement.register('bob');
    await assert.rejects(() => f.alice.trustContact('alice', 'bob', suiteId, 'wrong number'));
    await assert.rejects(() => f.alice.encrypt(message(suiteId)), /identity changed/);
    const verified = await f.alice.safetyNumber('alice', 'bob', suiteId);
    await f.alice.trustContact('alice', 'bob', suiteId, verified);
    const envelope = await f.alice.encrypt(message(suiteId));
    assert.equal(await replacement.decrypt(received(envelope)), message(suiteId).plaintext);
  });
  test(`${suiteId}: safety number is identical on both participants`, async () => {
    const f = await setup();
    assert.equal(await f.alice.safetyNumber('alice', 'bob', suiteId), await f.bob.safetyNumber('bob', 'alice', suiteId));
  });
}

test('classical to PQC migration preserves both kinds of history without changing chat protocol', async () => {
  const f = await setup();
  const before = await f.alice.encrypt(message('classical', 'Before migration'));
  const after = await f.alice.encrypt(message('pqc', 'After migration'));
  assert.equal(await f.bob.decrypt(received(before)), 'Before migration');
  assert.equal(await f.bob.decrypt(received(after)), 'After migration');
  assert.equal(before.cipher, after.cipher);
  assert.notEqual(before.kex_algorithm, after.kex_algorithm);
  assert.notEqual(before.signature_algorithm, after.signature_algorithm);
  assert.throws(() => getSuite('kyber-placeholder'));
});
