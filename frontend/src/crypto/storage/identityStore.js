// Private identities and trust pins stay in the browser. Never serialize this store to an API.
// IndexedDB is persistence, not protection against malicious same-origin JavaScript.
export function createIdentityStore() {
  let database;
  const connect = () => {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('quantx-crypto-v2', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('secrets');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return database;
  };
  return {
    async get(key) {
      const db = await connect();
      return new Promise((resolve, reject) => {
        const request = db.transaction('secrets').objectStore('secrets').get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },
    async set(key, value) {
      const db = await connect();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('secrets', 'readwrite');
        tx.objectStore('secrets').put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Identity storage aborted'));
      });
    },
  };
}
