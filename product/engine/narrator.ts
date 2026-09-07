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

/** Map-truth hint for stub location answers (same source as Map panel). */
export type NarratorLocationHint = {
  name: string;
  description?: string;
  /** Nearby exits: destination name + travel label. */
  nearby: Array<{ toName: string; label: string }>;
};

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
  /**
   * Human-readable location + nearby (from whereAmI).
   * Used by stub for "where am I" / location questions — never raw location ids.
   */
  locationHint?: NarratorLocationHint | null;
  /**
   * NARR-02b world-tick from ambient scene clock (wait / fuel / hearth).
   * When prose is set, stub uses it instead of the tiny repeat pool.
   */
  worldTick?: {
    kind: string;
    isWait: boolean;
    isFuel: boolean;
    hearthFuel: number | null;
    lastWaitTick: number;
    prose: string | null;
  } | null;
  /**
   * TRAVEL-01: structured travel result from Map exits.
   * arrived → narrate the NEW place; refused → honest stub, no move.
   */
  travelOutcome?:
    | { kind: 'arrived'; place: NarratorLocationHint }
    | { kind: 'refused'; attempted?: string }
    | { kind: 'at-boundary'; place: NarratorLocationHint }
    | null;
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

/** Guaranteed non-empty player-facing line (Tale must never stay silent). */
export const STUB_SAFE_PROSE =
  'The moment holds. The tale waits on what you do next.';

type StubActionFlavor =
  | 'look'
  | 'travel'
  | 'talk'
  | 'fight'
  | 'search'
  | 'rest'
  | 'take'
  | 'general';

const ACTION_FLAVOR_RE: Array<{ flavor: StubActionFlavor; re: RegExp }> = [
  { flavor: 'look', re: /\b(look|gaze|watch|observe|survey|peer|glance)\b/i },
  {
    flavor: 'travel',
    re: /\b(go|head|walk|travel|enter|leave|return|move|step|descend|ascend|follow|approach)\b/i,
  },
  {
    flavor: 'talk',
    re: /\b(say|ask|tell|talk|speak|persuade|convince|threaten|whisper|call)\b/i,
  },
  {
    flavor: 'fight',
    re: /\b(attack|strike|hit|fight|swing|defend|dodge|cast|shoot|slash)\b/i,
  },
  {
    flavor: 'search',
    re: /\b(search|examine|inspect|investigate|rummage|check|listen|track)\b/i,
  },
  { flavor: 'rest', re: /\b(rest|wait|sit|camp|sleep|catch\s*breath)\b/i },
  {
    flavor: 'take',
    re: /\b(take|grab|pick\s*up|loot|pocket|steal|drink|eat|use)\b/i,
  },
];

/** Varied pack lines per flavor — stub must not feel like a tiny repeat pool. */
const FLAVOR_POOLS: Record<StubActionFlavor, string[]> = {
  look: [
    'You take in the scene. Details sharpen — light, sound, and what might matter next.',
    'Your gaze settles. Edges resolve: exits, faces, and the small things worth noticing.',
    'You study the space. Something useful — or dangerous — comes into focus.',
  ],
  travel: [
    'You set yourself toward a new footing. Thresholds, roads, and rooms answer by shifting under your feet.',
    'You commit to the path. Distance closes; the map of the moment redraws around you.',
    'Forward, then. Doorframes and trail markers lean toward wherever you are going.',
  ],
  talk: [
    'Words land. Faces and silences rearrange; someone — or something — has heard you.',
    'You speak into the hush. Attention turns; answers or new questions gather close.',
    'Your voice shapes the beat. A reply, a glance, or a careful quiet answers back.',
  ],
  fight: [
    'Steel and will meet the moment. The clash resolves into new openings and fresh risk.',
    'You commit to the strike. The exchange ends with bloodless possibility and sharper stakes.',
    'Combat focuses the room. Footing, guard, and openings rearrange after the blow.',
  ],
  search: [
    'You dig for what is hidden. A clue, a trap, or empty air — the world gives something back.',
    'Fingers and eyes hunt the margins. The search pays in detail, if not always treasure.',
    'You comb the place. Dust, marks, and oddities answer whether fortune does or not.',
  ],
  rest: [
    'You ease the pace. Breath returns; the next threat or kindness has a little more room.',
    'You pause. Tension loosens a notch — enough to hear what the quiet was hiding.',
    'A short rest settles in. Strength gathers for whatever stands on the other side of stillness.',
  ],
  take: [
    'Your hands claim a change. Weight, warmth, or absence marks what you took into the tale.',
    'You take what the moment offers. Inventory — and consequence — shifts with the grasp.',
    'Possession changes hands. The world notes what you claimed and what you left behind.',
  ],
  general: [
    'Your choice ripples outward. Doors, faces, and unfinished business lean toward what comes next.',
    'The tale answers your intent. Threads tug; the scene leans into what you meant to do.',
    'Action settles into place. The world rearranges around the choice you just made.',
    'You press on. Possibility thickens — not a repeat of the last beat, but a fresh hinge.',
  ],
};

/** Location / orientation questions — answer from Map-truth locationHint. */
const LOCATION_QUESTION_RE =
  /\b(where\s+am\s+i|where\s+are\s+we|where\s+is\s+this|where\s+do\s+i\s+(stand|sit|find\s+myself)|what(?:'s|\s+is)\s+(?:my\s+)?location|what(?:'s|\s+is)\s+nearby|where\s+can\s+i\s+go|exits?\s+here)\b/i;

/** Recent stub bodies — avoid identical replies for different inputs in a short window. */
const RECENT_STUB_WINDOW = 8;
const recentStubBodies: string[] = [];

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rememberStubBody(body: string): void {
  recentStubBodies.push(body);
  while (recentStubBodies.length > RECENT_STUB_WINDOW) {
    recentStubBodies.shift();
  }
}

