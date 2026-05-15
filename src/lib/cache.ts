import type { LoadedHistory } from "./github";

const dbName = "git-history-explorer-cache";
const storeName = "histories";
const dbVersion = 1;

const canUseIndexedDb = (): boolean => "indexedDB" in window;

const openCache = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }

    const request = window.indexedDB.open(dbName, dbVersion);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openCache();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
};

export const createHistoryCacheKey = (input: string, maxCommits: number): string =>
  `${input.trim().toLowerCase()}::${maxCommits}`;

export const getCachedHistory = async (
  key: string,
): Promise<LoadedHistory | undefined> => {
  try {
    return await withStore<LoadedHistory | undefined>("readonly", (store) =>
      store.get(key),
    );
  } catch {
    return undefined;
  }
};

export const saveCachedHistory = async (
  key: string,
  history: LoadedHistory,
): Promise<void> => {
  try {
    await withStore<IDBValidKey>("readwrite", (store) => store.put(history, key));
  } catch {
    return;
  }
};

export const clearHistoryCache = async (): Promise<void> => {
  try {
    await withStore<undefined>("readwrite", (store) => store.clear());
  } catch {
    return;
  }
};
