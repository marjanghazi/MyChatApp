/**
 * Chat service: transport wrappers + E2EE-aware send/fetch helpers.
 *
 * Security model:
 * - Direct plaintext is encrypted client-side before hitting backend `/messages/send`.
 * - Message fetch attempts client-side decryption and only renders plaintext locally.
 */
import { apiRequest } from "./apiClient";
import { resolveEncryptedMedia } from "./mediaService";
import { decryptEnvelopeWithParticipants, encryptMessageEnvelope } from "./e2eeService";
import { beginPqcActivity } from "../crypto/pqcActivity.js";

const seenMessagesByThread = new Map();

// Sends a chat message; auto-encrypts plaintext payloads into E2EE envelope when needed.
export const sendChatMessage = async (body) => {
  const payload = body?.payload || {};
  const hasEnvelope = payload.ciphertext_b64 && payload.nonce_b64 && payload.aad_b64;
  const progress = body.threadType === 'direct' && !hasEnvelope ? beginPqcActivity('send') : null;
  try {
    if (progress) {
      const envelope = await encryptMessageEnvelope(apiRequest, {
        threadId: body.threadId,
        senderUid: body.actorUid,
        recipientUid: body.targetUid,
        plaintext: JSON.stringify({ ...payload, ...(body.replyTo ? { replyTo: body.replyTo } : {}) }),
        onProgress: progress,
      });
      const { replyTo, text, ...transport } = body;
      body = { ...transport, payload: envelope };
    }
    progress?.('relay', 'active');
    const relayStart = performance.now();
    const result = await apiRequest('/api/chat/messages/send', {
      method: 'POST',
      body: JSON.stringify(body),
      timeoutMs: 45_000,
    });
    progress?.('relay', 'done', null, { durationMs: performance.now() - relayStart,
      metrics: { envelopeBytes: new TextEncoder().encode(JSON.stringify(body.payload)).length } });
    progress?.complete();
    return result;
  } catch (error) {
    progress?.fail();
    throw error;
  }
};

export const editChatMessage = async (body) => {
  const nextBody = { ...body };
  const encryptDirect = nextBody?.threadType === "direct" && nextBody?.threadId && nextBody?.actorUid && nextBody?.targetUid && typeof nextBody?.text === "string";
  const progress = encryptDirect ? beginPqcActivity('send') : null;
  try {
    if (encryptDirect) {
      const envelope = await encryptMessageEnvelope(apiRequest, {
        threadId: nextBody.threadId,
        senderUid: nextBody.actorUid,
        recipientUid: nextBody.targetUid,
        plaintext: JSON.stringify({ ...(nextBody.content || {}), type: nextBody.content?.type || 'text', text: nextBody.text }),
        onProgress: progress,
      });
      nextBody.payload = envelope;
      delete nextBody.text;
      delete nextBody.content;
    }
    progress?.('relay', 'active');
    const relayStart = performance.now();
    const result = await apiRequest("/api/chat/messages/edit", {
      method: "PATCH",
      body: JSON.stringify(nextBody),
    });
    progress?.('relay', 'done', null, { durationMs: performance.now() - relayStart,
      metrics: { envelopeBytes: new TextEncoder().encode(JSON.stringify(nextBody.payload)).length } });
    progress?.complete();
    return result;
  } catch (error) {
    progress?.fail();
    throw error;
  }
};

