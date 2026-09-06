export type Verbosity = 'short' | 'standard' | 'lush';

export type ProviderKind = 'stub' | 'remote' | 'on-device';

export type SettingsPrefs = {
  verbosity: Verbosity;
  providerKind: ProviderKind;
};

export type SettingsState = SettingsPrefs & {
  apiKey: string;
};

export const DEFAULT_PREFS: SettingsPrefs = {
  verbosity: 'standard',
  providerKind: 'stub',
};

export const SECURE_KEYS = {
  apiKey: 'ia.settings.apiKey',
  prefs: 'ia.settings.prefs',
} as const;
