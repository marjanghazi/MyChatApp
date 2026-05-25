/**
 * Thread service: conversation list APIs and sidebar preview hydration.
 *
 * Hydration is intentionally decryption-aware so placeholder previews
 * (`[E2EE message]`) are replaced with local plaintext when possible.
 */
import { apiRequest } from "./apiClient";
import { tryDecryptEnvelopeWithParticipants } from "./e2eeService";

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


// Hydrates sidebar last-message preview by decrypting encrypted placeholders when possible.
export const hydrateConversationPreviews = async (conversations, uid) => {
  const entries = Object.entries(conversations || {});
  const updates = await Promise.all(entries.map(async ([conversationId, conv]) => {
    if (!conversationId) return [conversationId, conv];
    const lastMessage = String(conv?.lastMessage || '');
    const needsHydration = ['[E2EE message]', '[Unable to decrypt message]'].includes(lastMessage) || !lastMessage.trim();
    if (!needsHydration) return [conversationId, conv];
    try {
      const out = await apiRequest(`/api/chat/messages?threadType=direct&threadId=${encodeURIComponent(conversationId)}&uid=${encodeURIComponent(uid || '')}`);
      const msgs = out.messages || [];
      const last = msgs.length ? msgs[msgs.length - 1] : null;
      if (!last) return [conversationId, conv];
      const sender = last.senderId || last.sender_id;
      const receiver = last.receiverId || last.receiver_id;
      const effectiveRecipient = sender === uid ? receiver : uid;
      const effectiveSender = sender === uid ? uid : sender;
      const text = await tryDecryptEnvelopeWithParticipants(apiRequest, conversationId, last, effectiveRecipient, effectiveSender);
      if (!text) return [conversationId, conv];
      return [conversationId, { ...conv, lastMessage: text }];
    } catch {
      return [conversationId, conv];
    }
  }));
  return Object.fromEntries(updates);
};
