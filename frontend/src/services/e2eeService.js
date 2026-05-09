import { apiRequest } from "./apiClient";

const CURVE = "P-256";
const SUITE = {
  kem: "ECDH-P256",
  aead: "AES-256-GCM",
  sig: "ECDSA-P256-SHA256",
  kdf: "HKDF-SHA256",
  version: 1,
};

const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const must = (value, msg) => {
  if (!value) throw new Error(msg);
  return value;
};

async function ensureIdentity(uid) {
  const privKeyRef = `e2ee:priv:${uid}`;
  const pubKeyRef = `e2ee:pub:${uid}`;
  const cachedPriv = localStorage.getItem(privKeyRef);
  const cachedPub = localStorage.getItem(pubKeyRef);
  if (cachedPriv && cachedPub) {
    return { privateJwk: JSON.parse(cachedPriv), publicJwk: JSON.parse(cachedPub) };
  }

  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: CURVE }, true, ["deriveBits"]);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  localStorage.setItem(privKeyRef, JSON.stringify(privateJwk));
  localStorage.setItem(pubKeyRef, JSON.stringify(publicJwk));
  return { privateJwk, publicJwk };
}

async function ensureSigningIdentity(uid) {
  const privKeyRef = `e2ee:sign:priv:${uid}`;
  const pubKeyRef = `e2ee:sign:pub:${uid}`;
  const cachedPriv = localStorage.getItem(privKeyRef);
  const cachedPub = localStorage.getItem(pubKeyRef);
  if (cachedPriv && cachedPub) {
    return { privateJwk: JSON.parse(cachedPriv), publicJwk: JSON.parse(cachedPub) };
  }

  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: CURVE }, true, ["sign", "verify"]);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  localStorage.setItem(privKeyRef, JSON.stringify(privateJwk));
  localStorage.setItem(pubKeyRef, JSON.stringify(publicJwk));
  return { privateJwk, publicJwk };
}

export async function publishSelfKeyBundle(uid) {
  if (!uid) return;
  const { publicJwk } = await ensureIdentity(uid);
  const { publicJwk: signPublicJwk } = await ensureSigningIdentity(uid);
  await apiRequest("/api/e2ee/keys/publish", {
    method: "POST",
    body: JSON.stringify({
      uid,
      deviceId: "web-default",
      keyBundle: {
        suite: SUITE,
        identityKey: JSON.stringify(publicJwk),
        signedPreKey: JSON.stringify(publicJwk),
        signedPreKeySignature: JSON.stringify(signPublicJwk),
        oneTimePreKeys: [],
      },
    }),
  });
}

async function deriveSessionAesKey(myUid, peerPublicJwk, saltInput) {
  const { privateJwk } = await ensureIdentity(myUid);
  const myPrivate = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDH", namedCurve: CURVE }, false, ["deriveBits"]);
  const theirPublic = await crypto.subtle.importKey("jwk", peerPublicJwk, { name: "ECDH", namedCurve: CURVE }, false, []);

  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: theirPublic }, myPrivate, 256);
  const salt = saltInput ? fromB64(saltInput) : crypto.getRandomValues(new Uint8Array(32));
  const ikm = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const info = enc.encode("mychatapp:e2ee:aesgcm:v1");

  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  return { key, salt: toB64(salt) };
}

function signingTranscript(encrypted) {
  return enc.encode(
    [
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.salt,
      encrypted.kem,
      encrypted.aead,
      encrypted.kdf,
      encrypted.sig,
      String(encrypted.version),
    ].join(".")
  );
}

export async function encryptTextForRecipient({ senderUid, recipientUid, text }) {
  const bundles = await apiRequest(`/api/e2ee/keys/${encodeURIComponent(recipientUid)}`);
  const recipient = (bundles?.bundles || [])[0];
  must(recipient?.identityKey, "Recipient key bundle missing");

  const { publicJwk } = await ensureIdentity(senderUid);
  const { key, salt } = await deriveSessionAesKey(senderUid, JSON.parse(recipient.identityKey));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, enc.encode(text || ""));

  const { privateJwk: signPrivateJwk, publicJwk: signPublicJwk } = await ensureSigningIdentity(senderUid);
  const signingKey = await crypto.subtle.importKey("jwk", signPrivateJwk, { name: "ECDSA", namedCurve: CURVE }, false, ["sign"]);

  const encrypted = {
    version: SUITE.version,
    kem: SUITE.kem,
    aead: SUITE.aead,
    kdf: SUITE.kdf,
    sig: SUITE.sig,
    ciphertext: toB64(ciphertext),
    nonce: toB64(nonce),
    salt,
    ephemeralPubKey: btoa(JSON.stringify(publicJwk)),
    senderDeviceId: "web-default",
    keyId: btoa(JSON.stringify(signPublicJwk)),
  };

  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signingKey, signingTranscript(encrypted));
  return { ...encrypted, signature: toB64(signature) };
}

export async function decryptTextFromSender({ receiverUid, senderIdentityJwk, senderSigningJwk, encrypted }) {
  must(encrypted, "Missing encrypted payload");
  must(encrypted.signature, "Missing message signature");
  must(encrypted.keyId, "Missing signer key");
  must(encrypted.ciphertext && encrypted.nonce, "Invalid encrypted payload");

  const claimedSigningJwk = JSON.parse(atob(encrypted.keyId));
  if (senderSigningJwk) {
    const trusted = JSON.stringify(senderSigningJwk);
    const claimed = JSON.stringify(claimedSigningJwk);
    if (trusted !== claimed) throw new Error("Signer key does not match trusted sender bundle");
  }

  const verifyKey = await crypto.subtle.importKey(
    "jwk",
    claimedSigningJwk,
    { name: "ECDSA", namedCurve: CURVE },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    verifyKey,
    fromB64(encrypted.signature),
    signingTranscript(encrypted)
  );
  if (!valid) throw new Error("Invalid message signature");

  const senderJwk = encrypted?.ephemeralPubKey ? JSON.parse(atob(encrypted.ephemeralPubKey)) : senderIdentityJwk;
  must(senderJwk, "Missing sender identity key");

  const { key } = await deriveSessionAesKey(receiverUid, senderJwk, encrypted.salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(encrypted.nonce) },
    key,
    fromB64(encrypted.ciphertext)
  );
  return dec.decode(plaintext);
}
