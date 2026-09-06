/** Matches narrator/settings provider kinds without importing React. */
import type { PersistStore } from './persist';

export type StillProviderKind = 'stub' | 'remote' | 'on-device';

export type StillSubjectKind =
  | 'player'
  | 'npc'
  | 'location'
  | 'item'
  | 'injury'
  | 'described';

export type StillRequest = {
  subjectKind: StillSubjectKind;
  subjectId?: string | null;
  /** Free-form “show me what you described”. */
  prompt?: string | null;
  locationId?: string | null;
  styleHint?: string | null;
  playstylePackId?: string | null;
};

export type StillResult = {
  providerKind: StillProviderKind;
  offline: boolean;
  /** Null until a real image URI exists; stub always null. */
  uri: string | null;
  placeholder: boolean;
  cacheKey: string;
  message: string;
  subjectKind: StillSubjectKind;
};

export type StillProviderOptions = {
  baseUrl?: string;
  apiKey?: string;
};

export interface StillProvider {
  readonly kind: StillProviderKind;
  requestStill(request: StillRequest): Promise<StillResult>;
}

/** Persisted still metadata (placeholder or future URI). */
export type StillCacheEntry = StillResult & {
  /** ISO-8601 when written. */
  cachedAt: string;
};

/** Index of cacheKeys for gallery / reload. */
export const STILL_CACHE_INDEX_KEY = 'ia.still.index';

/** Persist key for a single still entry (cacheKey already starts with ia.still.). */
export function stillPersistKey(cacheKey: string): string {
  return `ia.still.entry.${cacheKey}`;
}

function slugPart(value: string | null | undefined, fallback: string): string {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

/** Deterministic cache key for offline placeholder / future cache. */
export function stillCacheKey(request: StillRequest): string {
  const kind = request.subjectKind;
  const subject = slugPart(request.subjectId, 'anon');
  const loc = slugPart(request.locationId, 'nowhere');
  const pack = slugPart(request.playstylePackId, 'nopack');
  const promptBit = slugPart(
    request.prompt ? request.prompt.slice(0, 48) : null,
    'noprompt',
  );
  return `ia.still.${kind}.${subject}.${loc}.${pack}.${promptBit}`;
}

export function serializeStillCacheEntry(entry: StillCacheEntry): string {
  return JSON.stringify(entry);
}

export function parseStillCacheEntry(raw: string): StillCacheEntry {
  const data = JSON.parse(raw) as Partial<StillCacheEntry>;
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid still cache entry');
  }
  if (typeof data.cacheKey !== 'string' || !data.cacheKey) {
    throw new Error('Still cache entry missing cacheKey');
  }
  if (typeof data.subjectKind !== 'string') {
    throw new Error('Still cache entry missing subjectKind');
  }
  return {
    providerKind: (data.providerKind as StillProviderKind) ?? 'stub',
    offline: data.offline !== false,
    uri: typeof data.uri === 'string' ? data.uri : null,
    placeholder: data.placeholder !== false,
    cacheKey: data.cacheKey,
    message: typeof data.message === 'string' ? data.message : 'Cached still',
    subjectKind: data.subjectKind as StillSubjectKind,
    cachedAt:
      typeof data.cachedAt === 'string'
        ? data.cachedAt
        : new Date().toISOString(),
  };
}

export async function readStillCache(
  store: PersistStore,
  cacheKey: string,
): Promise<StillCacheEntry | null> {
  const raw = await store.get(stillPersistKey(cacheKey));
  if (!raw) return null;
  try {
    return parseStillCacheEntry(raw);
  } catch {
    return null;
  }
}

export async function writeStillCache(
  store: PersistStore,
  result: StillResult,
  cachedAt: string = new Date().toISOString(),
): Promise<StillCacheEntry> {
  const entry: StillCacheEntry = { ...result, cachedAt };
  await store.set(stillPersistKey(result.cacheKey), serializeStillCacheEntry(entry));
  await addStillCacheIndex(store, result.cacheKey);
  return entry;
}

