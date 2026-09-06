/**
 * Thin app-facing factory for narrator providers.
 * Vendor brand is not chosen — remote uses abstract base URL + API key.
 * Scene play always has an offline stub fallback (never blocks on network).
 */
import {
  createNarratorProvider,
  type NarratorProvider,
  type NarratorProviderKind,
  type NarratorProviderOptions,
  type NarratorSceneRequest,
  type NarratorSceneResult,
} from '../../engine/narrator';
import type { ProviderKind } from '../settings/types';

export type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  NarratorBeat,
  NarratorProvider,
  NarratorProviderKind,
  NarratorProviderOptions,
  NarratorSceneRequest,
  NarratorSceneResult,
  NarratorSceneSource,
  NarratorVerbosity,
} from '../../engine/narrator';

export {
  OnDeviceNarratorProvider,
  RemoteNarratorProvider,
  StubNarratorProvider,
  createNarratorProvider,
} from '../../engine/narrator';

export type NarratorSettingsInput = {
  providerKind: ProviderKind | NarratorProviderKind;
  apiKey?: string;
  /** Abstract OpenAI-compatible endpoint; optional until remote is configured. */
  baseUrl?: string;
  model?: string;
};

/** Map settings provider kind to an engine narrator instance. */
export function createNarratorFromSettings(
  settings: NarratorSettingsInput,
  overrides: NarratorProviderOptions = {},
): NarratorProvider {
  const kind = settings.providerKind as NarratorProviderKind;
  return createNarratorProvider(kind, {
    apiKey: overrides.apiKey ?? settings.apiKey,
    baseUrl: overrides.baseUrl ?? settings.baseUrl,
    model: overrides.model ?? settings.model,
    enableHttp: overrides.enableHttp,
    fetchImpl: overrides.fetchImpl,
  });
}

/**
 * Prefer settings provider; if remote/on-device is unavailable, fall back to stub.
 * Does not block offline play.
 */
export function createPlayNarrator(
  settings: NarratorSettingsInput,
  overrides: NarratorProviderOptions = {},
): { provider: NarratorProvider; fallbackNote: string | null } {
  const kind = settings.providerKind as NarratorProviderKind;
  if (kind === 'stub') {
    return { provider: createNarratorProvider('stub', overrides), fallbackNote: null };
  }

  const baseUrl = (overrides.baseUrl ?? settings.baseUrl ?? '').trim();
  const apiKey = (overrides.apiKey ?? settings.apiKey ?? '').trim();

  if (kind === 'remote') {
    if (!baseUrl || !apiKey) {
      return {
        provider: createNarratorProvider('stub', overrides),
        fallbackNote: 'Remote not configured — using offline stub',
      };
    }
    return {
      provider: createNarratorProvider('remote', {
        ...overrides,
        baseUrl,
        apiKey,
        enableHttp: overrides.enableHttp ?? true,
      }),
      fallbackNote: null,
    };
  }

  // on-device reserved → stub
  return {
    provider: createNarratorProvider('stub', overrides),
    fallbackNote: 'On-device narrator reserved — using offline stub',
  };
}

/** Narrate with play narrator; on remote failure, fall back to stub once. */
export async function narrateSceneForPlay(
  settings: NarratorSettingsInput,
  request: NarratorSceneRequest,
  overrides: NarratorProviderOptions = {},
): Promise<NarratorSceneResult & { fallbackNote: string | null }> {
  const { provider, fallbackNote } = createPlayNarrator(settings, overrides);
  try {
    const result = await provider.narrateScene(request);
    return { ...result, fallbackNote };
  } catch (err) {
    if (provider.kind === 'stub') throw err;
    const stub = createNarratorProvider('stub', overrides);
    const result = await stub.narrateScene(request);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...result,
      fallbackNote: `Remote failed (${msg}) — using offline stub`,
    };
  }
}

/** Convenience: stub opening beat for a pack (offline). */
export async function previewOpeningScene(
  playstylePackId: string | null | undefined,
  extras: Omit<NarratorSceneRequest, 'playstylePackId' | 'beat'> = {},
): Promise<NarratorSceneResult> {
  const provider = createNarratorProvider('stub');
  return provider.narrateScene({
    ...extras,
    playstylePackId: playstylePackId ?? null,
    beat: 'opening',
  });
}
