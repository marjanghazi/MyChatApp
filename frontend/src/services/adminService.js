import { apiRequest } from "./apiClient";

export const signInAdmin = (email, password) =>
  apiRequest("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const fetchAdminUsers = (token) =>
  apiRequest("/api/admin/users", {
    headers: { Authorization: `Bearer ${token}` },
  });

export const updateAdminUser = (token, uid, changes) =>
  apiRequest(`/api/admin/users/${encodeURIComponent(uid)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(changes),
  });

export const fetchAdminCryptoOverview = (token) =>
  apiRequest("/api/admin/crypto/overview", {
    headers: { Authorization: `Bearer ${token}` },
  });

export const fetchAdminCryptoItems = (token, section, page) =>
  apiRequest(`/api/admin/crypto/${section}?page=${page}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const startAdminLiveDemo = (token, uid) =>
  apiRequest(`/api/admin/live/${encodeURIComponent(uid)}/start`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });

export const stopAdminLiveDemo = (token, uid) =>
  apiRequest(`/api/admin/live/${encodeURIComponent(uid)}/stop`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });

export const fetchAdminLiveDemo = (token, uid) =>
  apiRequest(`/api/admin/live/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export const startRegistrationDemo = (token) =>
  apiRequest('/api/admin/registration-live/start', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });

export const stopRegistrationDemo = (token) =>
  apiRequest('/api/admin/registration-live/stop', {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  });

export const fetchRegistrationDemo = (token) =>
  apiRequest('/api/admin/registration-live', {
    headers: { Authorization: `Bearer ${token}` },
  });
