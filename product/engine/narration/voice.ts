/**
 * NARR-04 · Voice: picks lines from lineBanks with a per-campaign seeded rng,
 * never the same line id twice in a row per path (`flags['narr.last.<path>']`).
 *
 * The narration rng is separate from the combat/dice rng, so wiring prose never
 * changes a roll. Numbers never go into prose: callers build a MechanicsDelta and
 * render it with `mechanicsLineFor` under the prose.
 */
import { createSeededRng } from '../rng';
import { getMapNode, createStarterMap, placeRef, type MapGraph } from '../mapGraph';
import type { CampaignFlagValue } from '../save';
import {
  composeLine,
  formatMechanicsLine,
  listJoinWords,
  LOCATION_LABELS,
  pickLine,
  stablePick,
  type Bank,
  type HearthState,
  type Line,
  type LineContext,
  type MechanicsDelta,
  type NodeId,
  type PackKey,
  type RecentEvent,
  type TokenValues,
  type Verbosity,
} from './lineBanks';

export const NARR_LAST_PREFIX = 'narr.last.';
export const NARR_LAST_EVENT = 'narr.lastEvent';
export const NARR_LAST_EVENT_TURN = 'narr.lastEventTurn';

const RECENT_EVENTS: readonly RecentEvent[] = [
  'justArrived',
  'justFought',
  'justLost',
  'justTraded',
  'justRested',
  'justWaited',
];

/** FNV-1a over the joined parts. */
export function hashSeed(...parts: Array<string | number | null | undefined>): number {
  const s = parts.map((p) => (p == null ? '' : String(p))).join('|');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function packKeyFor(packId: string | null | undefined): PackKey | null {
  return packId === 'hearthlight' || packId === 'ash-ledger' ? packId : null;
}

/** Minimal state the voice reads (CampaignState satisfies it). */
export type VoiceSource = {
  campaignId: string;
  playstylePackId: string | null;
  locationId: string | null;
  session: { turn: number; rngSeed: number | null };
  storyBeats: readonly unknown[];
  flags: Record<string, CampaignFlagValue>;
  party: ReadonlyArray<{ name: string }>;
  combat: { hp: number | null; maxHp: number | null };
  quests: ReadonlyArray<{ id: string; status: string }>;
  /** For {weapon}: the equipped weapon (optional). */
  inventory?: { items: ReadonlyArray<{ name: string; equipped?: boolean; slot?: string | null }> };
};

const KETTLE_IDS = new Set(['interior.kettle-common', 'place.copper-kettle']);

export function hearthStateFrom(fuel: CampaignFlagValue | undefined): HearthState {
  const f = typeof fuel === 'number' ? fuel : 4;
  if (f >= 3) return 'bright';
  if (f >= 1) return 'low';
  return 'out';
}

/** recentEvent from the previous beat (narr.lastEvent), valid for one turn. */
export function recentEventFrom(
  flags: Record<string, CampaignFlagValue>,
  turn: number,
): RecentEvent | null {
  const ev = flags[NARR_LAST_EVENT];
  if (typeof ev !== 'string' || !RECENT_EVENTS.includes(ev as RecentEvent)) return null;
  const at = flags[NARR_LAST_EVENT_TURN];
  if (typeof at === 'number' && turn - at > 1) return null;
  return ev as RecentEvent;
}

export function lineContextFrom(src: VoiceSource, over: Partial<LineContext> = {}): LineContext {
  const hp = src.combat.hp;
  const max = src.combat.maxHp;
  const hpLow = hp != null && max != null && max > 0 ? hp / max <= 0.5 : false;
  return {
    pack: packKeyFor(src.playstylePackId) ?? 'hearthlight',
    hpLow,
    companions: src.party.length > 1,
    recentEvent: recentEventFrom(src.flags, src.session.turn),
    timeOfDay: null, // no clock yet: timeOfDay-tagged lines stay inert
    hearth:
      src.locationId && KETTLE_IDS.has(src.locationId)
        ? hearthStateFrom(src.flags['ambient.hearthFuel'])
        : null,
    activeQuestIds: src.quests.filter((q) => q.status === 'active').map((q) => q.id),
    doneQuestIds: src.quests.filter((q) => q.status === 'done').map((q) => q.id),
    has: { loot: false, goldLost: false, goldGained: false },
    ...over,
  };
}

export type VoiceInit = {
  ctx: LineContext;
  /** campaign.id | rngSeed | turn | storyBeats.length */
  seedBase: string;
  /** pathKey → last line id. */
  lastIds?: Record<string, string>;
  verbosity?: Verbosity;
  /** Tokens every line may use: {name}, {companions}, {place}, {weapon}. Call values win. */
  baseValues?: TokenValues;
};

export function lastIdsFromFlags(flags: Record<string, CampaignFlagValue> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(flags ?? {})) {
    if (k.startsWith(NARR_LAST_PREFIX) && typeof v === 'string') out[k.slice(NARR_LAST_PREFIX.length)] = v;
  }
  return out;
}

