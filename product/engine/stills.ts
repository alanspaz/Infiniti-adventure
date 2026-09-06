/** Matches narrator/settings provider kinds without importing React. */
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
