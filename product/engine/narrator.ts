import { createStarterMap, placeRef, type MapGraph } from './mapGraph';
import { tryLoadPlaystylePack } from './pack';
import {
  ARRIVAL,
  ARRIVE_FROM_INSIDE,
  CONTINUE,
  CUSTOM,
  HEARTH_STATE,
  LOCATION_DETAILS,
  LOOK,
  LOOK_FALLBACK,
  OPENING,
  QUEST_FIRST_STEPS,
  QUEST_FIRST_STEPS_MORE,
  TRAVEL_AT_BOUNDARY,
  TRAVEL_REFUSED,
  WHERE_AM_I,
  WHERE_AM_I_COMBAT,
  WHERE_AM_I_FALLBACK,
  type NodeId,
  type TokenValues,
} from './narration/lineBanks';
import {
  companionsPhrase,
  foeArticled,
  foeTokens,
  packKeyFor,
  placeRefFor,
  Voice,
  type VoiceInit,
} from './narration/voice';
import { isCleanProse } from './narration/lint';
import {
  buildNarratorSystemPrompt,
  buildNarratorUserMessage,
  type NarratorPromptFacts,
  type PromptBeat,
} from './narration/remotePrompt';

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
    | { kind: 'arrived'; place: NarratorLocationHint; toNodeId?: string }
    | { kind: 'refused'; attempted?: string }
    | { kind: 'at-boundary'; place: NarratorLocationHint }
    | null;
  /**
   * NARR-04: seeded voice (context + seed + last line ids) built from campaign state.
   * Omitted → a deterministic default from this request (no module-global state).
   */
  voice?: VoiceInit | null;
  /** Extra {tokens} (player name, weapon …). place/companions are filled here. */
  tokens?: TokenValues;
  /** Scripted First steps beats folded into this beat's prose. */
  questBeats?: { offer?: boolean; complete?: boolean; progressAtDoor?: boolean } | null;
  /** Foe name when a fight is on (where-am-I answers from the fight). */
  inCombatWith?: string | null;
  /** Facts for the remote narrator's user message (system-prompt.md layout). */
  promptFacts?: Partial<NarratorPromptFacts> | null;
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
  /** NARR-04: `narr.last.*` anti-repeat flags to persist with the beat. */
  narrFlags?: Record<string, string>;
  /** True when a remote reply failed the prose guard and the stub line was used. */
  guardFallback?: boolean;
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

/** Guaranteed non-empty player-facing line (Tale must never stay silent). */
export const STUB_SAFE_PROSE = 'You take a breath and look around you.';

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

/** Location / orientation questions — answer from Map-truth locationId. */
const LOCATION_QUESTION_RE =
  /\b(where\s+am\s+i|where\s+are\s+we|where\s+is\s+this|where\s+do\s+i\s+(stand|sit|find\s+myself)|what(?:'s|\s+is)\s+(?:my\s+)?location|what(?:'s|\s+is)\s+nearby|where\s+can\s+i\s+go|exits?\s+here)\b/i;

export function detectActionFlavor(action: string | undefined): StubActionFlavor {
  const text = (action ?? '').trim();
  if (!text) return 'general';
  for (const row of ACTION_FLAVOR_RE) {
    if (row.re.test(text)) return row.flavor;
  }
  return 'general';
}

export function isLocationQuestion(action: string | undefined): boolean {
  const text = (action ?? '').trim();
  if (!text) return false;
  return LOCATION_QUESTION_RE.test(text);
}

