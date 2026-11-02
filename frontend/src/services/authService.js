import { apiRequest } from "./apiClient";
import { clearDecryptedAttachments } from "./mediaService";
import { registerDeviceBundle } from "./e2eeService";
import { beginPqcActivity } from "../crypto/pqcActivity.js";
import { clearLocalWalkthrough } from "../crypto/localWalkthrough.js";

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
export const ensureEncryptionIdentity = async (user = currentUser, { force = false, onProgress } = {}) => {
  if (!user?.uid || !user?.idToken) throw new Error("Not authenticated");
  const registrationKey = `${user.uid}:${user.idToken}`;
  if (force) identityRegistrations.delete(registrationKey);
  const alreadyRegistering = identityRegistrations.has(registrationKey);
  if (!alreadyRegistering) {
    const progress = onProgress || beginPqcActivity('identity', { user });
    const authenticatedRequest = (path, options = {}) => apiRequest(path, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${user.idToken}` },
    });
    const pending = registerDeviceBundle(authenticatedRequest, user.uid, progress);
    identityRegistrations.set(registrationKey, pending);
    pending.then(
      () => { if (!onProgress) progress.complete(); },
      () => { identityRegistrations.delete(registrationKey); if (!onProgress) progress.fail(); },
    );
  }
  const deviceId = await identityRegistrations.get(registrationKey);
  // A concurrent restoration may already have started the same registration.
  if (onProgress && alreadyRegistering) for (const step of ['kem', 'dsa', 'identity_sign', 'bundle']) onProgress(step, 'done');
  return deviceId;
};

export const createUserWithEmailAndPassword = async (email, password, displayName = "", phoneNumber = "") => {
  const startedAt = performance.now();
  const { user } = await apiRequest("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName, phoneNumber }),
  });
  const progress = beginPqcActivity('register', { user, startedAt });
  progress('auth', 'done', null, { durationMs: performance.now() - startedAt });
  let deviceId;
  try {
    deviceId = await ensureEncryptionIdentity(user, { onProgress: progress });
    progress.complete();
  } catch (error) {
    progress.fail();
    throw error;
  }
  const withDev = { ...user, deviceId };
  setUser(withDev);
  return { user: withDev };
};

export const signInWithEmailAndPassword = async (email, password) => {
  const startedAt = performance.now();
  const { user } = await apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const progress = beginPqcActivity('login', { user, startedAt });
  progress('auth', 'done', null, { durationMs: performance.now() - startedAt });
  let deviceId;
  try {
    deviceId = await ensureEncryptionIdentity(user, { onProgress: progress });
    progress.complete();
  } catch (error) {
    progress.fail();
    throw error;
  }
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
  clearLocalWalkthrough();
  setUser(null);
};
