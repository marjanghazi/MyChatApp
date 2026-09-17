import { apiRequest } from "./apiClient";
import { clearDecryptedAttachments } from "./mediaService";
import { registerDeviceBundle } from "./e2eeService";

const STORAGE_KEY = "pqc_auth_user";
const listeners = new Set();
const identityRegistrations = new Map();

let currentUser = null;
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) currentUser = JSON.parse(raw);
} catch {
  currentUser = null;
}

const emit = () => {
  listeners.forEach((listener) => listener(currentUser));
};

const setUser = (user) => {
  currentUser = user;
  if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  else localStorage.removeItem(STORAGE_KEY);
  emit();
};

export const onAuthStateChanged = (callback) => {
  listeners.add(callback);
  callback(currentUser);
  return () => listeners.delete(callback);
};

// Older sessions can be restored from localStorage without passing through the
// login functions below. Register their browser-held identities as part of the
// session migration so an app update does not require signing out and back in.
export const ensureEncryptionIdentity = async (user = currentUser, { force = false } = {}) => {
  if (!user?.uid || !user?.idToken) throw new Error("Not authenticated");
  const registrationKey = `${user.uid}:${user.idToken}`;
  if (force) identityRegistrations.delete(registrationKey);
  if (!identityRegistrations.has(registrationKey)) {
    const authenticatedRequest = (path, options = {}) => apiRequest(path, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${user.idToken}` },
    });
    const pending = registerDeviceBundle(authenticatedRequest, user.uid);
    identityRegistrations.set(registrationKey, pending);
    pending.catch(() => identityRegistrations.delete(registrationKey));
  }
  return identityRegistrations.get(registrationKey);
};

export const createUserWithEmailAndPassword = async (email, password, displayName = "") => {
  const { user } = await apiRequest("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
  const deviceId = await ensureEncryptionIdentity(user);
  const withDev = { ...user, deviceId };
  setUser(withDev);
  return { user: withDev };
};

export const signInWithEmailAndPassword = async (email, password) => {
  const { user } = await apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const deviceId = await ensureEncryptionIdentity(user);
  const withDev = { ...user, deviceId };
  setUser(withDev);
  return { user: withDev };
};

export const updateProfile = async (user, patch) => {
  if (!user?.idToken) throw new Error("Not authenticated");
  const { user: updated } = await apiRequest("/api/auth/update-profile", {
    method: "POST",
    body: JSON.stringify({
      uid: user.uid,
      idToken: user.idToken,
      displayName: patch.displayName ?? user.displayName,
      photoURL: patch.photoURL ?? user.photoURL,
    }),
  });
  setUser(updated);
  return updated;
};

export const signOut = async () => {
  clearDecryptedAttachments();
  setUser(null);
};
