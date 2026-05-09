import { apiRequest } from "./apiClient";
import { decryptTextFromSender, encryptTextForRecipient, publishSelfKeyBundle } from "./e2eeService";

export const sendChatMessage = async (body) => {
  const payload = body?.payload || {};
  if (payload?.text && body?.actorUid && body?.targetUid) {
    await publishSelfKeyBundle(body.actorUid);
    const encrypted = await encryptTextForRecipient({
      senderUid: body.actorUid,
      recipientUid: body.targetUid,
      text: payload.text,
    });
    body = { ...body, payload: { ...payload, type: payload.type || "text", encrypted, text: undefined } };
  }
  return apiRequest("/api/chat/messages/send", {
    method: "POST",
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
  const response = await apiRequest(`/api/chat/messages?threadType=${encodeURIComponent(threadType)}&threadId=${encodeURIComponent(threadId)}&uid=${encodeURIComponent(uid || "")}`);
  const messages = response?.messages || [];
  const senderKeyCache = new Map();

  const hydrated = await Promise.all(
    messages.map(async (message) => {
      if (!message?.encrypted || !uid) return message;
      const senderId = message.senderId;
      if (!senderId) return message;
      if (!senderKeyCache.has(senderId)) {
        const bundleResult = await apiRequest(`/api/e2ee/keys/${encodeURIComponent(senderId)}`);
        const bundle = (bundleResult?.bundles || [])[0] || null;
        senderKeyCache.set(senderId, {
          identityKey: bundle?.identityKey || null,
          signingKey: bundle?.signingPublicKey || null,
        });
      }
      const senderKeys = senderKeyCache.get(senderId);
      if (!senderKeys?.identityKey) return message;
      try {
        const text = await decryptTextFromSender({
          receiverUid: uid,
          senderIdentityJwk: JSON.parse(senderKeys.identityKey),
          senderSigningJwk: senderKeys.signingKey ? JSON.parse(senderKeys.signingKey) : null,
          encrypted: message.encrypted,
        });
        return { ...message, text };
      } catch {
        return { ...message, text: "[Unable to decrypt]" };
      }
    })
  );
  return { ...response, messages: hydrated };
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
