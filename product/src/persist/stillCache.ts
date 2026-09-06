/**
 * App-facing stills cache helpers (AsyncStorage PersistStore).
 * Engine cache API stays pure; this injects the app store singleton.
 */
import type {
  StillCacheEntry,
  StillProvider,
  StillProviderKind,
  StillProviderOptions,
  StillRequest,
  StillResult,
} from '../../engine/stills';
import {
  CachingStillProvider,
  createCachedStillProvider,
  createStillProvider,
  listStillCacheEntries,
  readStillCache,
  writeStillCache,
} from '../../engine/stills';
import type { PersistStore } from '../../engine/persist';
import { getAppPersistStore } from './appPersistStore';

export type {
  StillCacheEntry,
  StillProvider,
  StillRequest,
  StillResult,
};

export function getStillPersistStore(
  store?: PersistStore,
): PersistStore {
  return store ?? getAppPersistStore();
}

/** Offline stub wrapped with device cache (default for Scene / Stills UI). */
export function createAppStillProvider(
  store?: PersistStore,
  kind: StillProviderKind = 'stub',
  options: StillProviderOptions = {},
): StillProvider {
  const s = getStillPersistStore(store);
  if (kind === 'remote') {
    // Remote remains optional / not configured unless baseUrl+apiKey provided.
    // Prefer caching stub for offline play when remote is incomplete.
    const base = (options.baseUrl ?? '').trim();
    const key = (options.apiKey ?? '').trim();
    if (!base || !key) {
      return createCachedStillProvider(s, 'stub');
    }
    // Configured remote still throws pending transport — wrap would cache failures; use raw.
    return createStillProvider('remote', options);
  }
  return createCachedStillProvider(s, kind, options);
}

export async function loadCachedStill(
  cacheKey: string,
  store?: PersistStore,
): Promise<StillCacheEntry | null> {
  return readStillCache(getStillPersistStore(store), cacheKey);
}

export async function saveStillResult(
  result: StillResult,
  store?: PersistStore,
): Promise<StillCacheEntry> {
  return writeStillCache(getStillPersistStore(store), result);
}

export async function loadStillGallery(
  store?: PersistStore,
): Promise<StillCacheEntry[]> {
  return listStillCacheEntries(getStillPersistStore(store));
}

export { CachingStillProvider, createStillProvider };
