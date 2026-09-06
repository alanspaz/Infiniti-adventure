/**
 * CampaignState — single source of truth for PlayShell panels.
 * Persists via CampaignSave.world (+ existing party/session fields).
 */
import { deriveStats } from './derived';
import type { CampaignFlagValue, CampaignSave, SessionState, StoryBeatRecord } from './save';
import type { CharacterSheet, Party } from './types';

export type InventoryItem = {
  id: string;
  name: string;
  qty: number;
  kind?: 'gear' | 'consumable' | 'quest' | 'misc';
};

export type InventoryState = {
  gold: number;
  items: InventoryItem[];
};

/**
 * Quest journal status (Q-01).
 * `done` is canonical; legacy `complete` normalizes to `done`.
 */
export type QuestStatus = 'active' | 'done' | 'failed';

export type QuestRecord = {
  id: string;
  title: string;
  status: QuestStatus;
  /** Short objective blurb. */
  summary?: string;
  /** Optional progress notes (updated via updateQuest). */
  progressNotes?: string;
};

/** Stub starter quest for new campaigns (smoke / empty-journal fill). */
export const STARTER_QUEST: QuestRecord = {
  id: 'quest-first-steps',
  title: 'First steps',
  status: 'active',
  summary: 'Find your footing in Embervale and learn what the town needs.',
  progressNotes: 'Start at the Copper Kettle and ask around.',
};

export type CombatMode =
  | 'idle'
  | 'attack'
  | 'defend'
  | 'dodge'
  | 'cast'
  | 'use-item';

export type CombatState = {
  inCombat: boolean;
  /** Current HP; null until seeded from PC derived max. */
  hp: number | null;
  maxHp: number | null;
  mode: CombatMode;
  lastAction: string | null;
};

export type StoryMeta = {
  beatCount: number;
  lastPlaceLine: string | null;
  lastCheckLine: string | null;
};

/** Play-facing prefs mirrored into the store for panel reads (Settings edits stay in SettingsContext). */
export type CampaignPlayPrefs = {
  verbosity: 'short' | 'standard' | 'lush';
};

/** Durable world slice stored on CampaignSave (optional for older saves). */
export type CampaignWorldState = {
  inventory: InventoryState;
  quests: QuestRecord[];
  combat: CombatState;
  storyMeta: StoryMeta;
  playPrefs: CampaignPlayPrefs;
};

/** Unified read model for PlayShell — one store, no per-tab copies. */
export type CampaignState = {
  campaignId: string;
  title: string;
  playstylePackId: string | null;
  character: CharacterSheet | null;
  companions: CharacterSheet[];
  party: Party;
  inventory: InventoryState;
  quests: QuestRecord[];
  locationId: string | null;
  session: SessionState;
  combat: CombatState;
  playPrefs: CampaignPlayPrefs;
  storyBeats: StoryBeatRecord[];
  storyMeta: StoryMeta;
  flags: Record<string, CampaignFlagValue>;
  updatedAt: string;
};

/**
 * Structured world/session patches.
 *
 * Gold policy (I-01):
 * - Persisted `inventory.gold` is always clamped ≥ 0 on normalize/write.
 * - `grantGold` adds a non-negative amount.
 * - `spendGold` (and negative `addGold`) **reject** when the spend would
 *   go below 0 — gold is left unchanged (prefer reject over silent clamp).
 * - Direct `inventory.gold` writes still clamp ≥ 0 as a safety net.
 */
export type CampaignStatePatch = {
  locationId?: string | null;
  inventory?: Partial<InventoryState>;
  /** Add or stack an item by id. */
  addItem?: InventoryItem;
  /** Remove an item entirely by id. */
  removeItemId?: string;
  /**
   * Signed gold delta (legacy/story stub). Positive grants; negative spends
   * with reject-if-insufficient (same rules as spendGold).
   */
  addGold?: number;
  /** Grant gold (amount floored; negatives treated as 0). */
  grantGold?: number;
  /** Spend gold; rejected (no change) if amount > current gold. */
  spendGold?: number;
  /** Upsert quest by id (story stub / accept fallback). */
  upsertQuest?: QuestRecord;
  /** Accept a quest (status forced active). */
  acceptQuest?: Omit<QuestRecord, 'status'> & { status?: QuestStatus };
  /** Patch fields on an existing quest by id (progress notes, title, …). */
  updateQuest?: Partial<QuestRecord> & { id: string };
  /** Mark quest done. */
  completeQuestId?: string;
  /** Mark quest failed. */
  failQuestId?: string;
  combat?: Partial<CombatState>;
  storyMeta?: Partial<StoryMeta>;
  storyBeats?: StoryBeatRecord[];
  flags?: Record<string, CampaignFlagValue>;
  playPrefs?: Partial<CampaignPlayPrefs>;
  session?: Partial<SessionState>;
  /** Replace party (empty valid). */
  party?: Party;
  title?: string;
};

