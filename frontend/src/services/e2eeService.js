import { apiRequest } from "./apiClient";

const CURVE = "P-256";
const ALGO = "P256+AES-256-GCM";

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function ensureIdentity(uid) {
  const privKeyRef = `e2ee:priv:${uid}`;
  const pubKeyRef = `e2ee:pub:${uid}`;
  const cachedPriv = localStorage.getItem(privKeyRef);
  const cachedPub = localStorage.getItem(pubKeyRef);
  if (cachedPriv && cachedPub) {
    return { privateJwk: JSON.parse(cachedPriv), publicJwk: JSON.parse(cachedPub) };
  }

  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: CURVE }, true, ["deriveKey", "deriveBits"]);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  localStorage.setItem(privKeyRef, JSON.stringify(privateJwk));
  localStorage.setItem(pubKeyRef, JSON.stringify(publicJwk));
  return { privateJwk, publicJwk };
}

export async function publishSelfKeyBundle(uid) {
  if (!uid) return;
  const { publicJwk } = await ensureIdentity(uid);
  await apiRequest("/api/e2ee/keys/publish", {
    method: "POST",
    body: JSON.stringify({
      uid,
      deviceId: "web-default",
      keyBundle: {
        algorithm: ALGO,
        identityKey: JSON.stringify(publicJwk),
        signedPreKey: JSON.stringify(publicJwk),
        signedPreKeySignature: "web-self-signed",
        oneTimePreKeys: [],
      },
    }),
  });
}

async function deriveSharedAesKey(senderUid, recipientIdentityKeyJwk) {
  const { privateJwk } = await ensureIdentity(senderUid);
  const myPrivate = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDH", namedCurve: CURVE }, false, ["deriveKey"]);
  const theirPublic = await crypto.subtle.importKey("jwk", recipientIdentityKeyJwk, { name: "ECDH", namedCurve: CURVE }, false, []);
  return crypto.subtle.deriveKey({ name: "ECDH", public: theirPublic }, myPrivate, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptTextForRecipient({ senderUid, recipientUid, text }) {
  const bundles = await apiRequest(`/api/e2ee/keys/${encodeURIComponent(recipientUid)}`);
  const recipient = (bundles?.bundles || [])[0];
  if (!recipient?.identityKey) throw new Error("Recipient key bundle missing");
  const key = await deriveSharedAesKey(senderUid, JSON.parse(recipient.identityKey));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text || ""));
  return { algorithm: ALGO, version: 1, ciphertext: toB64(ciphertext), nonce: toB64(iv) };
}

export async function decryptTextFromSender({ receiverUid, senderIdentityJwk, encrypted }) {
  const key = await deriveSharedAesKey(receiverUid, senderIdentityJwk);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(encrypted.nonce) },
    key,
    fromB64(encrypted.ciphertext)
  );
  return new TextDecoder().decode(plaintext);
}
