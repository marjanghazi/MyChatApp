import { performance } from 'node:perf_hooks';
import { suites } from '../../src/crypto/suites.js';
import { setup, message, received } from './helpers.mjs';
const iterations = 10;
const rows = [];
for (const suite of Object.values(suites)) {
  const f = await setup();
  const keyStart = performance.now();
  const encryption = await suite.keygen();
  const signing = await suite.signingKeygen();
  const keygenMs = performance.now() - keyStart;
  let encryptMs = 0, decryptMs = 0, envelope;
  // Warm up both implementations before recording message measurements.
  await f.bob.decrypt(received(await f.alice.encrypt(message(suite.id))));
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    envelope = await f.alice.encrypt(message(suite.id, 'Migration benchmark'));
    const middle = performance.now();
    await f.bob.decrypt(received(envelope));
    encryptMs += middle - start;
    decryptMs += performance.now() - middle;
  }
  rows.push({ suite: suite.id, encryptionPublicKeyBytes: encryption.publicKey.length,
    signingPublicKeyBytes: signing.publicKey.length,
    messageSignatureBytes: Buffer.from(envelope.signature_b64, 'base64').length,
    envelopeBytes: Buffer.byteLength(JSON.stringify(envelope)),
    keygenMs: +keygenMs.toFixed(2), meanEncryptMs: +(encryptMs / iterations).toFixed(2), meanDecryptMs: +(decryptMs / iterations).toFixed(2) });
}
console.log(JSON.stringify({ runtime: process.version, iterations, note: 'Local Node measurements with an in-memory relay; includes protocol overhead, excludes network and DB.', results: rows }, null, 2));
