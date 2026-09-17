import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptAttachment, decryptAttachment } from '../../src/crypto/protocol/attachmentEncryption.js';

test('attachment bytes roundtrip; wrong keys and modified bytes fail authentication', async () => {
  const original = new Uint8Array([0, 255, 1, 128, 12, 0]);
  const result = await encryptAttachment(original);
  assert.deepEqual(await decryptAttachment(result.ciphertext, result.descriptor), original);
  const changed = result.ciphertext.slice(); changed[0] ^= 1;
  await assert.rejects(() => decryptAttachment(changed, result.descriptor));
  const other = await encryptAttachment(original);
  await assert.rejects(() => decryptAttachment(result.ciphertext, other.descriptor));
});