export const DEFAULT_PLAY_PREFS: CampaignPlayPrefs = {
  verbosity: 'standard',
};

export function createEmptyInventory(): InventoryState {
  return { gold: 0, items: [] };
}

export function createEmptyCombat(): CombatState {
  return {
    inCombat: false,
    hp: null,
    maxHp: null,
    mode: 'idle',
    lastAction: null,
  };
}

export function createEmptyStoryMeta(): StoryMeta {
  return {
    beatCount: 0,
    lastPlaceLine: null,
    lastCheckLine: null,
  };
}

export function createEmptyWorld(
  patch?: Partial<CampaignWorldState>,
): CampaignWorldState {
  return {
    inventory: normalizeInventory(patch?.inventory),
    quests: normalizeQuests(patch?.quests),
    combat: normalizeCombat(patch?.combat),
    storyMeta: normalizeStoryMeta(patch?.storyMeta),
    playPrefs: normalizePlayPrefs(patch?.playPrefs),
  };
}

function normalizeInventory(value: InventoryState | undefined): InventoryState {
  if (!value || typeof value !== 'object') return createEmptyInventory();
  const gold = Math.max(0, Math.floor(Number(value.gold) || 0));
  const items = Array.isArray(value.items)
    ? value.items
        .filter((it) => it && typeof it === 'object')
        .map((it) => ({
          id: String(it.id),
          name: String(it.name ?? 'Item'),
          qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
          ...(it.kind ? { kind: it.kind } : {}),
        }))
    : [];
  return { gold, items };
}

function normalizeQuestStatus(status: unknown): QuestStatus {
  if (status === 'done' || status === 'complete') return 'done';
  if (status === 'failed') return 'failed';
  return 'active';
}

function normalizeQuests(value: QuestRecord[] | undefined): QuestRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((q) => q && typeof q === 'object')
    .map((q) => ({
      id: String(q.id),
      title: String(q.title ?? 'Quest'),
      status: normalizeQuestStatus(q.status),
      ...(q.summary !== undefined ? { summary: String(q.summary) } : {}),
      ...(q.progressNotes !== undefined
        ? { progressNotes: String(q.progressNotes) }
        : {}),
    }));
}

/** Panel-safe quest list — never throws; empty is valid (Base44 anti-pattern). */
export function safeQuestList(
  value: QuestRecord[] | null | undefined,
): QuestRecord[] {
  try {
    return normalizeQuests(Array.isArray(value) ? value : []);
  } catch {
    return [];
  }
}

/** Partition quests for Quest tab (active + done; failed listed under done-ish Other). */
export function partitionQuests(value: QuestRecord[] | null | undefined): {
  active: QuestRecord[];
  done: QuestRecord[];
  failed: QuestRecord[];
} {
  const list = safeQuestList(value);
  return {
    active: list.filter((q) => q.status === 'active'),
    done: list.filter((q) => q.status === 'done'),
    failed: list.filter((q) => q.status === 'failed'),
  };
}

/** Panel-safe inventory — gold always ≥ 0. */
export function safeInventory(
  value: InventoryState | null | undefined,
): InventoryState {
  try {
    return normalizeInventory(value ?? undefined);
  } catch {
    return createEmptyInventory();
  }
}

function normalizeCombat(value: CombatState | undefined): CombatState {
  const base = createEmptyCombat();
  if (!value || typeof value !== 'object') return base;
  const modes: CombatMode[] = [
    'idle',
    'attack',
    'defend',
    'dodge',
    'cast',
    'use-item',
  ];
  return {
    inCombat: Boolean(value.inCombat),
    hp:
      value.hp === null || value.hp === undefined
        ? null
        : Math.max(0, Math.floor(Number(value.hp))),
    maxHp:
      value.maxHp === null || value.maxHp === undefined
        ? null
        : Math.max(0, Math.floor(Number(value.maxHp))),
    mode: modes.includes(value.mode as CombatMode)
      ? (value.mode as CombatMode)
      : 'idle',
    lastAction:
      value.lastAction === null || value.lastAction === undefined
        ? null
        : String(value.lastAction),
  };
}

