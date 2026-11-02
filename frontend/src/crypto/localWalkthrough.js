// Opt-in FYP walkthrough state. It exists only in this browser's memory and
// is never sent to the backend, admin activity API, localStorage, or IndexedDB.
let state = { userId: null, expiresAt: 0, trace: null };
let expiryTimer = null;
const listeners = new Set();
const publish = () => { for (const listener of listeners) listener(state); };

export const subscribeLocalWalkthrough = (listener) => {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
};

export const isLocalWalkthroughActive = (userId) =>
  Boolean(userId && state.userId === userId && state.expiresAt > Date.now());

export const startLocalWalkthrough = (userId) => {
  if (expiryTimer) window.clearTimeout(expiryTimer);
  state = { userId, expiresAt: Date.now() + 10 * 60 * 1000, trace: null };
  expiryTimer = window.setTimeout(clearLocalWalkthrough, 10 * 60 * 1000);
  publish();
};

export const recordLocalWalkthrough = (userId, trace) => {
  if (!isLocalWalkthroughActive(userId) || state.trace) return;
  state = { ...state, trace: { ...trace, capturedAt: new Date().toISOString() } };
  publish();
};

export const clearLocalWalkthrough = () => {
  if (expiryTimer) window.clearTimeout(expiryTimer);
  expiryTimer = null;
  state = { userId: null, expiresAt: 0, trace: null };
  publish();
};
