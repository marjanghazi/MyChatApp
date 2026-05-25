import { apiRequest } from "./apiClient";
import { tryDecryptEnvelope } from "./e2eeService";

export const fetchUsers = async (excludeUid) =>
  apiRequest(`/api/thread/users?excludeUid=${encodeURIComponent(excludeUid)}`);

export const fetchConversations = async (uid) =>
  apiRequest(`/api/thread/conversations?uid=${encodeURIComponent(uid)}`);

export const markDelivered = async (conversationId) =>
  apiRequest(`/api/thread/conversations/${conversationId}/delivered`, {
    method: "PATCH",
  });

export const fetchGroups = async (uid) =>
  apiRequest(`/api/thread/groups?uid=${encodeURIComponent(uid)}`);

export const fetchChannels = async () => apiRequest("/api/thread/channels");


export const hydrateConversationPreviews = async (conversations, uid) => {
  const entries = Object.entries(conversations || {});
  const updates = await Promise.all(entries.map(async ([conversationId, conv]) => {
    if (!conversationId || conv?.lastMessage !== '[E2EE message]') return [conversationId, conv];
    try {
      const out = await apiRequest(`/api/chat/messages?threadType=direct&threadId=${encodeURIComponent(conversationId)}&uid=${encodeURIComponent(uid || '')}`);
      const msgs = out.messages || [];
      const last = msgs.length ? msgs[msgs.length - 1] : null;
      if (!last) return [conversationId, conv];
      const text = await tryDecryptEnvelope(conversationId, last);
      if (!text) return [conversationId, conv];
      return [conversationId, { ...conv, lastMessage: text }];
    } catch {
      return [conversationId, conv];
    }
  }));
  return Object.fromEntries(updates);
};
