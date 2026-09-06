import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { loadSettings, saveApiKey, savePrefs } from './storage';
import {
  DEFAULT_PREFS,
  ProviderKind,
  SettingsPrefs,
  SettingsState,
  Verbosity,
} from './types';

type SettingsContextValue = SettingsState & {
  ready: boolean;
  setVerbosity: (verbosity: Verbosity) => Promise<void>;
  setProviderKind: (providerKind: ProviderKind) => Promise<void>;
  setApiKey: (apiKey: string) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [verbosity, setVerbosityState] = useState<Verbosity>(DEFAULT_PREFS.verbosity);
  const [providerKind, setProviderKindState] = useState<ProviderKind>(
    DEFAULT_PREFS.providerKind,
  );
  const [apiKey, setApiKeyState] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadSettings();
      if (cancelled) return;
      setVerbosityState(loaded.verbosity);
      setProviderKindState(loaded.providerKind);
      setApiKeyState(loaded.apiKey);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistPrefs = useCallback(async (prefs: SettingsPrefs) => {
    await savePrefs(prefs);
  }, []);

  const setVerbosity = useCallback(
    async (next: Verbosity) => {
      setVerbosityState(next);
      await persistPrefs({ verbosity: next, providerKind });
    },
    [persistPrefs, providerKind],
  );

  const setProviderKind = useCallback(
    async (next: ProviderKind) => {
      setProviderKindState(next);
      await persistPrefs({ verbosity, providerKind: next });
    },
    [persistPrefs, verbosity],
  );

  const setApiKey = useCallback(async (next: string) => {
    setApiKeyState(next);
    await saveApiKey(next);
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      ready,
      verbosity,
      providerKind,
      apiKey,
      setVerbosity,
      setProviderKind,
      setApiKey,
    }),
    [ready, verbosity, providerKind, apiKey, setVerbosity, setProviderKind, setApiKey],
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
