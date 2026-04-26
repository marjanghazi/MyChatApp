import { apiRequest } from "./apiClient";

export const sendChatMessage = (body) =>
  apiRequest("/api/chat/messages/send", {
    method: "POST",
    body: JSON.stringify(body),
  });

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
