/**
 * Runtime PersistStore for campaign JSON.
 * Prefers AsyncStorage (campaign blobs can exceed SecureStore size limits).
 * Pattern matches settings/storage.ts: dynamic import + in-memory fallback for Node/tests.
 */
import type { PersistStore } from '../../engine/persist';
import { MemoryPersistStore } from '../../engine/persist';

type KvBackend = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

let asyncStorage: KvBackend | null = null;
let asyncStorageProbe: Promise<void> | null = null;

/** Shared memory fallback used when AsyncStorage is unavailable. */
const memoryFallback = new MemoryPersistStore();

async function ensureAsyncStorage(): Promise<void> {
  if (asyncStorageProbe) return asyncStorageProbe;
  asyncStorageProbe = (async () => {
    try {
      const mod = await import('@react-native-async-storage/async-storage');
      const store = mod.default;
      if (
        store &&
        typeof store.getItem === 'function' &&
        typeof store.setItem === 'function' &&
        typeof store.removeItem === 'function'
      ) {
        asyncStorage = {
          getItem: (key) => store.getItem(key),
          setItem: (key, value) => store.setItem(key, value),
          removeItem: (key) => store.removeItem(key),
        };
      } else {
        asyncStorage = null;
      }
    } catch {
      asyncStorage = null;
    }
  })();
  return asyncStorageProbe;
}

/**
 * PersistStore backed by AsyncStorage when available, else in-memory.
 * Suitable for campaign JSON (prefer over SecureStore for size).
 */
export class AsyncPersistStore implements PersistStore {
  async get(key: string): Promise<string | null> {
    await ensureAsyncStorage();
    if (asyncStorage) {
      try {
        return await asyncStorage.getItem(key);
      } catch {
        // fall through to memory
      }
    }
    return memoryFallback.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    await ensureAsyncStorage();
    if (asyncStorage) {
      try {
        await asyncStorage.setItem(key, value);
        return;
      } catch {
        // fall through to memory
      }
    }
    await memoryFallback.set(key, value);
  }

  async remove(key: string): Promise<void> {
    await ensureAsyncStorage();
    if (asyncStorage) {
      try {
        await asyncStorage.removeItem(key);
        return;
      } catch {
        // fall through to memory
      }
    }
    await memoryFallback.remove(key);
  }
}

let singleton: AsyncPersistStore | null = null;

/** App-wide PersistStore singleton (AsyncStorage or memory fallback). */
export function getAppPersistStore(): PersistStore {
  if (!singleton) singleton = new AsyncPersistStore();
  return singleton;
}

/** Test helper — clears memory fallback only (not native AsyncStorage). */
export function __resetAppPersistMemoryForTests(): void {
  memoryFallback.clear();
  asyncStorageProbe = null;
  asyncStorage = null;
  singleton = null;
}

/**
 * Inject a mock AsyncStorage-like backend for tests (skips dynamic import).
 * Call __resetAppPersistMemoryForTests after.
 */
export function __setAsyncStorageForTests(backend: KvBackend | null): void {
  asyncStorage = backend;
  asyncStorageProbe = Promise.resolve();
  singleton = null;
}