function normalizeStoryMeta(value: StoryMeta | undefined): StoryMeta {
  if (!value || typeof value !== 'object') return createEmptyStoryMeta();
  return {
    beatCount: Math.max(0, Math.floor(Number(value.beatCount) || 0)),
    lastPlaceLine:
      value.lastPlaceLine == null ? null : String(value.lastPlaceLine),
    lastCheckLine:
      value.lastCheckLine == null ? null : String(value.lastCheckLine),
  };
}

function normalizePlayPrefs(
  value: CampaignPlayPrefs | undefined,
): CampaignPlayPrefs {
  const v = value?.verbosity;
  if (v === 'short' || v === 'standard' || v === 'lush') {
    return { verbosity: v };
  }
  return { ...DEFAULT_PLAY_PREFS };
}

/** True when unknown object looks like a world slice. */
export function isCampaignWorldState(value: unknown): value is CampaignWorldState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  if (o.inventory !== undefined) {
    if (!o.inventory || typeof o.inventory !== 'object') return false;
  }
  if (o.quests !== undefined && !Array.isArray(o.quests)) return false;
  if (o.combat !== undefined) {
    if (!o.combat || typeof o.combat !== 'object') return false;
  }
  return true;
}

export function normalizeWorld(
  value: CampaignWorldState | undefined | null,
): CampaignWorldState {
  if (!value) return createEmptyWorld();
  return createEmptyWorld(value);
}

/** Seed combat HP from PC derived max when missing. */
export function seedCombatFromParty(
  combat: CombatState,
  party: Party,
): CombatState {
  const pc = party.length > 0 ? party[0]! : null;
  if (!pc) return combat;
  const max = deriveStats(pc).maxHitPoints;
  const maxHp = combat.maxHp ?? max;
  const hp = combat.hp ?? maxHp;
  return {
    ...combat,
    maxHp,
    hp: Math.min(hp, maxHp),
  };
}

/** Build unified CampaignState from a CampaignSave. */
export function campaignToState(campaign: CampaignSave): CampaignState {
  const world = normalizeWorld(campaign.world);
  const combat = seedCombatFromParty(world.combat, campaign.party);
  const storyBeats = campaign.session.storyBeats ?? [];
  return {
    campaignId: campaign.id,
    title: campaign.title,
    playstylePackId: campaign.playstylePackId,
    character: campaign.party.length > 0 ? campaign.party[0]! : null,
    companions: campaign.party.slice(1),
    party: [...campaign.party],
    inventory: world.inventory,
    quests: world.quests,
    locationId: campaign.session.locationId,
    session: campaign.session,
    combat,
    playPrefs: world.playPrefs,
    storyBeats,
    storyMeta: {
      ...world.storyMeta,
      beatCount:
        world.storyMeta.beatCount > 0
          ? world.storyMeta.beatCount
          : storyBeats.length,
    },
    flags: { ...campaign.flags },
    updatedAt: campaign.updatedAt,
  };
}

function applyGoldDelta(
  gold: number,
  delta: number,
): { gold: number; rejected: boolean } {
  if (delta >= 0) {
    return { gold: gold + delta, rejected: false };
  }
  const spend = -delta;
  // I-01: prefer reject spend that would go negative (do not silent-clamp).
  if (spend > gold) {
    return { gold, rejected: true };
  }
  return { gold: gold - spend, rejected: false };
}

function applyInventoryPatch(
  inv: InventoryState,
  patch: CampaignStatePatch,
): InventoryState {
  // Safety net: clamp any direct gold write ≥ 0 (Base44 anti-pattern: gold -1).
  const rawGold =
    patch.inventory?.gold !== undefined ? patch.inventory.gold : inv.gold;
  let next: InventoryState = {
    gold: Math.max(0, Math.floor(Number(rawGold) || 0)),
    items: patch.inventory?.items ? [...patch.inventory.items] : [...inv.items],
  };

  if (typeof patch.grantGold === 'number') {
    const amount = Math.max(0, Math.floor(Number(patch.grantGold) || 0));
    next = { ...next, gold: next.gold + amount };
  }

  if (typeof patch.spendGold === 'number') {
    const amount = Math.max(0, Math.floor(Number(patch.spendGold) || 0));
    const res = applyGoldDelta(next.gold, -amount);
    next = { ...next, gold: res.gold };
  }

  if (typeof patch.addGold === 'number') {
    const delta = Math.floor(Number(patch.addGold) || 0);
    const res = applyGoldDelta(next.gold, delta);
    next = { ...next, gold: res.gold };
  }

  if (patch.addItem) {
    const item = {
      id: String(patch.addItem.id),
      name: String(patch.addItem.name),
      qty: Math.max(1, Math.floor(patch.addItem.qty || 1)),
      ...(patch.addItem.kind ? { kind: patch.addItem.kind } : {}),
    };
    const idx = next.items.findIndex((i) => i.id === item.id);
    if (idx >= 0) {
      const copy = [...next.items];
      const prev = copy[idx]!;
      copy[idx] = { ...prev, qty: prev.qty + item.qty, name: item.name };
      next = { ...next, items: copy };
    } else {
      next = { ...next, items: [...next.items, item] };
    }
  }
  if (patch.removeItemId) {
    next = {
      ...next,
      items: next.items.filter((i) => i.id !== patch.removeItemId),
    };
  }
  return normalizeInventory(next);
}

