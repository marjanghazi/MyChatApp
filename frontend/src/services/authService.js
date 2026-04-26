import { apiRequest } from "./apiClient";

const STORAGE_KEY = "pqc_auth_user";
const listeners = new Set();

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

export const createUserWithEmailAndPassword = async (email, password, displayName = "") => {
  const { user } = await apiRequest("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, displayName }),
  });
  setUser(user);
  return { user };
};

export const signInWithEmailAndPassword = async (email, password) => {
  const { user } = await apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setUser(user);
  return { user };
};

export const updateProfile = async (user, patch) => {
  if (!user?.idToken) throw new Error("Not authenticated");
  const { user: updated } = await apiRequest("/api/auth/update-profile", {
    method: "POST",
    body: JSON.stringify({
      idToken: user.idToken,
      displayName: patch.displayName ?? user.displayName,
      photoURL: patch.photoURL ?? user.photoURL,
    }),
  });
  setUser(updated);
  return updated;
};

export const signOut = async () => {
  setUser(null);
};
