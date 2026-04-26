import { apiRequest } from "./apiClient";

export const createGroup = async ({ name, description, memberIds, creatorId }) =>
  apiRequest("/api/community/groups", {
    method: "POST",
    body: JSON.stringify({
      name: name.trim(),
      description: description.trim(),
      memberIds,
      creatorId,
    }),
  });

export const createChannel = async ({ name, description, creatorId }) =>
  apiRequest("/api/community/channels", {
    method: "POST",
    body: JSON.stringify({
      name: name.trim(),
      description: description.trim(),
      creatorId,
    }),
  });

export const followChannel = async (channelId, userId) =>
  apiRequest(`/api/community/channels/${channelId}/follow`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });

export const unfollowChannel = async (channelId, userId) =>
  apiRequest(`/api/community/channels/${channelId}/unfollow`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