/** Collapse runs of spaces but keep paragraph breaks ("\n\n"). */
function ensureProse(prose: string): string {
  const t = prose
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
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

/** Deterministic default voice when the caller did not build one from state. */
function defaultVoiceInit(request: NarratorSceneRequest): VoiceInit {
  const fuel = request.worldTick?.hearthFuel;
  const atKettle =
    request.locationId === 'interior.kettle-common' || request.locationId === 'place.copper-kettle';
  return {
    ctx: {
      pack: packKeyFor(request.playstylePackId) ?? 'hearthlight',
      hpLow: false,
      companions: (request.partyNames ?? []).filter(Boolean).length > 0,
      recentEvent: null,
      timeOfDay: null,
      hearth: atKettle && fuel != null ? (fuel >= 3 ? 'bright' : fuel >= 1 ? 'low' : 'out') : null,
      activeQuestIds: [],
      doneQuestIds: [],
      has: { loot: false, goldLost: false, goldGained: false },
    },
    seedBase: [
      'stub',
      request.playstylePackId ?? '',
      request.locationId ?? '',
      request.turn ?? 0,
      (request.playerAction ?? '').trim().toLowerCase(),
    ].join('|'),
  };
}

/** One lush sensory detail: a LOCATION_DETAILS pick, plus the hearth at the common room. */
function lushDetail(voice: Voice, locationId: string | null | undefined): string | null {
  if (!locationId) return null;
  const bits: string[] = [];
  const d = voice.sayString(`detail.${locationId}`, LOCATION_DETAILS[locationId as NodeId]);
  if (d) bits.push(d);
  if (locationId === 'interior.kettle-common' && voice.ctx.hearth) {
    const h = voice.sayString(`hearth.${voice.ctx.hearth}`, HEARTH_STATE[voice.ctx.hearth]);
    if (h) bits.push(h);
  }
  return bits.length ? bits.join(' ') : null;
}

export type StubProse = {
  prose: string;
  source: NarratorSceneSource;
  narrFlags: Record<string, string>;
  /** Which beat label this was (remote prompt BEAT line). */
  promptBeat: PromptBeat;
};


let starterGraph: MapGraph | null = null;
/**
 * NARR-04 addendum 01: the source rooms each from-inside arrival bank describes. The Kettle lines
 * are written for coming up from the cellar (stairs, cellar smell), so the common room keeps the
 * ordinary Kettle arrival.
 */
const FROM_INSIDE_SOURCES: Partial<Record<string, readonly string[]>> = {
  'place.copper-kettle': ['interior.kettle-cellar'],
  'place.brightanvil': ['interior.smith-forge'],
  'place.mossglass': ['interior.alchemist-counter'],
};

/** Travel from a child node (interior/floor) up to its parent building, with copy for that room. */
export function isArrivalFromInside(fromId: string | null, toId: string | null): boolean {
  if (!fromId || !toId || !ARRIVE_FROM_INSIDE[toId as NodeId]) return false;
  if (!FROM_INSIDE_SOURCES[toId]?.includes(fromId)) return false;
  starterGraph ??= createStarterMap();
  return starterGraph.nodes[fromId]?.parentId === toId;
}

/** NARR-04 stub: every line comes from lineBanks via the seeded voice. */
export function resolveStubProse(request: NarratorSceneRequest): StubProse {
  const beat = request.beat ?? 'opening';
  const voice = new Voice(
    request.voice
      ? { ...request.voice, verbosity: request.verbosity ?? request.voice.verbosity ?? 'standard' }
      : { ...defaultVoiceInit(request), verbosity: request.verbosity ?? 'standard' },
  );
  const here = request.locationId ?? null;
  const companionNames = (request.partyNames ?? []).map((n) => n.trim()).filter(Boolean);
  const base: TokenValues = {
    place: here ? placeRefFor(here) : request.locationHint?.name ? placeRef(request.locationHint.name) : 'this place',
    ...(companionNames.length ? { companions: companionsPhrase(companionNames) } : {}),
    ...(request.tokens ?? {}),
  };
  const paragraphs: string[] = [];
  // 'pack-template' when the request names a real pack (pack-tagged lines are eligible); 'canned' otherwise.
  let source: NarratorSceneSource = tryLoadPlaystylePack(request.playstylePackId) ? 'pack-template' : 'canned';
  let promptBeat: PromptBeat = beat === 'opening' ? 'opening' : beat === 'continue' ? 'continue' : 'custom';

  // Unknown node (no id): the map's own description stands in as the lush detail, if it is clean.
  const hintDetail = (() => {
    const d = request.locationHint?.description?.trim();
    return d && !/\d/.test(d) ? d : null;
  })();
  const say = (path: string, banks: Parameters<Voice['say']>[1], values: TokenValues = base, detailAt?: string | null) =>
    voice.say(path, banks, values, {
      detail: detailAt === undefined ? null : detailAt ? lushDetail(voice, detailAt) : hintDetail,
    });

  if (beat === 'opening') {
    paragraphs.push(say('opening', OPENING, base, here) ?? STUB_SAFE_PROSE);
    if (request.questBeats?.offer) {
      const offer = say('quest.firstSteps.offer', QUEST_FIRST_STEPS.offer);
      if (offer) paragraphs.push(offer);
    }
  } else if (beat === 'continue') {
    paragraphs.push(say('continue', CONTINUE, base, here) ?? STUB_SAFE_PROSE);
  } else {
    const travel = request.travelOutcome;
    if (travel?.kind === 'arrived') {
      promptBeat = 'arrival';
      const toId = travel.toNodeId ?? null;
      const values: TokenValues = { ...base, place: placeRefFor(toId, placeRef(travel.place.name)) };
      const fromInside = isArrivalFromInside(here, toId);
      const banks = [
        fromInside ? ARRIVE_FROM_INSIDE[toId as NodeId] : undefined,
        toId ? ARRIVAL[toId as NodeId] : undefined,
        WHERE_AM_I_FALLBACK,
      ];
      const path = fromInside ? `arrival.inside.${toId}` : `arrival.${toId ?? 'any'}`;
      const parts: string[] = [say(path, banks, values, toId) ?? STUB_SAFE_PROSE];
      if (request.questBeats?.progressAtDoor) {
        const p = say('quest.firstSteps.progress', QUEST_FIRST_STEPS_MORE.progress, values);
        if (p) parts.push(p);
      }
      paragraphs.push(parts.join(' '));
      if (request.questBeats?.complete) {
        const c = say('quest.firstSteps.complete', QUEST_FIRST_STEPS.complete, values);
        if (c) paragraphs.push(c);
      }
    } else if (travel?.kind === 'at-boundary') {
      paragraphs.push(say('travel.boundary', TRAVEL_AT_BOUNDARY) ?? STUB_SAFE_PROSE);
    } else if (travel?.kind === 'refused') {
      paragraphs.push(say('travel.refused', TRAVEL_REFUSED) ?? STUB_SAFE_PROSE);
    } else if (request.worldTick?.prose?.trim()) {
      promptBeat = 'wait';
      paragraphs.push(request.worldTick.prose.trim());
    } else if (isLocationQuestion(request.playerAction)) {
      promptBeat = 'where';
      if (request.inCombatWith) {
        paragraphs.push(
          say('where.combat', WHERE_AM_I_COMBAT, { ...base, ...foeTokens(request.inCombatWith) }) ?? STUB_SAFE_PROSE,
        );
      } else {
        const banks = [here ? WHERE_AM_I[here as NodeId] : undefined, WHERE_AM_I_FALLBACK];
        paragraphs.push(say(`where.${here ?? 'any'}`, banks, base, here) ?? STUB_SAFE_PROSE);
      }
    } else {
      const flavor = detectActionFlavor(request.playerAction);
      if (flavor === 'look') {
        promptBeat = 'look';
        const banks = [here ? LOOK[here as NodeId] : undefined, LOOK_FALLBACK];
        paragraphs.push(say(`look.${here ?? 'any'}`, banks, base, here) ?? STUB_SAFE_PROSE);
      } else {
        paragraphs.push(say(`custom.${flavor}`, CUSTOM[flavor], base, here) ?? STUB_SAFE_PROSE);
      }
    }
  }

  return {
    prose: ensureProse(paragraphs.join('\n\n')),
    source,
    narrFlags: voice.flags(),
    promptBeat,
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
    const { prose, source, narrFlags } = resolveStubProse(request);
    return {
      prose,
      providerKind: 'stub',
      offline: true,
      source,
      narrFlags,
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
    // NARR-04: the stub line is computed first — it is the guard fallback and keeps
    // the anti-repeat flags moving even when the remote reply is used.
    const stub = resolveStubProse(request);
    const pack = tryLoadPlaystylePack(request.playstylePackId);
    const completion = await this.httpChat({
      model: this.model,
      messages: [
        { role: 'system', content: buildNarratorSystemPrompt(pack) },
        { role: 'user', content: buildNarratorUserMessage(promptFactsFor(request, stub.promptBeat)) },
      ],
    });
    const raw = completion.choices[0]!.message.content.trim();
    const allowNames = [
      ...(request.partyNames ?? []),
      ...(request.promptFacts?.playerName ? [request.promptFacts.playerName] : []),
      ...(request.promptFacts?.peopleHere ?? []).map((p) => p.name),
      ...(request.inCombatWith ? [request.inCombatWith] : []),
      ...(request.locationHint?.name ? [request.locationHint.name] : []),
    ];
    const allowTerms = request.promptFacts?.playerClass ? [request.promptFacts.playerClass] : [];
    if (!isCleanProse(raw, { allowNames, allowTerms, verbosity: request.verbosity ?? 'standard' })) {
      return {
        prose: stub.prose,
        providerKind: 'remote',
        offline: false,
        source: stub.source,
        narrFlags: stub.narrFlags,
        guardFallback: true,
      };
    }
    return {
      prose: ensureProse(raw),
      providerKind: 'remote',
      offline: false,
      source: 'remote',
      narrFlags: stub.narrFlags,
    };
  }
}

/** Fill the system-prompt.md user-message facts from the request (+ caller facts). */
export function promptFactsFor(request: NarratorSceneRequest, beat: PromptBeat): NarratorPromptFacts {
  const f = request.promptFacts ?? {};
  const travel = request.travelOutcome;
  const placeHint = travel?.kind === 'arrived' ? travel.place : request.locationHint ?? null;
  const locationId = travel?.kind === 'arrived' ? travel.toNodeId ?? null : request.locationId ?? null;
  const fuel = request.worldTick?.hearthFuel;
  return {
    beat: (f.beat as PromptBeat | undefined) ?? beat,
    verbosity: request.verbosity ?? 'standard',
    locationId,
    placeName: placeHint?.name ?? null,
    placeDetail: placeHint?.description ?? null,
    waysOn: (placeHint?.nearby ?? []).map((e) => (e.label ? `${e.label} (${e.toName})` : e.toName)),
    hearth:
      locationId === 'interior.kettle-common' && fuel != null
        ? fuel >= 3 ? 'bright' : fuel >= 1 ? 'low' : 'out'
        : null,
    companions: request.partyNames ?? [],
    inCombatWith: request.inCombatWith ? foeArticled(request.inCombatWith) : null,
    playerDid: f.playerDid ?? (request.playerAction ? detectActionFlavor(request.playerAction) : beat),
    ...f,
  };
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
