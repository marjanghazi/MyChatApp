import { apiRequest } from "./apiClient";

export const checkPhoneAvailability = async (phoneNumber) =>
  apiRequest("/api/users/check-phone", {
    method: "POST",
    body: JSON.stringify({ phoneNumber }),
  });

export const addContactByPhoneApi = async ({ uid, phoneNumber }) =>
  apiRequest(`/api/users/${uid}/contacts`, {
    method: "POST",
    body: JSON.stringify({ phoneNumber }),
  });
