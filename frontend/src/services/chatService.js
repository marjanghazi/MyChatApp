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

// Sends a chat message; auto-encrypts plaintext payloads into E2EE envelope when needed.
export const sendChatMessage = async (body) => {
  const payload = body?.payload || {};
  const hasEnvelope = payload.ciphertext_b64 && payload.nonce_b64 && payload.aad_b64;
  if (body.threadType === 'direct' && !hasEnvelope) {
    const envelope = await encryptMessageEnvelope(apiRequest, {
      threadId: body.threadId,
      senderUid: body.actorUid,
      recipientUid: body.targetUid,
      plaintext: JSON.stringify({ ...payload, ...(body.replyTo ? { replyTo: body.replyTo } : {}) }),
    });
    const { replyTo, text, ...transport } = body;
    body = { ...transport, payload: envelope };
  }
  return apiRequest('/api/chat/messages/send', {
    method: 'POST',
    body: JSON.stringify(body),
    // PQC envelopes are roughly ten times larger than classical envelopes.
    // Allow slow ngrok/mobile uploads without extending every polling request.
    timeoutMs: 45_000,
  });
};

export const editChatMessage = async (body) => {
  const nextBody = { ...body };
  if (nextBody?.threadType === "direct" && nextBody?.threadId && nextBody?.actorUid && nextBody?.targetUid && typeof nextBody?.text === "string") {
    const envelope = await encryptMessageEnvelope(apiRequest, {
      threadId: nextBody.threadId,
      senderUid: nextBody.actorUid,
      recipientUid: nextBody.targetUid,
      plaintext: JSON.stringify({ ...(nextBody.content || {}), type: nextBody.content?.type || 'text', text: nextBody.text }),
    });
    nextBody.payload = envelope;
    delete nextBody.text;
    delete nextBody.content;
  }
  return apiRequest("/api/chat/messages/edit", {
    method: "PATCH",
    body: JSON.stringify(nextBody),
  });
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
  const next = await Promise.all((out.messages || []).map(async (m) => {
    if (m.deletedForEveryone || !m.ciphertext_b64) return m;
    const sender = m.senderId || m.sender_id;
    const receiver = m.receiverId || m.receiver_id;
    let plaintext;
    try {
      plaintext = await decryptEnvelopeWithParticipants(apiRequest, threadId, m, receiver, sender, uid);
    } catch (error) {
      const reason = error?.message || 'Unknown cryptographic error';
      console.error('Message decryption failed', { messageId: m.id, reason });
      return { ...m, type: 'e2ee', text: `[Unable to verify or decrypt: ${reason}]` };
    }
    if (plaintext !== null) {
      try {
        const content = JSON.parse(plaintext);
        // Only message content may come from the encrypted body, not server IDs/flags.
        const allowed = ['type', 'text', 'fileURL', 'fileName', 'fileSize', 'mimeType', 'fileEncryption', 'replyTo', 'forwardedFrom', 'callType', 'callStatus', 'duration'];
        const safe = Object.fromEntries(allowed.filter((key) => Object.hasOwn(content, key)).map((key) => [key, content[key]]));
        try { return { ...m, ...await resolveEncryptedMedia(safe) }; }
        catch { return { ...m, ...safe, fileURL: null, text: `${safe.text || ''} [Unable to decrypt attachment]` }; }
      } catch { /* Invalid authenticated content is not renderable. */ }
    }
    return { ...m, type: 'e2ee', text: m.protocol_version === '2.0'
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
