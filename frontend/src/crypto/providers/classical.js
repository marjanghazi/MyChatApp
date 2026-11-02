/*
 * Historical X25519/Ed25519 provider, retained as a commented reference.
 * QuantX now runs only ML-KEM-768 and ML-DSA-65 from postQuantum.js.
async function generate(name, usages) {
  const pair = await crypto.subtle.generateKey({ name }, true, usages);
  return {
    publicKey: new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)),
    secretKey: new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
  };
}
async function sharedSecret(secretKey, publicKey) {
  const own = await crypto.subtle.importKey('pkcs8', secretKey, 'X25519', false, ['deriveBits']);
  const peer = await crypto.subtle.importKey('raw', publicKey, 'X25519', false, []);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'X25519', public: peer }, own, 256));
}

// Ephemeral-static X25519 exposes the same encapsulate/decapsulate contract as ML-KEM.
export const classical = {
  id: 'classical', label: 'Classical', kex: 'x25519', signature: 'ed25519',
  keygen: () => generate('X25519', ['deriveBits']),
  signingKeygen: () => generate('Ed25519', ['sign', 'verify']),
  async encapsulate(publicKey) {
    const ephemeral = await this.keygen();
    try {
      return { cipherText: ephemeral.publicKey, sharedSecret: await sharedSecret(ephemeral.secretKey, publicKey) };
    } finally { ephemeral.secretKey.fill(0); }
  },
  decapsulate: (cipherText, secretKey) => sharedSecret(secretKey, cipherText),
  async sign(message, secretKey) {
    const key = await crypto.subtle.importKey('pkcs8', secretKey, 'Ed25519', false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('Ed25519', key, message));
  },
  async verify(signature, message, publicKey) {
    const key = await crypto.subtle.importKey('raw', publicKey, 'Ed25519', false, ['verify']);
    return crypto.subtle.verify('Ed25519', key, signature, message);
  },
};
*/
