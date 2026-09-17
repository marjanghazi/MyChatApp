import { randomBytes, utf8, fromBase64, toBase64 } from '../primitives/encoding.js';
import { seal, open } from '../primitives/symmetric.js';
const AAD = utf8('quantx/v2/attachment');
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export async function encryptAttachment(bytes) {
  if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error('Attachment exceeds 15 MB');
  const key = randomBytes(32);
  try {
    const result = await seal(key, bytes, AAD);
    return { ciphertext: result.ciphertext, descriptor: { version: '2.0', cipher: 'aes-256-gcm', key_b64: toBase64(key), nonce_b64: toBase64(result.nonce) } };
  } finally { key.fill(0); }
}
export async function decryptAttachment(bytes, descriptor) {
  if (descriptor.version !== '2.0' || descriptor.cipher !== 'aes-256-gcm' || bytes.length > MAX_ATTACHMENT_BYTES + 16) throw new Error('Invalid encrypted attachment');
  const key = fromBase64(descriptor.key_b64);
  try { return await open(key, bytes, fromBase64(descriptor.nonce_b64), AAD); }
  finally { key.fill(0); }
}
