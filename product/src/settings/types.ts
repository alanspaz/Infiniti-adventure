export type Verbosity = 'short' | 'standard' | 'lush';

export type ProviderKind = 'stub' | 'remote' | 'on-device';

export type SettingsPrefs = {
  verbosity: Verbosity;
  providerKind: ProviderKind;
  /** OpenAI-compatible chat base URL (e.g. https://api.openai.com/v1). */
  baseUrl: string;
  /** Optional model id for remote chat completions. */
  model: string;
};

export type SettingsState = SettingsPrefs & {
  apiKey: string;
};

export const DEFAULT_PREFS: SettingsPrefs = {
  verbosity: 'standard',
  providerKind: 'stub',
  baseUrl: '',
  model: '',
};

export const SECURE_KEYS = {
  apiKey: 'ia.settings.apiKey',
  prefs: 'ia.settings.prefs',
} as const;

/** Clear message when remote is selected but incomplete. Never includes the API key. */
export function remoteConfigError(
  prefs: Pick<SettingsPrefs, 'providerKind' | 'baseUrl'> & { apiKey?: string },
): string | null {
  if (prefs.providerKind !== 'remote') return null;
  const baseUrl = (prefs.baseUrl ?? '').trim();
  const apiKey = (prefs.apiKey ?? '').trim();
  const missing: string[] = [];
  if (!baseUrl) missing.push('base URL');
  if (!apiKey) missing.push('API key');
  if (missing.length === 0) return null;
  return `Remote narrator needs ${missing.join(' and ')}`;
}
