import { apiRequest } from "./apiClient";

export const db = { __kind: "db" };
export const storage = { __kind: "storage" };

const normalizePath = (segments) => segments.filter(Boolean).join("/");

const isRef = (value) => value && typeof value === "object" && typeof value.path === "string";

export const doc = (...segments) => {
  const parts = isRef(segments[0]) ? [segments[0].path, ...segments.slice(1)] : segments.slice(1);
  return { __kind: "doc", path: normalizePath(parts) };
};

export const collection = (...segments) => {
  const parts = isRef(segments[0]) ? [segments[0].path, ...segments.slice(1)] : segments.slice(1);
  return { __kind: "collection", path: normalizePath(parts) };
};

export const where = (field, op, value) => ({ type: "where", field, op, value });
export const orderBy = (field, direction = "asc") => ({ type: "orderBy", field, direction });

export const query = (collectionRef, ...clauses) => ({
  __kind: "query",
  path: collectionRef.path,
  where: clauses.filter((c) => c.type === "where"),
  orderBy: clauses.filter((c) => c.type === "orderBy"),
});

export const serverTimestamp = () => ({ __op: "serverTimestamp" });
export const increment = (value) => ({ __op: "increment", value });
export const arrayUnion = (...values) => ({ __op: "arrayUnion", values });
export const arrayRemove = (...values) => ({ __op: "arrayRemove", values });

export const setDoc = (docRef, data, options = {}) =>
  apiRequest("/api/db/set-doc", {
    method: "POST",
    body: JSON.stringify({ path: docRef.path, data, merge: Boolean(options.merge) }),
  });

export const updateDoc = (docRef, data) =>
  apiRequest("/api/db/update-doc", {
    method: "POST",
    body: JSON.stringify({ path: docRef.path, data }),
  });

export const addDoc = async (collectionRef, data) => {
  const result = await apiRequest("/api/db/add-doc", {
    method: "POST",
    body: JSON.stringify({ path: collectionRef.path, data }),
  });
  return {
    id: result.id,
    path: result.path,
  };
};

export const deleteDoc = (docRef) =>
  apiRequest("/api/db/delete-doc", {
    method: "POST",
    body: JSON.stringify({ path: docRef.path }),
  });

export const getDocs = async (targetRef) => {
  const payload = targetRef.__kind === "query"
    ? { path: targetRef.path, where: targetRef.where, orderBy: targetRef.orderBy }
    : { path: targetRef.path };

  const result = await apiRequest("/api/db/get-docs", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  const docs = (result.docs || []).map((entry) => ({
    id: entry.id,
    data: () => entry.data,
    ref: { path: entry.path },
  }));

  return { docs };
};

const stableHash = (value) => JSON.stringify(value);

export const onSnapshot = (targetRef, callback) => {
  let active = true;
  let previousDocs = [];

  const emit = async () => {
    if (!active) return;
    const snapshot = await getDocs(targetRef);
    const currentDocs = snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() }));

    const prevIds = new Set(previousDocs.map((entry) => entry.id));
    const docChanges = snapshot.docs
      .filter((entry) => !prevIds.has(entry.id))
      .map((entry) => ({ type: "added", doc: entry }));

    const changed = stableHash(previousDocs) !== stableHash(currentDocs);
    if (changed) {
      callback({
        docs: snapshot.docs,
        docChanges: () => docChanges,
      });
      previousDocs = currentDocs;
    }
  };

  emit().catch(console.error);
  const timer = setInterval(() => emit().catch(console.error), 1200);

  return () => {
    active = false;
    clearInterval(timer);
  };
};

export const writeBatch = () => {
  const operations = [];
  return {
    update: (docRef, data) => operations.push({ type: "update", path: docRef.path, data }),
    set: (docRef, data, options = {}) => operations.push({ type: "set", path: docRef.path, data, merge: Boolean(options.merge) }),
    delete: (docRef) => operations.push({ type: "delete", path: docRef.path }),
    commit: () =>
      apiRequest("/api/db/commit-batch", {
        method: "POST",
        body: JSON.stringify({ operations }),
      }),
  };
};

export const ref = (_storage, fullPath) => ({ fullPath });

export const uploadBytesResumable = (storageRef, file) => {
  let completed = false;
  let uploadResult = null;

  const runUpload = async () => {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });

    uploadResult = await apiRequest("/api/media/upload-by-path", {
      method: "POST",
      body: JSON.stringify({
        storagePath: storageRef.fullPath,
        contentType: file.type || "application/octet-stream",
        dataBase64: btoa(binary),
      }),
    });

    completed = true;
    return uploadResult;
  };

  const promise = runUpload();

  return {
    snapshot: { ref: storageRef },
    on: (_event, onProgress, onError, onComplete) => {
      promise
        .then((result) => {
          onProgress?.({ bytesTransferred: file.size, totalBytes: file.size });
          storageRef.url = result.url;
          onComplete?.();
        })
        .catch((error) => {
          onError?.(error);
        });
    },
    get done() {
      return completed;
    },
  };
};

export const getDownloadURL = async (storageRef) => storageRef.url;

export const deleteObject = (storageRef) =>
  apiRequest("/api/media/delete-by-path", {
    method: "POST",
    body: JSON.stringify({ storagePath: storageRef.fullPath }),
  });
