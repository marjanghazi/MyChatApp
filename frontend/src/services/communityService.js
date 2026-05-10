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

export const leaveGroupApi = async ({ groupId, userId }) =>
  apiRequest(`/api/community/groups/${groupId}/leave`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });

export const addGroupMemberApi = async ({ groupId, requesterId, memberUid }) =>
  apiRequest(`/api/community/groups/${groupId}/members/add`, {
    method: "POST",
    body: JSON.stringify({ requesterId, memberUid }),
  });

export const removeGroupMemberApi = async ({ groupId, requesterId, memberUid }) =>
  apiRequest(`/api/community/groups/${groupId}/members/remove`, {
    method: "POST",
    body: JSON.stringify({ requesterId, memberUid }),
  });

export const updateGroupProfileApi = async ({ groupId, requesterId, name, description, photoURL }) =>
  apiRequest(`/api/community/groups/${groupId}/profile`, {
    method: "PATCH",
    body: JSON.stringify({ requesterId, name, description, photoURL }),
  });

export const toggleGroupAdminApi = async ({ groupId, requesterId, memberUid, makeAdmin }) =>
  apiRequest(`/api/community/groups/${groupId}/admins/toggle`, {
    method: "POST",
    body: JSON.stringify({ requesterId, memberUid, makeAdmin }),
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
