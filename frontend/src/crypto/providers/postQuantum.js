import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';

export const postQuantum = {
  id: 'pqc', label: 'Post-quantum', kex: 'ml-kem-768', signature: 'ml-dsa-65',
  keygen: () => ml_kem768.keygen(),
  signingKeygen: () => ml_dsa65.keygen(),
  encapsulate: (publicKey) => ml_kem768.encapsulate(publicKey),
  decapsulate: (cipherText, secretKey) => ml_kem768.decapsulate(cipherText, secretKey),
  sign: (message, secretKey) => ml_dsa65.sign(message, secretKey),
  verify: (signature, message, publicKey) => ml_dsa65.verify(signature, message, publicKey),
};
