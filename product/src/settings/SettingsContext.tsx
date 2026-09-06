import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { loadSettings, saveApiKey, savePrefs } from './storage';
import {
  DEFAULT_PREFS,
  ProviderKind,
  SettingsPrefs,
  SettingsState,
  Verbosity,
  remoteConfigError,
} from './types';

type SettingsContextValue = SettingsState & {
  ready: boolean;
  /** Non-null when remote is selected but base URL / API key is missing. */
  remoteError: string | null;
  setVerbosity: (verbosity: Verbosity) => Promise<void>;
  setProviderKind: (providerKind: ProviderKind) => Promise<void>;
  setBaseUrl: (baseUrl: string) => Promise<void>;
  setModel: (model: string) => Promise<void>;
  setApiKey: (apiKey: string) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [verbosity, setVerbosityState] = useState<Verbosity>(DEFAULT_PREFS.verbosity);
  const [providerKind, setProviderKindState] = useState<ProviderKind>(
    DEFAULT_PREFS.providerKind,
  );
  const [baseUrl, setBaseUrlState] = useState(DEFAULT_PREFS.baseUrl);
  const [model, setModelState] = useState(DEFAULT_PREFS.model);
  const [apiKey, setApiKeyState] = useState('');

  const prefsRef = useRef<SettingsPrefs>({ ...DEFAULT_PREFS });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadSettings();
      if (cancelled) return;
      const prefs: SettingsPrefs = {
        verbosity: loaded.verbosity,
        providerKind: loaded.providerKind,
        baseUrl: loaded.baseUrl,
        model: loaded.model,
      };
      prefsRef.current = prefs;
      setVerbosityState(prefs.verbosity);
      setProviderKindState(prefs.providerKind);
      setBaseUrlState(prefs.baseUrl);
      setModelState(prefs.model);
      setApiKeyState(loaded.apiKey);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistPrefsPatch = useCallback(async (patch: Partial<SettingsPrefs>) => {
    const next: SettingsPrefs = { ...prefsRef.current, ...patch };
    prefsRef.current = next;
    await savePrefs(next);
  }, []);

  const setVerbosity = useCallback(
    async (next: Verbosity) => {
      setVerbosityState(next);
      await persistPrefsPatch({ verbosity: next });
    },
    [persistPrefsPatch],
  );

  const setProviderKind = useCallback(
    async (next: ProviderKind) => {
      setProviderKindState(next);
      await persistPrefsPatch({ providerKind: next });
    },
    [persistPrefsPatch],
  );

  const setBaseUrl = useCallback(
    async (next: string) => {
      setBaseUrlState(next);
      await persistPrefsPatch({ baseUrl: next });
    },
    [persistPrefsPatch],
  );

  const setModel = useCallback(
    async (next: string) => {
      setModelState(next);
      await persistPrefsPatch({ model: next });
    },
    [persistPrefsPatch],
  );

  const setApiKey = useCallback(async (next: string) => {
    setApiKeyState(next);
    await saveApiKey(next);
  }, []);

  const remoteError = useMemo(
    () => remoteConfigError({ providerKind, baseUrl, apiKey }),
    [providerKind, baseUrl, apiKey],
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      ready,
      verbosity,
      providerKind,
      baseUrl,
      model,
      apiKey,
      remoteError,
      setVerbosity,
      setProviderKind,
      setBaseUrl,
      setModel,
      setApiKey,
    }),
    [
      ready,
      verbosity,
      providerKind,
      baseUrl,
      model,
      apiKey,
      remoteError,
      setVerbosity,
      setProviderKind,
      setBaseUrl,
      setModel,
      setApiKey,
    ],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within SettingsProvider');
  }
  return ctx;
}
