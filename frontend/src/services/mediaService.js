import { apiRequest } from "./apiClient";

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
  const { encryptAttachment } = await import('../crypto/protocol/attachmentEncryption.js');
  const { toBase64 } = await import('../crypto/primitives/encoding.js');
  const { ciphertext, descriptor } = await encryptAttachment(new Uint8Array(await file.arrayBuffer()));
  const uploaded = await apiRequest('/api/media/upload', {
    method: 'POST', body: JSON.stringify({ uid, folder: 'attachments', fileName: `${crypto.randomUUID()}.bin`,
      contentType: 'application/octet-stream', dataBase64: toBase64(ciphertext) }),
  });
  return { fileURL: uploaded.url, fileEncryption: descriptor };
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
      const mediaURL = new URL(url, window.location.origin);
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
