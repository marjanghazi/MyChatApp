import { utf8, randomBytes } from './encoding.js';

export async function deriveWrappingKey(secret, context) {
  const input = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  const salt = await crypto.subtle.digest('SHA-256', context);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: utf8('quantx/v2/key-wrap') }, input, 256,
  ));
}
export async function seal(keyBytes, plaintext, aad) {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const nonce = randomBytes(12);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 }, key, plaintext,
  ));
  return { nonce, ciphertext };
}
export async function open(keyBytes, ciphertext, nonce, aad) {
  if (nonce.length !== 12) throw new Error('Invalid AES-GCM nonce');
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad, tagLength: 128 }, key, ciphertext,
  ));
}