export function voiceInitFrom(
  src: VoiceSource,
  opts: { ctx?: Partial<LineContext>; verbosity?: Verbosity } = {},
): VoiceInit {
  return {
    ctx: lineContextFrom(src, opts.ctx),
    seedBase: [src.campaignId, src.session.rngSeed ?? '', src.session.turn, src.storyBeats.length].join('|'),
    lastIds: lastIdsFromFlags(src.flags),
    ...(opts.verbosity ? { verbosity: opts.verbosity } : {}),
    baseValues: baseValuesFrom(src),
  };
}

export function baseValuesFrom(src: VoiceSource): TokenValues {
  const out: TokenValues = { place: placeRefFor(src.locationId) };
  const pc = src.party[0]?.name?.trim();
  if (pc) out.name = shortName(pc);
  const comp = src.party.slice(1).map((p) => shortName(p.name)).filter(Boolean);
  if (comp.length) out.companions = companionsPhrase(comp);
  if (src.inventory) {
    const w = src.inventory.items.find((i) => i.equipped && (i.slot === 'weapon' || /sword|dagger|axe|mace|spear|staff|bow|hammer|club|knife/i.test(i.name)));
    out.weapon = weaponPhrase(w?.name ?? null);
  }
  return out;
}

export type SayOpts = {
  verbosity?: Verbosity;
  detail?: string | null;
  ctx?: Partial<LineContext>;
};

export class Voice {
  readonly ctx: LineContext;
  readonly verbosity: Verbosity;
  private readonly seedBase: string;
  private readonly lastIds: Record<string, string>;
  private readonly picked: Record<string, string> = {};
  private readonly counts: Record<string, number> = {};
  readonly baseValues: TokenValues;

  constructor(init: VoiceInit) {
    this.ctx = init.ctx;
    this.verbosity = init.verbosity ?? 'standard';
    this.seedBase = init.seedBase;
    this.lastIds = { ...(init.lastIds ?? {}) };
    this.baseValues = { ...(init.baseValues ?? {}) };
  }

  /** Seeded pick for one path; remembers the id for anti-repeat. */
  pick(pathKey: string, bank: Bank | undefined, ctxOver?: Partial<LineContext>): Line | null {
    if (!bank || bank.length === 0) return null;
    const ctx = ctxOver ? { ...this.ctx, ...ctxOver } : this.ctx;
    const n = this.counts[pathKey] ?? 0;
    this.counts[pathKey] = n + 1;
    const rng = createSeededRng(hashSeed(this.seedBase, pathKey, n));
    const line = pickLine(bank, ctx, this.lastIds[pathKey] ?? null, rng);
    if (line) {
      this.lastIds[pathKey] = line.id;
      this.picked[pathKey] = line.id;
    }
    return line;
  }

  /** Pick + compose. Falls back through `banks` in order (e.g. per-place, then generic). */
  say(pathKey: string, banks: Bank | ReadonlyArray<Bank | undefined>, values: TokenValues, opts: SayOpts = {}): string | null {
    const list: ReadonlyArray<Bank | undefined> = isBankList(banks) ? banks : [banks as Bank];
    const vals: TokenValues = { ...this.baseValues, ...values };
    const prevLast = this.lastIds[pathKey];
    for (const bank of list) {
      if (!bank) continue;
      // A line whose tokens can't be filled is skipped and another is picked.
      let pool: Bank = bank;
      while (pool.length > 0) {
        const line = this.pick(pathKey, pool, opts.ctx);
        if (!line) break;
        const text = composeLine(line, opts.verbosity ?? this.verbosity, vals, opts.detail);
        if (text) return text;
        pool = pool.filter((l) => l.id !== line.id);
        // restore the anti-repeat id so the retry still avoids last beat's line
        if (prevLast !== undefined) this.lastIds[pathKey] = prevLast;
        else delete this.lastIds[pathKey];
        delete this.picked[pathKey];
      }
    }
    return null;
  }

  /** Plain string pool (LOCATION_DETAILS / HEARTH_STATE / EQUIP_SWAP_PREFIX). */
  sayString(pathKey: string, pool: readonly string[] | undefined, values: TokenValues = {}): string | null {
    if (!pool || pool.length === 0) return null;
    const bank: Bank = pool.map((lead, i) => ({ id: `${pathKey}#${i}`, lead }));
    const line = this.pick(pathKey, bank);
    return line ? composeLine(line, 'short', values) : null;
  }

  /** `narr.last.*` patch for every path picked through this voice. */
  flags(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.picked)) out[`${NARR_LAST_PREFIX}${k}`] = v;
    return out;
  }
}

