// Stable application API. Providers and protocol details live in src/crypto/.
import { configuredSuite } from '../crypto/suites.js';
import { createIdentityStore } from '../crypto/storage/identityStore.js';
import { createMessageEncryption } from '../crypto/protocol/messageEncryption.js';

const store = createIdentityStore();
const engines = new WeakMap();
function engine(apiRequest) {
  if (!engines.has(apiRequest)) engines.set(apiRequest, createMessageEncryption({ store, apiRequest }));
  return engines.get(apiRequest);
}
export const registerDeviceBundle = (apiRequest, userId) => engine(apiRequest).register(userId);
export async function encryptMessageEnvelope(apiRequest, options) {
  // Authentication/session startup registers both public bundles. Re-uploading
  // the large PQC bundle before every message adds a full network round trip and
  // tens of kilobytes without changing the browser-held identity.
  return engine(apiRequest).encrypt({ ...options, suiteId: configuredSuite().id });
}
export const decryptMessageEnvelope = (apiRequest, options) => engine(apiRequest).decrypt(options);
export async function decryptEnvelopeWithParticipants(apiRequest, threadId, payload, recipientUid, senderUid, viewerUid) {
  if (!payload?.ciphertext_b64) return null;
  const userId = viewerUid || JSON.parse(localStorage.getItem('pqc_auth_user') || 'null')?.uid;
  return decryptMessageEnvelope(apiRequest, { threadId, payload, userId, senderUid, recipientUid });
}
export async function tryDecryptEnvelopeWithParticipants(apiRequest, threadId, payload, recipientUid, senderUid, viewerUid) {
  if (!payload?.ciphertext_b64) return null;
  try {
    return await decryptEnvelopeWithParticipants(apiRequest, threadId, payload, recipientUid, senderUid, viewerUid);
  } catch { return null; }
}
export async function getSafetyNumber(peerUid) {
  const { apiRequest } = await import('./apiClient.js');
  const userId = JSON.parse(localStorage.getItem('pqc_auth_user') || 'null')?.uid;
  if (!userId) return null;
  return engine(apiRequest).safetyNumber(userId, peerUid, configuredSuite().id);
}

export async function trustContactIdentity(peerUid, verifiedNumber) {
  const { apiRequest } = await import('./apiClient.js');
  const userId = JSON.parse(localStorage.getItem('pqc_auth_user') || 'null')?.uid;
  if (!userId) throw new Error('Sign in first');
  await engine(apiRequest).trustContact(userId, peerUid, configuredSuite().id, verifiedNumber);
}
