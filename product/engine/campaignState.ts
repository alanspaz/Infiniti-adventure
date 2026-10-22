/**
 * CampaignState — single source of truth for PlayShell panels.
 * Persists via CampaignSave.world (+ existing party/session fields).
 */
import { normalizeFoe, spawnFoe, type FoeState } from './bestiary';
import {
  applyChroniclePatch,
  deriveChronicleEvents,
  normalizeChronicle,
  type ChronicleState,
  type ChroniclePatch,
  type ItemObtainedEvent,
} from './chronicle';
import { deriveStats } from './derived';
import type { CampaignFlagValue, CampaignSave, SessionState, StoryBeatRecord } from './save';
import type { CharacterSheet, Party } from './types';

export type ItemSlot = 'weapon' | 'armor' | 'shield';

/** Mechanical effect a consumable applies when used (P-INT-01). */
export type ItemEffect = { type: 'heal'; amount: number };

export type InventoryItem = {
  id: string;
  name: string;
  qty: number;
  kind?: 'gear' | 'consumable' | 'quest' | 'misc';
  /** Equip slot (weapon/armor/shield); inferred from name when absent. */
  slot?: ItemSlot;
  /** True while worn/wielded. One item per slot. */
  equipped?: boolean;
  /** Consumable effect; inferred for potions/salves when absent. */
  effect?: ItemEffect;
  /** Armor: base AC (e.g. leather 11 → 11 + DEX). Shield: AC bonus. */
  armorBase?: number;
  /** Weapon damage dice label (display only until COMBAT-02). */
  damage?: string;
  /** Short inspect blurb. */
  description?: string;
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
  /**
   * True while a fight is active (COMBAT-01 `combat.active` equivalent).
   * CombatRail is hidden unless this is true.
   */
  inCombat: boolean;
  /** Current HP; null until seeded from PC derived max. */
  hp: number | null;
  maxHp: number | null;
  mode: CombatMode;
  lastAction: string | null;
  /** Temporary AC from Defend/Dodge stance — not HP. */
  tempAcBonus: number;
  /** Foe HP mirror (kept equal to foe.hp / foe.maxHp for older readers). */
  foeHp: number | null;
  foeMaxHp: number | null;
  /** COMBAT-02: the current opponent's stat block (null out of combat). */
  foe: FoeState | null;
  /** Player stance until their next action: defend = +2 AC, dodge = foe disadvantage. */
  stance: 'none' | 'defend' | 'dodge';
  /** Rounds elapsed in this fight. */
  round: number;
};

/** COMBAT-01: treat inCombat as the active flag. */
export function isCombatActive(
  combat: CombatState | null | undefined,
): boolean {
  return Boolean(combat?.inCombat);
}

export type StoryMeta = {
  beatCount: number;
  lastPlaceLine: string | null;
  lastCheckLine: string | null;
};

/** Play-facing prefs mirrored into the store for panel reads (Settings edits stay in SettingsContext). */
export type CampaignPlayPrefs = {
  verbosity: 'short' | 'standard' | 'lush';
};

/**
 * P-INT-03 progression for the active PC (party[0]).
 * Level itself lives on the CharacterSheet; XP + unspent points live here.
 */
export type ProgressionState = {
  /** Lifetime XP (never negative). */
  xp: number;
  /** Ability points earned from level-ups, not yet spent. */
  unspentPoints: number;
  /** QA-01 P1-5: quest ids whose completion XP was already paid (once per id). */
  rewardedQuestIds: string[];
};

/** XP granted when a quest moves active → done (any path). */
export const QUEST_COMPLETE_XP = 100;

export function createEmptyProgression(): ProgressionState {
  return { xp: 0, unspentPoints: 0, rewardedQuestIds: [] };
}

export function normalizeProgression(
  value: Partial<ProgressionState> | undefined | null,
): ProgressionState {
  if (!value || typeof value !== 'object') return createEmptyProgression();
  return {
    xp: Math.max(0, Math.floor(Number(value.xp) || 0)),
    unspentPoints: Math.max(0, Math.floor(Number(value.unspentPoints) || 0)),
    rewardedQuestIds: Array.isArray(value.rewardedQuestIds)
      ? [...new Set(value.rewardedQuestIds.filter((x): x is string => typeof x === 'string'))]
      : [],
  };
}

