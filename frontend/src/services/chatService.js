import { apiRequest } from "./apiClient";
import { encryptMessageEnvelope, tryDecryptEnvelope } from "./e2eeService";

export const sendChatMessage = async (body) => {
  const payload = body?.payload || {};
  const hasEnvelope = payload.ciphertext_b64 && payload.nonce_b64 && payload.aad_b64;
  if (!hasEnvelope && typeof payload.text === 'string') {
    const envelope = await encryptMessageEnvelope({
      threadId: body.threadId,
      senderDeviceId: body.actorUid,
      recipientDeviceId: body.targetUid || 'group',
      sessionId: `${body.threadId}:${body.actorUid}:${body.targetUid || 'group'}`,
      plaintext: payload.text,
    });
    body = { ...body, payload: envelope };
  }
  return apiRequest('/api/chat/messages/send', {
    method: 'POST',
    body: JSON.stringify(body),
  });
};

export const editChatMessage = (body) =>
  apiRequest("/api/chat/messages/edit", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

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

export const fetchThreadMessages = async (threadType, threadId, uid) => {
  const out = await apiRequest(`/api/chat/messages?threadType=${encodeURIComponent(threadType)}&threadId=${encodeURIComponent(threadId)}&uid=${encodeURIComponent(uid || '')}`);
  const next = await Promise.all((out.messages || []).map(async (m) => {
    const text = await tryDecryptEnvelope(threadId, m);
    return text ? { ...m, text } : m;
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

export const addConversationMessage = (conversationId, message) =>
  apiRequest("/api/chat/conversations/messages", {
    method: "POST",
    body: JSON.stringify({ conversationId, message }),
  });

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
