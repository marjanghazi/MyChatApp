import { apiRequest } from "./apiClient";

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