export async function readStillCacheIndex(
  store: PersistStore,
): Promise<string[]> {
  const raw = await store.get(STILL_CACHE_INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

async function addStillCacheIndex(
  store: PersistStore,
  cacheKey: string,
): Promise<void> {
  const list = await readStillCacheIndex(store);
  if (list.includes(cacheKey)) return;
  list.unshift(cacheKey);
  // Cap index so storage stays small (placeholders only).
  const trimmed = list.slice(0, 64);
  await store.set(STILL_CACHE_INDEX_KEY, JSON.stringify(trimmed));
}

export async function listStillCacheEntries(
  store: PersistStore,
): Promise<StillCacheEntry[]> {
  const keys = await readStillCacheIndex(store);
  const out: StillCacheEntry[] = [];
  for (const key of keys) {
    const entry = await readStillCache(store, key);
    if (entry) out.push(entry);
  }
  return out;
}

/**
 * Wraps any StillProvider with PersistStore cache.
 * Engine stays pure — inject MemoryPersistStore in tests / AsyncPersistStore in app.
 */
export class CachingStillProvider implements StillProvider {
  constructor(
    private readonly inner: StillProvider,
    private readonly store: PersistStore,
  ) {}

  get kind(): StillProviderKind {
    return this.inner.kind;
  }

  async requestStill(request: StillRequest): Promise<StillResult> {
    const key = stillCacheKey(request);
    const hit = await readStillCache(this.store, key);
    if (hit) {
      return {
        providerKind: hit.providerKind,
        offline: hit.offline,
        uri: hit.uri,
        placeholder: hit.placeholder,
        cacheKey: hit.cacheKey,
        message: hit.message.includes('(cached)')
          ? hit.message
          : `${hit.message} (cached)`,
        subjectKind: hit.subjectKind,
      };
    }
    const result = await this.inner.requestStill(request);
    await writeStillCache(this.store, result);
    return result;
  }
}

export class StubStillProvider implements StillProvider {
  readonly kind = 'stub' as const;

  async requestStill(request: StillRequest): Promise<StillResult> {
    const cacheKey = stillCacheKey(request);
    return {
      providerKind: 'stub',
      offline: true,
      uri: null,
      placeholder: true,
      cacheKey,
      message: `Placeholder still (offline) for ${request.subjectKind}`,
      subjectKind: request.subjectKind,
    };
  }
}

export class RemoteStillProvider implements StillProvider {
  readonly kind = 'remote' as const;

  constructor(private readonly options: StillProviderOptions = {}) {}

  private isConfigured(): boolean {
    return Boolean(this.options.baseUrl?.trim() && this.options.apiKey?.trim());
  }

  async requestStill(_request: StillRequest): Promise<StillResult> {
    if (!this.isConfigured()) {
      throw new Error(
        'Remote stills provider is not configured (set base URL and API key)',
      );
    }
    throw new Error(
      'Remote stills transport is pending (not configured for network use yet)',
    );
  }
}

export class OnDeviceStillProvider implements StillProvider {
  readonly kind = 'on-device' as const;

  async requestStill(_request: StillRequest): Promise<StillResult> {
    throw new Error(
      'On-device stills provider is reserved / not available in v1',
    );
  }
}

export function createStillProvider(
  kind: StillProviderKind,
  options: StillProviderOptions = {},
): StillProvider {
  switch (kind) {
    case 'stub':
      return new StubStillProvider();
    case 'remote':
      return new RemoteStillProvider(options);
    case 'on-device':
      return new OnDeviceStillProvider();
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown still provider kind: ${String(_exhaustive)}`);
    }
  }
}

/** App helper: stub + optional PersistStore cache (offline by default). */
export function createCachedStillProvider(
  store: PersistStore,
  kind: StillProviderKind = 'stub',
  options: StillProviderOptions = {},
): StillProvider {
  return new CachingStillProvider(createStillProvider(kind, options), store);
}
