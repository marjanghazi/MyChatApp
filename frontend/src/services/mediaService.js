import { apiRequest } from "./apiClient";
import { beginPqcActivity } from "../crypto/pqcActivity.js";

const fileToBase64 = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

export const uploadMedia = async ({ uid, folder, file }) => {
  const dataBase64 = await fileToBase64(file);

  return apiRequest("/api/media/upload", {
    method: "POST",
    body: JSON.stringify({
      uid,
      folder,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      dataBase64,
    }),
  });
};

// Only ciphertext is uploaded for direct-chat attachments. The descriptor travels
// INSIDE the authenticated message, never alongside the upload.
export const uploadEncryptedMedia = async ({ uid, file }) => {
  const progress = beginPqcActivity('attachment');
  try {
    const { encryptAttachment } = await import('../crypto/protocol/attachmentEncryption.js');
    const { toBase64, fromBase64 } = await import('../crypto/primitives/encoding.js');
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    progress('aes', 'active');
    const aesStart = performance.now();
    const { ciphertext, descriptor } = await encryptAttachment(fileBytes);
    progress('aes', 'done', null, { durationMs: performance.now() - aesStart,
      metrics: { plaintextBytes: fileBytes.length, ciphertextBytes: ciphertext.length, nonceBytes: fromBase64(descriptor.nonce_b64).length } });
    progress('relay', 'active');
    const relayStart = performance.now();
    const uploaded = await apiRequest('/api/media/upload', {
      method: 'POST', body: JSON.stringify({ uid, folder: 'attachments', fileName: `${crypto.randomUUID()}.bin`,
        contentType: 'application/octet-stream', dataBase64: toBase64(ciphertext) }),
    });
    progress('relay', 'done', null, { durationMs: performance.now() - relayStart });
    progress.complete();
    return { fileURL: uploaded.url, fileEncryption: descriptor };
  } catch (error) {
    progress.fail();
    throw error;
  }
};

const decryptedAttachments = new Map();
export const clearDecryptedAttachments = () => {
  for (const promise of decryptedAttachments.values()) promise.then((url) => URL.revokeObjectURL(url)).catch(() => {});
  decryptedAttachments.clear();
};
export async function resolveEncryptedMedia(content) {
  if (!content.fileEncryption) return content;
  const url = content.encryptedFileURL || content.fileURL;
  const cacheKey = JSON.stringify([url, content.fileEncryption, content.mimeType]);
  if (!decryptedAttachments.has(cacheKey)) {
    const pending = (async () => {
      const { decryptAttachment, MAX_ATTACHMENT_BYTES } = await import('../crypto/protocol/attachmentEncryption.js');
      let mediaURL = new URL(url, window.location.origin);
      // Old local uploads stored an absolute localhost URL. Route those
      // through the current origin so the same ciphertext works over ngrok.
      if (["localhost", "127.0.0.1"].includes(mediaURL.hostname) && mediaURL.pathname.startsWith("/api/media/local/")) {
        mediaURL = new URL(`${mediaURL.pathname}${mediaURL.search}`, window.location.origin);
      }
      const backendOrigin = new URL(process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000', window.location.origin).origin;
      if (![window.location.origin, backendOrigin].includes(mediaURL.origin)) throw new Error('Unknown attachment host');
      const response = await fetch(mediaURL.href, { credentials: 'omit' });
      if (!response.ok) throw new Error('Encrypted attachment unavailable');
      if (Number(response.headers.get('Content-Length')) > MAX_ATTACHMENT_BYTES + 16) throw new Error('Attachment too large');
      const plaintext = await decryptAttachment(new Uint8Array(await response.arrayBuffer()), content.fileEncryption);
      return URL.createObjectURL(new Blob([plaintext], { type: content.mimeType || 'application/octet-stream' }));
    })();
    decryptedAttachments.set(cacheKey, pending);
    pending.catch(() => decryptedAttachments.delete(cacheKey));
  }
  return { ...content, encryptedFileURL: url, fileURL: await decryptedAttachments.get(cacheKey) };
}
