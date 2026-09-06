import { tryLoadPlaystylePack } from './pack';

/** Matches settings `ProviderKind` without importing React settings. */
export type NarratorProviderKind = 'stub' | 'remote' | 'on-device';

export type NarratorVerbosity = 'short' | 'standard' | 'lush';

export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

/** OpenAI-compatible chat completions request (subset). */
export type ChatCompletionRequest = {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
};

export type ChatCompletionChoice = {
  index: number;
  message: ChatMessage;
  finish_reason: 'stop' | 'length' | string;
};

/** OpenAI-compatible chat completions response (subset). */
export type ChatCompletionResponse = {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
};

export type NarratorBeat = 'opening' | 'continue' | 'custom';

export type NarratorSceneRequest = {
  playstylePackId?: string | null;
  locationId?: string | null;
  /** Empty array / omit is valid (solo default / empty party). */
  partyNames?: string[];
  turn?: number;
  playerAction?: string;
  logSummary?: string;
  verbosity?: NarratorVerbosity;
  beat?: NarratorBeat;
  /** Optional dice/check outcome line for stub prose coloring. */
  checkHint?: string;
};

export type NarratorSceneSource =
  | 'pack-template'
  | 'canned'
  | 'remote'
  | 'on-device';

export type NarratorSceneResult = {
  prose: string;
  providerKind: NarratorProviderKind;
  /** True when no network was used. */
  offline: boolean;
  source: NarratorSceneSource;
};

export type NarratorProviderOptions = {
  /** Abstract OpenAI-compatible base URL (no vendor brand). */
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  /**
   * When true and baseUrl+apiKey are set, remote may call HTTP.
   * Default false — transport stays pending so offline/stub play is never blocked.
   */
  enableHttp?: boolean;
  /** Optional fetch impl (tests / RN). Defaults to global fetch when enableHttp. */
  fetchImpl?: typeof fetch;
};

export interface NarratorProvider {
  readonly kind: NarratorProviderKind;
  createChatCompletion(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse>;
  narrateScene(request: NarratorSceneRequest): Promise<NarratorSceneResult>;
}

const CANNED_OPENING =
  'The road ahead is quiet. You stand alone at the threshold of the adventure, free to choose your next step.';

/** Generic fallbacks — no shell/debug voice. */
const FALLBACK_CONTINUE =
  'The moment thins. Paths, voices, and unfinished business wait on what you do next.';

const FALLBACK_CUSTOM =
  'What you chose settles into the world — doors, faces, and risks rearrange around it.';

function completionFromProse(
  prose: string,
  model: string,
): ChatCompletionResponse {
  const created = Math.floor(Date.now() / 1000);
  return {
    id: `chatcmpl-stub-${created}`,
    object: 'chat.completion',
    created,
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: prose },
        finish_reason: 'stop',
      },
    ],
  };
}

function lastUserContent(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m && m.role === 'user' && m.content.trim()) return m.content.trim();
  }
  return '';
}

function applyVerbosity(
  prose: string,
  verbosity: NarratorVerbosity = 'standard',
): string {
  const trimmed = prose.trim();
  if (verbosity === 'short') {
    const sentence = trimmed.split(/(?<=[.!?])\s+/)[0] ?? trimmed;
    return sentence.length > 160 ? `${sentence.slice(0, 157)}…` : sentence;
  }
  if (verbosity === 'lush') {
    return `${trimmed} Soft detail gathers at the edges of the moment — texture, light, and quiet possibility — without crowding your choice.`;
  }
  return trimmed;
}

function partyClause(
  partyNames: string[] | undefined,
  pack: ReturnType<typeof tryLoadPlaystylePack>,
  beat: NarratorBeat,
): string | null {
  const stubs = pack?.contentStubs;
  const names = (partyNames ?? []).map((n) => n.trim()).filter(Boolean);

  if (names.length === 0) {
    // Opening pack beats already imply solitude — skip aloneClause to avoid doubling.
    if (beat === 'opening' && stubs?.openingBeat) {
      return null;
    }
    return stubs?.aloneClause?.trim() || null;
  }
  if (names.length === 1) {
    const template =
      stubs?.partyReadyOne?.trim() || '{name} stands ready beside you.';
    return template.replace(/\{name\}/g, names[0]!);
  }
  const template =
    stubs?.partyReadyMany?.trim() || 'With you: {names}.';
  return template.replace(/\{names\}/g, names.join(', '));
}

function resolveStubProse(request: NarratorSceneRequest): {
  prose: string;
  source: NarratorSceneSource;
} {
  const beat = request.beat ?? 'opening';
  const pack = tryLoadPlaystylePack(request.playstylePackId);
  const stubs = pack?.contentStubs;
  let body: string;
  let source: NarratorSceneSource = 'canned';

  if (beat === 'opening' && stubs?.openingBeat) {
    body = stubs.openingBeat;
    source = 'pack-template';
  } else if (beat === 'continue') {
    if (stubs?.continueBeat) {
      body = stubs.continueBeat;
      source = 'pack-template';
    } else {
      body = FALLBACK_CONTINUE;
    }
  } else if (beat === 'custom') {
    // Never echo raw playerAction into player-facing prose.
    if (stubs?.customBeatFallback) {
      const prefix = stubs.customBeatPrefix?.trim();
      body = prefix
        ? `${prefix} ${stubs.customBeatFallback}`
        : stubs.customBeatFallback;
      source = 'pack-template';
    } else {
      body = FALLBACK_CUSTOM;
    }
  } else if (beat === 'opening') {
    body = CANNED_OPENING;
  } else {
    body = FALLBACK_CUSTOM;
  }

  // Player-facing stub prose only — keep session logSummary / turn / raw
  // location ids out of the narrative (they remain available to remote prompts).
  const bits: string[] = [body];
  const party = partyClause(request.partyNames, pack, beat);
  if (party) bits.push(party);
  if (request.checkHint?.trim()) {
    bits.push(request.checkHint.trim());
  }

  return {
    prose: applyVerbosity(bits.join(' '), request.verbosity),
    source,
  };
}