/**
 * QA-01 P1-5: quests that pay XP on completion (defined sources only).
 * Player-noted quests from the Tale ("accept the quest to …") pay nothing.
 */
export const QUEST_XP: Record<string, number> = {
  'quest-first-steps': 100,
};

/** Scripted quest completions: quest id → location that completes it on arrival. */
export const QUEST_ARRIVAL_TRIGGERS: Record<string, string> = {
  // "Find your footing in Embervale…" — done once you step out into Emberford.
  'quest-first-steps': 'locale.emberford',
};

export function questXpFor(id: string): number {
  return QUEST_XP[id] ?? 0;
}

/** P-INT-04: one merchant's persisted purse + stock (seeded from tables on first trade). */
export type MerchantState = {
  gold: number;
  stock: InventoryItem[];
  /** QA-01: session.turn when gold was last written (purse restocks from here). */
  asOfTurn?: number;
};

/** P-INT-04: which merchant's shop is open (null = closed). */
export type ShopState = {
  activeMerchantId: string | null;
  /** Location where the shop was opened; moving elsewhere closes it on read. */
  atLocationId: string | null;
};

function normalizeMerchants(
  value: Record<string, MerchantState> | undefined | null,
): Record<string, MerchantState> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, MerchantState> = {};
  for (const [id, m] of Object.entries(value)) {
    if (!m || typeof m !== 'object') continue;
    out[String(id)] = {
      gold: Math.max(0, Math.floor(Number(m.gold) || 0)),
      ...(Number.isFinite(Number(m.asOfTurn)) && m.asOfTurn !== undefined
        ? { asOfTurn: Math.max(0, Math.floor(Number(m.asOfTurn))) }
        : {}),
      stock: Array.isArray(m.stock)
        ? m.stock
            .filter((it) => it && typeof it === 'object')
            .map((it) => {
              const { equipped: _e, ...rest } = normalizeInventoryItem(it);
              return rest;
            })
        : [],
    };
  }
  return out;
}

function normalizeShop(value: ShopState | undefined | null): ShopState {
  const id = value?.activeMerchantId;
  const at = value?.atLocationId;
  const active = typeof id === 'string' && id ? id : null;
  return {
    activeMerchantId: active,
    atLocationId: active && typeof at === 'string' && at ? at : null,
  };
}

/** Durable world slice stored on CampaignSave (optional for older saves). */
export type CampaignWorldState = {
  inventory: InventoryState;
  quests: QuestRecord[];
  combat: CombatState;
  storyMeta: StoryMeta;
  playPrefs: CampaignPlayPrefs;
  progression: ProgressionState;
  merchants: Record<string, MerchantState>;
  shop: ShopState;
  /** TABS-01: what the story has recorded (people, places, item origins, journal). */
  chronicle: ChronicleState;
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
  progression: ProgressionState;
  merchants: Record<string, MerchantState>;
  shop: ShopState;
  chronicle: ChronicleState;
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
export type CampaignStatePatch = ChroniclePatch & {
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
  /**
   * P-INT-03: grant XP to the active PC (floored; negatives ignored).
   * Does not level up by itself — the player levels up from Character.
   */
  grantXp?: number;
  /** Direct progression write (used by level-up / point spend rules). */
  progression?: Partial<ProgressionState>;
  /** P-INT-04: upsert merchant purse/stock by merchant id. */
  merchants?: Record<string, MerchantState>;
  /** P-INT-04: open/close a shop. Location change closes it unless set. */
  shop?: Partial<ShopState>;
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
    tempAcBonus: 0,
    foeHp: null,
    foeMaxHp: null,
    foe: null,
    stance: 'none',
    round: 0,
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
    progression: normalizeProgression(patch?.progression),
    merchants: normalizeMerchants(patch?.merchants),
    shop: normalizeShop(patch?.shop),
    chronicle: normalizeChronicle(patch?.chronicle),
  };
}

