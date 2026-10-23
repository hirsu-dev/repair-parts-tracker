import { empty, validate } from "./model.js";
export async function openWorkspace(factory = globalThis.indexedDB) {
  if (!factory) throw Error("IndexedDB is unavailable.");
  const db = await new Promise((resolve, reject) => {
    const r = factory.open("benchbook-v1", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("workspace");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () =>
      reject(
        Error(
          "Another tab is blocking storage. Close the older tab and reload.",
        ),
      );
  });
  return {
    persistent: true,
    async read() {
      return new Promise((resolve, reject) => {
        const tx = db.transaction("workspace", "readonly"),
          r = tx.objectStore("workspace").get("main");
        r.onsuccess = () => {
          try {
            resolve(validate(r.result || empty()));
          } catch (e) {
            reject(e);
          }
        };
        r.onerror = () => reject(r.error);
      });
    },
    async update(change) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction("workspace", "readwrite"),
          store = tx.objectStore("workspace"),
          r = store.get("main");
        let next, error;
        r.onsuccess = () => {
          try {
            next = validate(change(r.result || empty()));
            store.put(next, "main");
          } catch (e) {
            error = e;
            tx.abort();
          }
        };
        tx.oncomplete = () => resolve(next);
        tx.onabort = () =>
          reject(error || tx.error || Error("The write was cancelled."));
        tx.onerror = () => reject(tx.error);
      });
    },
    close() {
      db.close();
    },
  };
}
export function memoryWorkspace() {
  let value = empty();
  return {
    persistent: false,
    async read() {
      return structuredClone(value);
    },
    async update(change) {
      const next = validate(change(structuredClone(value)));
      value = next;
      return structuredClone(value);
    },
    close() {},
  };
}