function pickVariedLine(pool: string[], seedKey: string): string {
  if (pool.length === 0) return STUB_SAFE_PROSE;
  const start = hashSeed(seedKey) % pool.length;
  for (let i = 0; i < pool.length; i += 1) {
    const candidate = pool[(start + i) % pool.length]!;
    if (!recentStubBodies.includes(candidate)) {
      rememberStubBody(candidate);
      return candidate;
    }
  }
  // All recent — still rotate off the seed so different inputs diverge.
  const fallback = pool[start]!;
  rememberStubBody(fallback);
  return fallback;
}

function detectActionFlavor(action: string | undefined): StubActionFlavor {
  const text = (action ?? '').trim();
  if (!text) return 'general';
  for (const row of ACTION_FLAVOR_RE) {
    if (row.re.test(text)) return row.flavor;
  }
  return 'general';
}

function isLocationQuestion(action: string | undefined): boolean {
  const text = (action ?? '').trim();
  if (!text) return false;
  return LOCATION_QUESTION_RE.test(text);
}

/** Build Map-truth orientation prose (same facts as Map panel). */
function proseForLocationHint(hint: NarratorLocationHint | null | undefined): string {
  if (!hint?.name?.trim()) {
    return 'You are somewhere the map has not named yet. Look again once the trail marks settle.';
  }
  const name = hint.name.trim();
  const desc = (hint.description ?? '').replace(/\s+/g, ' ').trim();
  const nearby = hint.nearby ?? [];
  const nearbyBit =
    nearby.length === 0
      ? 'Nothing obvious is nearby from here.'
      : `Nearby: ${nearby
          .map((e) => {
            const dest = e.toName?.trim() || 'somewhere';
            const label = e.label?.trim();
            return label ? `${dest} (${label})` : dest;
          })
          .join('; ')}.`;
  if (desc) {
    return `You are at ${name}. ${desc} ${nearbyBit}`;
  }
  return `You are at ${name}. ${nearbyBit}`;
}

/** TRAVEL-01: arrival at a nearby exit destination. */
function proseForArrival(place: NarratorLocationHint): string {
  const name = place.name?.trim() || 'a new place';
  const desc = (place.description ?? '').replace(/\s+/g, ' ').trim();
  const nearby = place.nearby ?? [];
  const nearbyBit =
    nearby.length === 0
      ? 'Nothing obvious is nearby from here.'
      : `Nearby: ${nearby
          .map((e) => {
            const dest = e.toName?.trim() || 'somewhere';
            const label = e.label?.trim();
            return label ? `${dest} (${label})` : dest;
          })
          .join('; ')}.`;
  if (desc) {
    return `You arrive at ${name}. ${desc} ${nearbyBit}`;
  }
  return `You arrive at ${name}. ${nearbyBit}`;
}

/** TRAVEL-01: go/walk/head to a place that is not a nearby exit. */
function proseForTravelRefuse(attempted?: string): string {
  void attempted;
  return (
    'You cannot reach that from here. Check the Map for nearby places, ' +
    'or name a nearby exit in the Tale.'
  );
}

/** TRAVEL-01: leave past the top of the Region → … chain. */
function proseForAtBoundary(place: NarratorLocationHint): string {
  const name = place.name?.trim() || 'the open wilds';
  return (
    `You are already at ${name} — the open edge of the map. ` +
    'There is nowhere higher to leave toward from here. Name a nearby place if you want to travel.'
  );
}

/** Action-aware stub body — never echoes raw playerAction into prose. */
function flavorBodyForAction(
  action: string | undefined,
  packFallback: string | null,
): string {
  const flavor = detectActionFlavor(action);
  const pool = FLAVOR_POOLS[flavor];
  const flavored = pickVariedLine(pool, `${flavor}|${(action ?? '').trim()}`);
  if (packFallback?.trim()) {
    // Lead with action flavor, then pack color — still no raw echo.
    return `${flavored} ${packFallback.trim()}`;
  }
  return flavored;
}

function ensureProse(prose: string): string {
  const t = prose.replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : STUB_SAFE_PROSE;
}

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
    // Travel arrival/refuse → Map-truth. World-tick → ambient. Location Q → Map-truth.
    if (request.travelOutcome?.kind === 'arrived') {
      body = proseForArrival(request.travelOutcome.place);
      source = 'canned';
    } else if (request.travelOutcome?.kind === 'at-boundary') {
      body = proseForAtBoundary(request.travelOutcome.place);
      source = 'canned';
    } else if (request.travelOutcome?.kind === 'refused') {
      body = proseForTravelRefuse(request.travelOutcome.attempted);
      source = 'canned';
    } else if (request.worldTick?.prose?.trim()) {
      body = request.worldTick.prose.trim();
      source = 'canned';
    } else if (isLocationQuestion(request.playerAction)) {
      body = proseForLocationHint(request.locationHint);
      source = 'canned';
    } else {
      const packFallback = stubs?.customBeatFallback?.trim() || null;
      const flavored = flavorBodyForAction(request.playerAction, null);
      if (packFallback) {
        const prefix = stubs?.customBeatPrefix?.trim();
        body = prefix
          ? `${prefix} ${flavored} ${packFallback}`
          : `${flavored} ${packFallback}`;
        source = 'pack-template';
      } else {
        body = flavored || FALLBACK_CUSTOM;
        source = 'canned';
      }
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
    prose: ensureProse(applyVerbosity(bits.join(' '), request.verbosity)),
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
      prose: ensureProse(applyVerbosity(prose, request.verbosity)),
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