/** Offline stub: pack templates + canned prose; never touches the network. */
export class StubNarratorProvider implements NarratorProvider {
  readonly kind = 'stub' as const;
  private readonly model: string;

  constructor(options: NarratorProviderOptions = {}) {
    this.model = options.model?.trim() || 'ia-stub';
  }

  async createChatCompletion(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    const user = lastUserContent(request.messages);
    const { prose } = resolveStubProse({
      beat: user ? 'custom' : 'opening',
      playerAction: user || undefined,
      verbosity: 'standard',
    });
    return completionFromProse(prose, request.model?.trim() || this.model);
  }

  async narrateScene(
    request: NarratorSceneRequest,
  ): Promise<NarratorSceneResult> {
    const { prose, source } = resolveStubProse(request);
    return {
      prose,
      providerKind: 'stub',
      offline: true,
      source,
    };
  }
}

/**
 * Remote OpenAI-compatible provider.
 * Throws a clear "not configured" until base URL + API key are supplied.
 * HTTP runs only when `enableHttp` is true (optional; default off).
 */
export class RemoteNarratorProvider implements NarratorProvider {
  readonly kind = 'remote' as const;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly enableHttp: boolean;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(options: NarratorProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '').trim().replace(/\/+$/, '');
    this.apiKey = (options.apiKey ?? '').trim();
    this.model = options.model?.trim() || 'openai-compatible';
    this.enableHttp = Boolean(options.enableHttp);
    this.fetchImpl = options.fetchImpl;
  }

  private assertConfigured(): void {
    if (!this.baseUrl || !this.apiKey) {
      throw new Error(
        'Narrator remote provider is not configured (set base URL and API key)',
      );
    }
  }

  private async httpChat(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    this.assertConfigured();
    const fetchFn = this.fetchImpl ?? globalThis.fetch;
    if (typeof fetchFn !== 'function') {
      throw new Error(
        'Narrator remote HTTP client is not implemented yet (provider configured but transport pending)',
      );
    }
    const url = `${this.baseUrl}/chat/completions`;
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: request.model?.trim() || this.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.max_tokens,
      }),
    });
    if (!res.ok) {
      throw new Error(`Narrator remote HTTP failed (${res.status})`);
    }
    const data = (await res.json()) as ChatCompletionResponse;
    if (!data?.choices?.[0]?.message?.content) {
      throw new Error('Narrator remote HTTP returned empty completion');
    }
    return data;
  }

  async createChatCompletion(
    request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    this.assertConfigured();
    if (!this.enableHttp) {
      throw new Error(
        'Narrator remote HTTP client is not implemented yet (provider configured but transport pending)',
      );
    }
    return this.httpChat(request);
  }

  async narrateScene(
    request: NarratorSceneRequest,
  ): Promise<NarratorSceneResult> {
    this.assertConfigured();
    if (!this.enableHttp) {
      throw new Error(
        'Narrator remote HTTP client is not implemented yet (provider configured but transport pending)',
      );
    }
    const system =
      'You are a concise fantasy adventure narrator. No NSFW. Empty party is valid; do not invent forced companions.';
    const userParts = [
      `Beat: ${request.beat ?? 'opening'}`,
      request.playerAction?.trim()
        ? `Player action: ${request.playerAction.trim()}`
        : null,
      request.locationId ? `Location: ${request.locationId}` : null,
      request.partyNames && request.partyNames.length
        ? `Party: ${request.partyNames.join(', ')}`
        : 'Party: alone',
      request.logSummary?.trim()
        ? `Recently: ${request.logSummary.trim()}`
        : null,
      request.checkHint?.trim() ? request.checkHint.trim() : null,
      `Verbosity: ${request.verbosity ?? 'standard'}`,
    ].filter(Boolean);
    const completion = await this.httpChat({
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userParts.join('\n') },
      ],
    });
    const prose = completion.choices[0]!.message.content.trim();
    return {
      prose: applyVerbosity(prose, request.verbosity),
      providerKind: 'remote',
      offline: false,
      source: 'remote',
    };
  }
}

/** Reserved on-device LLM slot for v1 — not available. */
export class OnDeviceNarratorProvider implements NarratorProvider {
  readonly kind = 'on-device' as const;

  async createChatCompletion(
    _request: ChatCompletionRequest,
  ): Promise<ChatCompletionResponse> {
    throw new Error(
      'On-device narrator is reserved and not available in v1',
    );
  }

  async narrateScene(
    _request: NarratorSceneRequest,
  ): Promise<NarratorSceneResult> {
    throw new Error(
      'On-device narrator is reserved and not available in v1',
    );
  }
}

/** Build a provider for the given kind. Default kind is stub (offline-safe). */
export function createNarratorProvider(
  kind: NarratorProviderKind = 'stub',
  options: NarratorProviderOptions = {},
): NarratorProvider {
  switch (kind) {
    case 'stub':
      return new StubNarratorProvider(options);
    case 'remote':
      return new RemoteNarratorProvider(options);
    case 'on-device':
      return new OnDeviceNarratorProvider();
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unknown narrator provider kind: ${String(_exhaustive)}`);
    }
  }
}