function applyQuestPatch(
  quests: QuestRecord[],
  patch: CampaignStatePatch,
): QuestRecord[] {
  let next = [...quests];

  if (patch.acceptQuest) {
    const raw = patch.acceptQuest;
    const q: QuestRecord = {
      id: String(raw.id),
      title: String(raw.title ?? 'Quest'),
      status: 'active',
      ...(raw.summary !== undefined ? { summary: String(raw.summary) } : {}),
      ...(raw.progressNotes !== undefined
        ? { progressNotes: String(raw.progressNotes) }
        : {}),
    };
    const idx = next.findIndex((x) => x.id === q.id);
    if (idx >= 0) next[idx] = { ...next[idx]!, ...q, status: 'active' };
    else next.push(q);
  }

  if (patch.upsertQuest) {
    const q = patch.upsertQuest;
    const idx = next.findIndex((x) => x.id === q.id);
    if (idx >= 0) next[idx] = { ...next[idx]!, ...q };
    else next.push({ ...q });
  }

  if (patch.updateQuest) {
    const { id, ...rest } = patch.updateQuest;
    const idx = next.findIndex((x) => x.id === id);
    if (idx >= 0) {
      next[idx] = {
        ...next[idx]!,
        ...rest,
        id,
        ...(rest.status !== undefined
          ? { status: normalizeQuestStatus(rest.status) }
          : {}),
      };
    }
  }

  if (patch.completeQuestId) {
    next = next.map((q) =>
      q.id === patch.completeQuestId ? { ...q, status: 'done' as const } : q,
    );
  }

  if (patch.failQuestId) {
    next = next.map((q) =>
      q.id === patch.failQuestId ? { ...q, status: 'failed' as const } : q,
    );
  }

  return normalizeQuests(next);
}

/**
 * Apply a structured patch onto a CampaignSave (immutable).
 * Party / session / world stay aligned — panels never keep local copies.
 */
export function applyCampaignPatch(
  campaign: CampaignSave,
  patch: CampaignStatePatch,
): CampaignSave {
  const world = normalizeWorld(campaign.world);
  const nextWorld: CampaignWorldState = {
    inventory: applyInventoryPatch(world.inventory, patch),
    quests: applyQuestPatch(world.quests, patch),
    combat: normalizeCombat({ ...world.combat, ...(patch.combat ?? {}) }),
    storyMeta: normalizeStoryMeta({
      ...world.storyMeta,
      ...(patch.storyMeta ?? {}),
    }),
    playPrefs: normalizePlayPrefs({
      ...world.playPrefs,
      ...(patch.playPrefs ?? {}),
    }),
  };

  let session = campaign.session;
  if (patch.session || patch.locationId !== undefined || patch.storyBeats) {
    session = {
      ...session,
      ...(patch.session ?? {}),
      ...(patch.locationId !== undefined
        ? { locationId: patch.locationId }
        : {}),
      ...(patch.storyBeats !== undefined
        ? { storyBeats: patch.storyBeats }
        : {}),
    };
  }

  const party = patch.party ? [...patch.party] : [...campaign.party];
  nextWorld.combat = seedCombatFromParty(nextWorld.combat, party);

  const now = new Date().toISOString();
  return {
    ...campaign,
    title: patch.title ?? campaign.title,
    party,
    session,
    flags: patch.flags
      ? { ...campaign.flags, ...patch.flags }
      : { ...campaign.flags },
    world: nextWorld,
    updatedAt: now,
  };
}

/**
 * Heuristic stub hooks from a story beat / player action.
 * Does not invent prose — only structured world patches.
 */