export const deleteChatMessageForMe = (body) =>
  apiRequest("/api/chat/messages/delete-for-me", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const deleteChatMessageForEveryone = (body) =>
  apiRequest("/api/chat/messages/delete-for-everyone", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

export const toggleChatMessageFlag = (body) =>
  apiRequest("/api/chat/messages/toggle-flag", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

// History is independently decryptable. Failed authentication never resets keys or falls back.
export const fetchThreadMessages = async (threadType, threadId, uid) => {
  const out = await apiRequest(`/api/chat/messages?threadType=${encodeURIComponent(threadType)}&threadId=${encodeURIComponent(threadId)}&uid=${encodeURIComponent(uid || '')}`);
  const seenKey = `${uid}:${threadType}:${threadId}`;
  const seen = seenMessagesByThread.get(seenKey) || new Set();
  const incoming = threadType === 'direct' ? (out.messages || []).filter((m) =>
    m.id && !seen.has(m.id) && !m.deletedForEveryone && m.suite_id === 'pqc' && m.ciphertext_b64 &&
    (m.receiverId || m.receiver_id) === uid && (m.senderId || m.sender_id) !== uid
  ) : [];
  const highlightedId = incoming.at(-1)?.id;
  for (const m of out.messages || []) if (m.id) seen.add(m.id);
  seenMessagesByThread.set(seenKey, seen);
  const next = await Promise.all((out.messages || []).map(async (m) => {
    if (m.deletedForEveryone || !m.ciphertext_b64) return m;
    if (m.suite_id !== 'pqc') return { ...m, cryptoVerified: false, type: 'e2ee', text: m.suite_id === 'classical'
      ? '[Classical message unavailable in PQC-only mode]' : '[Legacy message unavailable in PQC-only mode]' };
    const sender = m.senderId || m.sender_id;
    const receiver = m.receiverId || m.receiver_id;
    const progress = m.id === highlightedId ? beginPqcActivity('receive') : null;
    let plaintext;
    try {
      plaintext = await decryptEnvelopeWithParticipants(apiRequest, threadId, m, receiver, sender, uid, progress);
      progress?.complete();
    } catch (error) {
      progress?.fail();
      const reason = error?.message || 'Unknown cryptographic error';
      console.error('Message decryption failed', { messageId: m.id, reason });
      return { ...m, cryptoVerified: false, type: 'e2ee', text: `[Unable to verify or decrypt: ${reason}]` };
    }
    if (plaintext !== null) {
      try {
        const content = JSON.parse(plaintext);
        // Only message content may come from the encrypted body, not server IDs/flags.
        const allowed = ['type', 'text', 'fileURL', 'fileName', 'fileSize', 'mimeType', 'fileEncryption', 'replyTo', 'forwardedFrom', 'callType', 'callStatus', 'duration'];
        const safe = Object.fromEntries(allowed.filter((key) => Object.hasOwn(content, key)).map((key) => [key, content[key]]));
        try { return { ...m, ...await resolveEncryptedMedia(safe), cryptoVerified: true }; }
        catch { return { ...m, ...safe, cryptoVerified: true, fileURL: null, text: `${safe.text || ''} [Unable to decrypt attachment]` }; }
      } catch { /* Invalid authenticated content is not renderable. */ }
    }
    return { ...m, cryptoVerified: false, type: 'e2ee', text: m.protocol_version === '2.0'
      ? '[Unable to verify or decrypt message on this device]'
      : '[Legacy message — insecure encryption protocol retired]' };
  }));
  return { ...out, messages: next };
};

export const fetchCallLogs = (conversationId) =>
  apiRequest(`/api/chat/call-logs?conversationId=${encodeURIComponent(conversationId)}`);

export const fetchSignals = (conversationId, to) =>
  apiRequest(`/api/chat/signals?conversationId=${encodeURIComponent(conversationId)}&to=${encodeURIComponent(to)}`);

export const deleteSignal = (conversationId, signalId) =>
  apiRequest(`/api/chat/signals/${encodeURIComponent(signalId)}?conversationId=${encodeURIComponent(conversationId)}`, {
    method: "DELETE",
  });

export const markConversationSeen = (conversationId, uid) =>
  apiRequest("/api/chat/conversations/seen", {
    method: "PATCH",
    body: JSON.stringify({ conversationId, uid }),
  });


export const updateConversationMeta = (conversationId, patch) =>
  apiRequest("/api/chat/conversations/meta", {
    method: "PATCH",
    body: JSON.stringify({ conversationId, patch }),
  });

export const addConversationCallLog = (conversationId, callData) =>
  apiRequest("/api/chat/conversations/call-logs", {
    method: "POST",
    body: JSON.stringify({ conversationId, callData }),
  });

export const addConversationMessage = (conversationId, message) => {
  const user = JSON.parse(localStorage.getItem('pqc_auth_user') || 'null');
  const targetUid = message.senderId === user?.uid ? message.receiverId : message.senderId;
  return sendChatMessage({ threadType: 'direct', threadId: conversationId, actorUid: user?.uid, targetUid, payload: message });
};

export const addConversationSignal = (conversationId, signal) =>
  apiRequest("/api/chat/conversations/signals", {
    method: "POST",
    body: JSON.stringify({ conversationId, signal }),
  });

export const clearConversationForUser = (conversationId, uid) =>
  apiRequest("/api/chat/conversations/clear", {
    method: "POST",
    body: JSON.stringify({ conversationId, uid }),
  });