function normalizeInventory(value: InventoryState | undefined): InventoryState {
  if (!value || typeof value !== 'object') return createEmptyInventory();
  const gold = Math.max(0, Math.floor(Number(value.gold) || 0));
  const items = Array.isArray(value.items)
    ? value.items
        .filter((it) => it && typeof it === 'object')
        .map((it) => normalizeInventoryItem(it))
    : [];
  return { gold, items };
}

const ITEM_KINDS = ['gear', 'consumable', 'quest', 'misc'] as const;
const ITEM_SLOTS: ItemSlot[] = ['weapon', 'armor', 'shield'];

/** Normalize one inventory row; keeps optional P-INT-01 fields when valid. */
export function normalizeInventoryItem(it: InventoryItem): InventoryItem {
  const out: InventoryItem = {
    id: String(it.id),
    name: String(it.name ?? 'Item'),
    qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
  };
  if (it.kind && (ITEM_KINDS as readonly string[]).includes(it.kind)) {
    out.kind = it.kind;
  }
  if (it.slot && ITEM_SLOTS.includes(it.slot)) out.slot = it.slot;
  if (it.equipped === true) out.equipped = true;
  if (
    it.effect &&
    typeof it.effect === 'object' &&
    it.effect.type === 'heal' &&
    Number(it.effect.amount) > 0
  ) {
    out.effect = { type: 'heal', amount: Math.floor(Number(it.effect.amount)) };
  }
  if (it.armorBase !== undefined && Number.isFinite(Number(it.armorBase))) {
    out.armorBase = Math.max(0, Math.floor(Number(it.armorBase)));
  }
  if (typeof it.damage === 'string' && it.damage.trim()) {
    out.damage = it.damage.trim();
  }
  if (typeof it.description === 'string' && it.description.trim()) {
    out.description = it.description.trim();
  }
  return out;
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
  const foeMax =
    value.foeMaxHp === null || value.foeMaxHp === undefined
      ? null
      : Math.max(0, Math.floor(Number(value.foeMaxHp)));
  const foeHpRaw =
    value.foeHp === null || value.foeHp === undefined
      ? null
      : Math.max(0, Math.floor(Number(value.foeHp)));
  const inCombat = Boolean(value.inCombat);
  let foe = inCombat ? normalizeFoe((value as CombatState).foe) : null;
  // Legacy in-combat saves (pre COMBAT-02) had only foeHp — synthesize a foe.
  if (inCombat && !foe) {
    const legacy = spawnFoe(null);
    const max = foeMax ?? legacy.maxHp;
    foe = { ...legacy, maxHp: max, hp: Math.min(max, foeHpRaw ?? max) };
  }
  const stanceRaw = (value as CombatState).stance;
  const stance: CombatState['stance'] =
    inCombat && (stanceRaw === 'defend' || stanceRaw === 'dodge') ? stanceRaw : 'none';
  return {
    inCombat,
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
    tempAcBonus: Math.max(
      0,
      Math.floor(Number((value as CombatState).tempAcBonus) || 0),
    ),
    foeHp: foe ? foe.hp : null,
    foeMaxHp: foe ? foe.maxHp : null,
    foe,
    stance,
    round: inCombat ? Math.max(0, Math.floor(Number((value as CombatState).round) || 0)) : 0,
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
  // QA-01 P0-1: max HP always comes from the character sheet (via progression),
  // never from a stored combat value. This also repairs saves that a stray
  // combat entry capped at 10: the stored max is recomputed on load/patch.
  const maxHp = deriveStats(pc).maxHitPoints;
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
    progression: world.progression,
    merchants: world.merchants,
    // Shop only counts as open where it was opened (travel closes it).
    shop:
      world.shop.activeMerchantId &&
      world.shop.atLocationId === (campaign.session.locationId ?? null)
        ? world.shop
        : { activeMerchantId: null, atLocationId: null },
    chronicle: world.chronicle,
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
    const item = normalizeInventoryItem({ ...patch.addItem, equipped: false });
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
  patchIn: CampaignStatePatch,
): CampaignSave {
  let patch = patchIn;
  const world = normalizeWorld(campaign.world);
  // QA-01 P1-5: scripted arrival triggers (the only non-engine quest completion).
  const arriveAt =
    patch.locationId !== undefined ? patch.locationId : campaign.session.locationId ?? null;
  if (!patch.completeQuestId && arriveAt) {
    const trigger = world.quests.find(
      (q) => q.status === 'active' && QUEST_ARRIVAL_TRIGGERS[q.id] === arriveAt,
    );
    if (trigger) patch = { ...patch, completeQuestId: trigger.id };
  }
  const nextQuests = applyQuestPatch(world.quests, patch);
  const baseProg = normalizeProgression({
    ...world.progression,
    ...(patch.progression ?? {}),
  });
  // P-INT-03 / QA-01 P1-5: quests newly completed (active → done) grant their
  // table XP once per quest id, ever (persisted in rewardedQuestIds).
  const rewarded = new Set(baseProg.rewardedQuestIds);
  let questXp = 0;
  for (const q of nextQuests) {
    if (
      q.status === 'done' &&
      world.quests.some((p) => p.id === q.id && p.status === 'active') &&
      questXpFor(q.id) > 0 &&
      !rewarded.has(q.id)
    ) {
      rewarded.add(q.id);
      questXp += questXpFor(q.id);
    }
  }
  const xpGain = Math.max(0, Math.floor(Number(patch.grantXp) || 0)) + questXp;
  const nextWorld: CampaignWorldState = {
    inventory: applyInventoryPatch(world.inventory, patch),
    quests: nextQuests,
    combat: normalizeCombat({ ...world.combat, ...(patch.combat ?? {}) }),
    storyMeta: normalizeStoryMeta({
      ...world.storyMeta,
      ...(patch.storyMeta ?? {}),
    }),
    playPrefs: normalizePlayPrefs({
      ...world.playPrefs,
      ...(patch.playPrefs ?? {}),
    }),
    progression: { ...baseProg, xp: baseProg.xp + xpGain, rewardedQuestIds: [...rewarded] },
    merchants: normalizeMerchants({
      ...world.merchants,
      ...(patch.merchants ?? {}),
    }),
    shop: normalizeShop(patch.shop ? { ...world.shop, ...patch.shop } : world.shop),
    chronicle: world.chronicle,
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
  // QA-01: the shop closes for good when you leave its room or a fight starts
  // (so it never auto-reopens when you walk back in).
  if (
    nextWorld.shop.activeMerchantId &&
    (nextWorld.shop.atLocationId !== (session.locationId ?? null) || nextWorld.combat.inCombat)
  ) {
    nextWorld.shop = { activeMerchantId: null, atLocationId: null };
  }

  nextWorld.chronicle = advanceChronicle(campaign, world, nextWorld, session, party, patch);

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
 * TABS-01: explicit chronicle events from the patch, then the automatic
 * hooks (arrival, quest lifecycle, level-up, unexplained new items).
 */
function advanceChronicle(
  campaign: CampaignSave,
  world: CampaignWorldState,
  nextWorld: CampaignWorldState,
  session: SessionState,
  party: Party,
  patch: CampaignStatePatch,
): ChronicleState {
  const turn = Math.max(0, Math.floor(Number(session.turn) || 0));
  let chronicle = applyChroniclePatch(world.chronicle, patch, turn);
  const explained = (
    patch.itemObtained === undefined
      ? []
      : Array.isArray(patch.itemObtained)
        ? patch.itemObtained
        : [patch.itemObtained]
  ).map((e: ItemObtainedEvent) => e.itemId);
  const derived = deriveChronicleEvents(chronicle, {
    prevLocationId: campaign.session.locationId ?? null,
    nextLocationId: session.locationId ?? null,
    prevQuests: world.quests,
    nextQuests: nextWorld.quests,
    prevLevel: campaign.party[0]?.level ?? null,
    nextLevel: party[0]?.level ?? null,
    pcName: party[0]?.name ?? null,
    prevItemIds: world.inventory.items.map((i) => i.id),
    nextItems: nextWorld.inventory.items,
    explainedItemIds: explained,
    questXp: questXpFor,
    arrivalTrigger: (id) => QUEST_ARRIVAL_TRIGGERS[id] ?? null,
  });
  for (const p of derived) chronicle = applyChroniclePatch(chronicle, p, turn);
  return chronicle;
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
  /** Current location (COMBAT-02 foe table). */
  locationId?: string | null;
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

  // QA-01 P1-4: typed text never creates items or gold. Loot comes only from
  // defined sources (combat loot tables, scripted finds); tests use the
  // grantGold / addItem patches directly (non-player path).

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
    let id = `quest-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'new'}`;
    // Never collide with (or revive) a rewarded, scripted quest.
    if (questXpFor(id) > 0) id = `${id}-note`;
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

  // Stub quest complete → first active *player-noted* quest (QA-01 P1-5:
  // rewarded quests complete only through their scripted triggers).
  if (/\b(?:complete|finish|done\s+with)\s+(?:the\s+)?quest\b/i.test(action)) {
    const active = safeQuestList(input.quests).find(
      (q) => q.status === 'active' && questXpFor(q.id) === 0,
    );
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

  // QA-01 P0-1: the narrator stub never starts or ends a fight. Combat entry
  // goes only through applyCombatIntent (real state, location foe table, and
  // the not-a-fight idiom list); exit only through the combat loop.

  return patch;
}

/**
 * Deliberate violence (COMBAT-02 narrowed: no bare "hit", so "hit the road"
 * doesn't start a fight).
 */
const FIGHT_ENTER_RE =
  /\b(?:attack|strike|fight|swing\s+at|stab|slash|shoot|punch|kick|engage|cast\s+(?:at|on)|look\s+for\s+(?:trouble|a\s+fight)|hunt|ambush)\b/i;
const FIGHT_EXIT_RE =
  /\b(?:flee|retreat|end\s+(?:the\s+)?(?:fight|combat)|spare(?:\s+them)?|surrender|combat\s+ends|fight\s+(?:ends|over)|stand\s+down)\b/i;

/** Idioms that use fight words without meaning violence (QA-01 P0-1 / P1-6). */
export const NOT_A_FIGHT_RE =
  /\b(?:strike\s+(?:a\s+|up\s+a\s+)?(?:deal|bargain|match|conversation|chord|pose)|hunt\s+(?:for|down|around)\s+(?:clues?|information|answers|work|a\s+room|rumou?rs?|food|herbs)|hunting|fight\s+(?:the\s+|off\s+the\s+)?(?:urge|sleep|tears|cold|yawn|temptation)|(?:the\s+|an?\s+)?attacks?\s+on\s+the\b|shoot\s+the\s+breeze|kick\s+(?:back|off|up\s+my\s+feet)|strike\s+out\b|kick\s+the\s+habit)/i;

export function detectCombatEnterFromAction(action: string): boolean {
  const t = action.trim();
  return FIGHT_ENTER_RE.test(t) && !NOT_A_FIGHT_RE.test(t);
}

export function detectCombatExitFromAction(action: string): boolean {
  return FIGHT_EXIT_RE.test(action.trim());
}

/** Start a fight: seeds HP and spawns a foe for the location (if none yet). */
export function enterCombatPatch(
  combat: CombatState | undefined,
  reason = 'Combat begins',
  locationId: string | null = null,
  foeRoll = 0,
): CampaignStatePatch {
  const base = normalizeCombat(combat);
  // QA-01 P0-1: entry never touches player hp/maxHp (those come from the sheet).
  const foe = base.inCombat && base.foe ? base.foe : spawnFoe(locationId, foeRoll);
  return {
    combat: {
      inCombat: true,
      mode: 'idle',
      lastAction: reason,
      tempAcBonus: 0,
      foe,
      foeHp: foe.hp,
      foeMaxHp: foe.maxHp,
      stance: 'none',
      round: base.inCombat ? base.round : 0,
    },
  };
}

export function exitCombatPatch(
  _combat: CombatState | undefined,
  reason = 'Combat ends',
): CampaignStatePatch {
  return {
    combat: {
      inCombat: false,
      // QA-01 P1-3: exit leaves player hp alone (no reseed-to-full on null).
      mode: 'idle',
      lastAction: reason,
      tempAcBonus: 0,
      foeHp: null,
      foeMaxHp: null,
      foe: null,
      stance: 'none',
      round: 0,
    },
  };
}
