import { apiRequest } from "./apiClient";

export const checkPhoneAvailability = async (phoneNumber) =>
  apiRequest("/api/users/check-phone", {
    method: "POST",
    body: JSON.stringify({ phoneNumber }),
  });

export const upsertUserProfile = async (payload) =>
  apiRequest("/api/users/profile", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const fetchUserProfile = async (uid) => apiRequest(`/api/users/${uid}/profile`);

export const setPresence = async (uid, isOnline) =>
  apiRequest(`/api/users/${uid}/presence`, {
    method: "POST",
    body: JSON.stringify({ isOnline }),
  });

export const updateUserProfile = async (uid, patch) =>
  apiRequest(`/api/users/${uid}/profile`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

export const addContactByPhoneApi = async ({ uid, phoneNumber }) =>
  apiRequest(`/api/users/${uid}/contacts`, {
    method: "POST",
    body: JSON.stringify({ phoneNumber }),
  });
