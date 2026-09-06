import { DEFAULT_PREFS, SECURE_KEYS, SettingsPrefs, SettingsState } from './types';

/** In-memory fallback when SecureStore is unavailable (tests / unsupported env). */
const memory = new Map<string, string>();

let secureStore: {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
} | null = null;

let secureStoreProbe: Promise<void> | null = null;

async function ensureSecureStore(): Promise<void> {
  if (secureStoreProbe) return secureStoreProbe;
  secureStoreProbe = (async () => {
    try {
      // Dynamic import so Node tests without native modules still load.
      const mod = await import('expo-secure-store');
      secureStore = {
        getItemAsync: mod.getItemAsync.bind(mod),
        setItemAsync: mod.setItemAsync.bind(mod),
        deleteItemAsync: mod.deleteItemAsync.bind(mod),
      };
    } catch {
      secureStore = null;
    }
  })();
  return secureStoreProbe;
}

async function getItem(key: string): Promise<string | null> {
  await ensureSecureStore();
  if (secureStore) {
    try {
      return await secureStore.getItemAsync(key);
    } catch {
      // fall through to memory
    }
  }
  return memory.has(key) ? memory.get(key)! : null;
}

async function setItem(key: string, value: string): Promise<void> {
  await ensureSecureStore();
  if (secureStore) {
    try {
      await secureStore.setItemAsync(key, value);
      return;
    } catch {
      // fall through to memory
    }
  }
  memory.set(key, value);
}

function normalizePrefs(parsed: Partial<SettingsPrefs> | null | undefined): SettingsPrefs {
  return {
    verbosity: parsed?.verbosity ?? DEFAULT_PREFS.verbosity,
    providerKind: parsed?.providerKind ?? DEFAULT_PREFS.providerKind,
    baseUrl: typeof parsed?.baseUrl === 'string' ? parsed.baseUrl : DEFAULT_PREFS.baseUrl,
    model: typeof parsed?.model === 'string' ? parsed.model : DEFAULT_PREFS.model,
  };
}

/** Never log the API key. */
export async function loadSettings(): Promise<SettingsState> {
  const apiKey = (await getItem(SECURE_KEYS.apiKey)) ?? '';
  const prefsRaw = await getItem(SECURE_KEYS.prefs);
  let prefs: SettingsPrefs = { ...DEFAULT_PREFS };
  if (prefsRaw) {
    try {
      const parsed = JSON.parse(prefsRaw) as Partial<SettingsPrefs>;
      prefs = normalizePrefs(parsed);
    } catch {
      prefs = { ...DEFAULT_PREFS };
    }
  }
  return { ...prefs, apiKey };
}

export async function savePrefs(prefs: SettingsPrefs): Promise<void> {
  // Persist only prefs blob (never the API key).
  await setItem(
    SECURE_KEYS.prefs,
    JSON.stringify({
      verbosity: prefs.verbosity,
      providerKind: prefs.providerKind,
      baseUrl: prefs.baseUrl,
      model: prefs.model,
    }),
  );
}

export async function saveApiKey(apiKey: string): Promise<void> {
  await setItem(SECURE_KEYS.apiKey, apiKey);
}

/** Test helper — clears in-memory fallback only. */
export function __resetMemoryStoreForTests(): void {
  memory.clear();
}