function isBankList(b: Bank | ReadonlyArray<Bank | undefined>): b is ReadonlyArray<Bank | undefined> {
  return Array.isArray(b) && (b.length === 0 || b[0] === undefined || Array.isArray(b[0]));
}

export function createVoice(init: VoiceInit): Voice {
  return new Voice(init);
}

export function voiceFor(src: VoiceSource, opts: { ctx?: Partial<LineContext>; verbosity?: Verbosity } = {}): Voice {
  return new Voice(voiceInitFrom(src, opts));
}

/** Event flags written in the same patch as the beat (drives recentEvent next beat). */
export function eventFlags(event: RecentEvent | null, turnAfterBeat: number): Record<string, CampaignFlagValue> {
  return { [NARR_LAST_EVENT]: event ?? '', [NARR_LAST_EVENT_TURN]: turnAfterBeat };
}

export function mechanicsLineFor(delta: MechanicsDelta | null | undefined): string | null {
  return delta ? formatMechanicsLine(delta) : null;
}

/* ───────────── token helpers ───────────── */

let starterGraph: MapGraph | null = null;
function graph(): MapGraph {
  if (!starterGraph) starterGraph = createStarterMap();
  return starterGraph;
}

/** "the common room", "Emberford" … (LOCATION_LABELS ref; map name fallback). */
export function placeRefFor(locationId: string | null | undefined, fallback = 'this place'): string {
  if (!locationId) return fallback;
  const label = LOCATION_LABELS[locationId as NodeId];
  if (label) return label.ref;
  const node = getMapNode(graph(), locationId);
  return node ? placeRef(node.name) : fallback;
}

export function placeNameFor(locationId: string | null | undefined): string | null {
  if (!locationId) return null;
  const label = LOCATION_LABELS[locationId as NodeId];
  if (label) return label.name;
  return getMapNode(graph(), locationId)?.name ?? null;
}

/** First word of a keeper / NPC full name: "Hollis the innkeeper" → "Hollis". */
export function shortName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

/** "the scarecrow husk" (object) / "The scarecrow husk" (subject). */
export function foeTokens(foeName: string | null | undefined): { foe: string; Foe: string } {
  if (!foeName || !foeName.trim()) return { foe: 'your foe', Foe: 'Your foe' };
  const lower = foeName.trim().toLowerCase();
  const foe = `the ${lower}`;
  return { foe, Foe: foe.charAt(0).toUpperCase() + foe.slice(1) };
}

/** "a scarecrow husk" / "an ash wolf". */
export function foeArticled(foeName: string): string {
  const lower = foeName.trim().toLowerCase();
  return `${/^[aeiou]/.test(lower) ? 'an' : 'a'} ${lower}`;
}

/** "your shortsword" / "your fists" (object position only). */
export function weaponPhrase(weaponName: string | null | undefined): string {
  const w = (weaponName ?? '').trim();
  return w ? `your ${w.toLowerCase()}` : 'your fists';
}

/** Item phrase for prose: lower-case name, no article ("trail rations"). */
export function itemWord(name: string): string {
  // "Hemp rope (50 ft)" → "hemp rope": no digits in prose.
  return name.replace(/\s*\([^)]*\)/g, '').replace(/\d+/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function companionsPhrase(names: readonly string[]): string {
  return listJoinWords(names.filter(Boolean));
}

export { stablePick, formatMechanicsLine };
export type { MechanicsDelta, LineContext, Verbosity, TokenValues, Bank, Line };

/* ───────────── RECORDS (chronicle notes / journal) and RENDERED tab copy ───────────── */

/** Who the record is for: picks are stable per campaign (stablePick) and pack-aware. */
export type RecordCtx = { campaignId: string; pack: PackKey | null };

export const DEFAULT_RECORD_CTX: RecordCtx = { campaignId: '', pack: null };

export function recordCtxFor(campaignId: string | null | undefined, packId: string | null | undefined): RecordCtx {
  return { campaignId: campaignId ?? '', pack: packKeyFor(packId) };
}

export function recordLineContext(rc: RecordCtx, over: Partial<LineContext> = {}): LineContext {
  return {
    pack: rc.pack ?? 'hearthlight',
    hpLow: false,
    companions: false,
    recentEvent: null,
    timeOfDay: null,
    hearth: null,
    activeQuestIds: [],
    doneQuestIds: [],
    has: { loot: false, goldLost: false, goldGained: false },
    ...over,
  };
}

/**
 * Stable pick + compose for a RECORD or RENDERED line. Same campaign + key → same text.
 * Returns null when nothing matches or a token is missing (caller falls back).
 */
export function recordLine(
  bank: Bank | undefined,
  rc: RecordCtx,
  key: string,
  values: TokenValues = {},
  over: Partial<LineContext> = {},
): string | null {
  if (!bank || bank.length === 0) return null;
  const line = stablePick(bank, recordLineContext(rc, over), rc.campaignId, key);
  return line ? composeLine(line, 'standard', values) : null;
}