export function patchesFromSceneBeat(input: {
  playerAction?: string | null;
  travelToId?: string | null;
  checkLine?: string | null;
  checkSuccess?: boolean | null;
  placeLine?: string | null;
  storyBeats?: StoryBeatRecord[];
  /** Current quests — used to resolve complete/fail stubs. */
  quests?: QuestRecord[];
}): CampaignStatePatch {
  const patch: CampaignStatePatch = {};
  const action = (input.playerAction ?? '').trim();

  if (input.travelToId) {
    patch.locationId = input.travelToId;
  }

  const storyMeta: Partial<StoryMeta> = {};
  if (input.placeLine) storyMeta.lastPlaceLine = input.placeLine;
  if (input.checkLine) storyMeta.lastCheckLine = input.checkLine;
  if (input.storyBeats) {
    storyMeta.beatCount = input.storyBeats.length;
    patch.storyBeats = input.storyBeats;
  }
  if (Object.keys(storyMeta).length > 0) patch.storyMeta = storyMeta;

  // Stub item: "take/pick up/grab/loot <thing>"
  const take = action.match(
    /\b(?:take|pick\s*up|grab|loot|claim)\s+(?:the\s+|a\s+|an\s+)?(.+)$/i,
  );
  if (take?.[1]) {
    const name = take[1].replace(/[.!?\s]+$/g, '').trim().slice(0, 48);
    if (name.length >= 2) {
      const id = `item-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
      patch.addItem = { id, name, qty: 1, kind: 'gear' };
    }
  }

  // Stub gold grant: "find/gain N gold/coins"
  const gold = action.match(
    /\b(?:find|gain|earn|loot|collect)\s+(\d+)\s*(?:gold|coins?|gp)\b/i,
  );
  if (gold?.[1]) {
    patch.grantGold = Math.min(9999, parseInt(gold[1], 10) || 0);
  }

  // Stub gold spend: "spend/pay N gold"
  const spend = action.match(
    /\b(?:spend|pay|give)\s+(\d+)\s*(?:gold|coins?|gp)\b/i,
  );
  if (spend?.[1]) {
    patch.spendGold = Math.min(9999, parseInt(spend[1], 10) || 0);
  }

  // Stub quest accept
  const questAccept = action.match(
    /\b(?:accept|take\s+on|start)\s+(?:the\s+)?quest\b(?:\s*(?:to|for|:)\s*(.+))?$/i,
  );
  if (questAccept) {
    const title = (questAccept[1] ?? 'New quest').trim().slice(0, 64) || 'New quest';
    const id = `quest-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'new'}`;
    patch.acceptQuest = {
      id,
      title,
      summary: 'Noted from your actions.',
    };
  }

  // Stub quest progress: "update quest: …" / "note on quest: …"
  const questNote = action.match(
    /\b(?:update|note(?:\s+on)?)\s+(?:the\s+)?quest\b(?:\s*(?:to|for|:)\s*(.+))?$/i,
  );
  if (questNote) {
    const note = (questNote[1] ?? '').trim().slice(0, 120);
    const active = safeQuestList(input.quests).find((q) => q.status === 'active');
    if (active && note) {
      patch.updateQuest = { id: active.id, progressNotes: note };
    }
  }

  // Stub quest complete → first active
  if (/\b(?:complete|finish|done\s+with)\s+(?:the\s+)?quest\b/i.test(action)) {
    const active = safeQuestList(input.quests).find((q) => q.status === 'active');
    if (active) {
      patch.completeQuestId = active.id;
    } else {
      patch.flags = { ...(patch.flags ?? {}), last_quest_complete_attempt: true };
    }
  }

  if (input.checkSuccess === false) {
    patch.flags = {
      ...(patch.flags ?? {}),
      last_check_failed: true,
    };
  } else if (input.checkSuccess === true) {
    patch.flags = {
      ...(patch.flags ?? {}),
      last_check_failed: false,
    };
  }

  return patch;
}

/** Combat rail stub actions — write combat slice so panels stay consistent. */
export function combatActionPatch(
  mode: Exclude<CombatMode, 'idle'>,
  combat: CombatState,
): CampaignStatePatch {
  const maxHp = combat.maxHp ?? 10;
  let hp = combat.hp ?? maxHp;
  let lastAction: string = mode;
  let inCombat = true;

  switch (mode) {
    case 'attack':
      lastAction = 'Attack';
      break;
    case 'defend':
      lastAction = 'Defend';
      // Defend recovers 1 HP stub
      hp = Math.min(maxHp, hp + 1);
      break;
    case 'dodge':
      lastAction = 'Dodge';
      break;
    case 'cast':
      lastAction = 'Cast';
      hp = Math.max(0, hp - 1); // minor focus cost stub
      break;
    case 'use-item':
      lastAction = 'Use Item';
      hp = Math.min(maxHp, hp + 2);
      break;
    default:
      break;
  }

  return {
    combat: {
      inCombat,
      mode,
      hp,
      maxHp,
      lastAction,
    },
  };
}
