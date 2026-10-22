/**
 * TABS-01: read-only selectors for the ☰ info tabs. Every tab renders
 * straight from CampaignState through these (no local copies), so each
 * one updates the moment a patch lands.
 */
import {
  partitionQuests,
  questXpFor,
  QUEST_ARRIVAL_TRIGGERS,
  type CampaignState,
  type InventoryItem,
  type QuestRecord,
} from './campaignState';
import {
  chronicleMap,
  mapChain,
  mapNodeName,
  placePhrase,
  type ChronicleState,
  type ItemOriginRecord,
  type NpcRecord,
  type QuestJournalEntry,
} from './chronicle';
import { abilityModifier, deriveStats } from './derived';
import { equippedLoadout, itemTraits } from './items';
import { INTERIOR_FLOORS, QUEST_GIVERS, getNpcDef, NPCS } from './npcs';
import {
  CHAIN_LEVEL_LABELS,
  FLOOR_LABELS,
  ITEM_ORIGIN,
  STORY_SO_FAR,
  TAB_COPY,
  composeLine,
  listJoinWords,
  numberWord,
  type Bank,
  type TokenValues,
} from './narration/lineBanks';
import {
  foeArticled,
  placeRefFor,
  recordCtxFor,
  recordLineContext,
  stablePick,
  type RecordCtx,
} from './narration/voice';
import { questArrivalLead } from './chronicle';
import { tryLoadPlaystylePack } from './pack';
import { progressionSummary } from './progression';
import { merchantForLocation } from './shop';
import type { MapNodeKind } from './mapGraph';
import { ABILITY_KEYS, type AbilityKey, type CharacterSheet, type PartyRole } from './types';

/* ---------------- Character ---------------- */

export type ArmorClassBreakdown = {
  base: number;
  baseLabel: string;
  dex: number;
  shield: number;
  shieldLabel: string | null;
  stance: number;
  total: number;
};

export type CharacterTab = {
  name: string;
  packName: string;
  className: string;
  level: number;
  hp: number;
  maxHp: number;
  abilities: { key: AbilityKey; score: number; mod: number }[];
  xp: { xp: number; levelStart: number; next: number | null; pct: number; toNext: number | null; canLevelUp: boolean };
  ac: ArmorClassBreakdown;
  conditions: string[];
  storySoFar: string;
};

export function armorClassBreakdown(state: CampaignState): ArmorClassBreakdown | null {
  const pc = state.character;
  if (!pc) return null;
  const dex = abilityModifier(pc.abilities.dexterity);
  const { armor, shield } = equippedLoadout(state.inventory);
  const base = armor ? (itemTraits(armor).armorBase ?? 10) : 10;
  const shieldBonus = shield ? (itemTraits(shield).armorBase ?? 2) : 0;
  const stance = state.combat.inCombat ? Math.max(0, state.combat.tempAcBonus || 0) : 0;
  return {
    base,
    baseLabel: armor ? armor.name : 'Unarmored',
    dex,
    shield: shieldBonus,
    shieldLabel: shield ? shield.name : null,
    stance,
    total: base + dex + shieldBonus + stance,
  };
}

/** Plain facts about the PC's condition right now (never invented). */
export function characterConditions(state: CampaignState): string[] {
  const out: string[] = [];
  const hp = state.combat.hp ?? 0;
  const max = state.combat.maxHp ?? 0;
  if (state.character && max > 0) {
    if (hp <= 0) out.push('Down (0 HP)');
    else if (hp <= Math.floor(max / 2)) out.push('Bloodied (half HP or less)');
  }
  if (state.combat.inCombat) {
    out.push(state.combat.foe ? `In combat with ${state.combat.foe.name.toLowerCase()}` : 'In combat');
    if (state.combat.stance === 'defend') out.push('Defending');
    if (state.combat.stance === 'dodge') out.push('Dodging');
  }
  const prog = progressionSummary(state);
  if (prog.canLevelUp) out.push('Ready to level up');
  if (prog.unspentPoints > 0) out.push(`${prog.unspentPoints} ability point${prog.unspentPoints === 1 ? '' : 's'} to spend`);
  return out;
}

function rcFor(state: CampaignState): RecordCtx {
  return recordCtxFor(state.campaignId, state.playstylePackId);
}

/** RENDERED copy: stable per campaign + key (never the turn rng), so tabs don't flicker. */
function stableLine(rc: RecordCtx, bank: Bank, key: string, values: TokenValues): string | null {
  const ctx = recordLineContext(rc);
  const line = stablePick(bank, ctx, rc.campaignId, key);
  const text = line ? composeLine(line, 'short', values) : null;
  if (text) return text;
  // A tagged line can lack a token; fall back to the first line that composes.
  for (const l of bank) {
    if (l.when) continue;
    const t = composeLine(l, 'short', values);
    if (t) return t;
  }
  return null;
}

/**
 * NARR-04: "The tale so far", built from structured chronicle facts only
 * (titles, deeds with foeName/locationId/questTitle/level, people), never
 * by parsing deed text. Order: titles, then deeds by turn (victories and
 * quests interleaved by when they first happened), then level, then people.
 */
export function storySoFar(state: CampaignState): string {
  const c = state.chronicle;
  const rc = rcFor(state);
  const parts: string[] = [];
  if (c.titles.length) {
    const t = stableLine(rc, STORY_SO_FAR.titles, `titles:${c.titles.join('|')}`, { titles: listJoinWords(c.titles) });
    if (t) parts.push(t);
  }
  const timed: { turn: number; text: string }[] = [];
  const victories = c.deeds.filter((d) => d.kind === 'victory' && d.foeName);
  if (victories.length) {
    const last = victories[victories.length - 1]!;
    const values: TokenValues = {
      foeA: foeArticled(last.foeName!),
      where: placeRefFor(last.locationId, 'the wilds'),
      fightCount: numberWord(victories.length),
    };
    const t =
      victories.length === 1
        ? stableLine(rc, STORY_SO_FAR.victoryOne, `victoryOne:${last.turn}`, values)
        : stableLine(rc, STORY_SO_FAR.victoryMany, `victoryMany:${victories.length}`, values);
    if (t) timed.push({ turn: victories[0]!.turn, text: t });
  }
  const quests = c.deeds.filter((d) => d.kind === 'quest' && d.questTitle);
  if (quests.length) {
    const titles = quests.map((d) => `“${d.questTitle}”`);
    const t = stableLine(rc, STORY_SO_FAR.quests, `quests:${quests.length}`, { quests: listJoinWords(titles) });
    if (t) timed.push({ turn: quests[0]!.turn, text: t });
  }
  timed.sort((a, b) => a.turn - b.turn);
  parts.push(...timed.map((x) => x.text));
  const level = [...c.deeds].reverse().find((d) => d.kind === 'level' && d.level);
  if (level?.level) {
    const t = stableLine(rc, STORY_SO_FAR.level, `level:${level.level}`, { levelWord: numberWord(level.level, String(level.level)) });
    if (t) parts.push(t);
  }
  const known = Object.values(c.npcs)
    .sort((a, b) => a.firstMetTurn - b.firstMetTurn || a.name.localeCompare(b.name))
    .map((n) => n.name.split(/\s+/)[0] ?? n.name);
  if (known.length) {
    const t = stableLine(rc, known.length === 1 ? STORY_SO_FAR.knownOne : STORY_SO_FAR.knownMany, `known:${known.length}`, {
      people: listJoinWords(known),
    });
    if (t) parts.push(t);
  }
  if (parts.length === 0) return stableLine(rc, STORY_SO_FAR.empty, 'empty', {}) ?? 'Your story is just beginning.';
  return parts.join(' ');
}

export function selectCharacterTab(state: CampaignState): CharacterTab | null {
  const pc = state.character;
  if (!pc) return null;
  const derived = deriveStats(pc);
  const prog = progressionSummary(state);
  const span = prog.nextLevelXp === null ? 0 : prog.nextLevelXp - prog.currentLevelXp;
  const pct = span > 0 ? Math.max(0, Math.min(1, (prog.xp - prog.currentLevelXp) / span)) : 1;
  const pack = tryLoadPlaystylePack(state.playstylePackId);
  return {
    name: pc.name,
    packName: pack?.displayName ?? state.playstylePackId ?? 'No pack',
    className: pc.className,
    level: pc.level,
    hp: state.combat.hp ?? derived.maxHitPoints,
    maxHp: state.combat.maxHp ?? derived.maxHitPoints,
    abilities: ABILITY_KEYS.map((key) => ({ key, score: pc.abilities[key], mod: derived.modifiers[key] })),
    xp: {
      xp: prog.xp,
      levelStart: prog.currentLevelXp,
      next: prog.nextLevelXp,
      pct,
      toNext: prog.nextLevelXp === null ? null : Math.max(0, prog.nextLevelXp - prog.xp),
      canLevelUp: prog.canLevelUp,
    },
    ac: armorClassBreakdown(state)!,
    conditions: characterConditions(state),
    storySoFar: storySoFar(state),
  };
}

/* ---------------- Map ---------------- */

export type MapChainLink = { level: 'Region' | 'Town' | 'Area' | 'Building' | 'Floor' | 'Room'; id: string; name: string };

export type MapTabPlace = {
  id: string;
  name: string;
  kind: MapNodeKind | null;
  /** "Emberford › The Copper Kettle" — where it sits. */
  within: string | null;
  notes: string[];
  learnedFrom: string | null;
  visits: number;
  here: boolean;
};

export type MapTab = {
  hereId: string | null;
  hereName: string | null;
  description: string | null;
  chain: MapChainLink[];
  exits: { label: string; toName: string; known: boolean }[];
  visited: MapTabPlace[];
  known: MapTabPlace[];
};

const KIND_LEVEL: Record<MapNodeKind, MapChainLink['level']> = {
  region: 'Region',
  locale: 'Town',
  place: 'Building',
  interior: 'Room',
};

function levelFor(id: string, kind: MapNodeKind): MapChainLink['level'] {
  // Ashen Fields is a locale but not a town.
  if (kind === 'locale' && !/ford|town|ton$|burg|vill/i.test(mapNodeName(id) ?? '')) return 'Area';
  return KIND_LEVEL[kind];
}

/** Display label for a chain level ("Area" → "Open country"). */
export function chainLevelLabel(level: MapChainLink['level']): string {
  return CHAIN_LEVEL_LABELS[level] ?? level;
}

/** True when the interior's building has rooms on more than one floor. */
function multiFloor(interiorId: string): boolean {
  const g = chronicleMap();
  const parent = mapChain(interiorId).slice(-2, -1)[0];
  if (!parent) return false;
  const floors = new Set(
    Object.values(g.nodes)
      .filter((n) => n.kind === 'interior' && mapChain(n.id).slice(-2, -1)[0]?.id === parent.id)
      .map((n) => FLOOR_LABELS[n.id as keyof typeof FLOOR_LABELS] ?? INTERIOR_FLOORS[n.id] ?? ''),
  );
  return floors.size > 1;
}

export function selectMapTab(state: CampaignState): MapTab {
  const g = chronicleMap();
  const hereId = state.locationId;
  const here = hereId ? g.nodes[hereId] : undefined;
  const chain: MapChainLink[] = [];
  for (const n of mapChain(hereId)) {
    // NARR-04: floors only for buildings with more than one (the Kettle); FLOOR_LABELS copy.
    if (n.kind === 'interior' && INTERIOR_FLOORS[n.id] && multiFloor(n.id)) {
      const label = FLOOR_LABELS[n.id as keyof typeof FLOOR_LABELS] ?? INTERIOR_FLOORS[n.id]!;
      chain.push({ level: 'Floor', id: `${n.id}#floor`, name: label });
    }
    chain.push({ level: levelFor(n.id, n.kind), id: n.id, name: n.name });
  }
  const c = state.chronicle;
  const toPlace = (id: string): MapTabPlace => {
    const rec = c.places[id]!;
    const node = g.nodes[id];
    const parents = mapChain(id).slice(1, -1).map((n) => n.name);
    return {
      id,
      name: node?.name ?? id,
      kind: node?.kind ?? null,
      within: parents.length ? parents.join(' › ') : null,
      notes: rec.notes,
      learnedFrom: rec.learnedFrom,
      visits: rec.visits,
      here: id === hereId,
    };
  };
  const order = (id: string) => {
    const n = g.nodes[id];
    return `${mapChain(id).length}-${n?.name ?? id}`;
  };
  const ids = Object.keys(c.places).sort((a, b) => order(a).localeCompare(order(b)));
  return {
    hereId,
    hereName: here?.name ?? null,
    description: here?.description ?? null,
    chain,
    exits: (here?.exits ?? []).map((e) => ({
      label: e.label,
      toName: g.nodes[e.toNodeId]?.name ?? e.toNodeId,
      known: Boolean(c.places[e.toNodeId]),
    })),
    visited: ids.filter((id) => c.places[id]!.status === 'visited').map(toPlace),
    known: ids.filter((id) => c.places[id]!.status === 'known').map(toPlace),
  };
}

/* ---------------- Gear ---------------- */

export type GearOrigin = {
  line: string;
  lore: string | null;
  /** NARR-04: earlier acquisitions, newest first (history keeps the last three). */
  earlier: string[];
};

/** "Dagna Brightanvil" / "Hollis the innkeeper" → "Dagna" / "Hollis" (legacy saves stored the long form). */
function npcShortFromSource(source: string | null): string | null {
  if (!source) return null;
  const npc = NPCS.find((n) => source === n.name || source.startsWith(n.name.split(' ')[0]!));
  return npc ? (npc.name.split(' ')[0] ?? npc.name) : source.split(/\s+/)[0] ?? source;
}

function fill(t: string, values: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');
}

/** Gear origin line from ITEM_ORIGIN (facts only). */
export function originEntryLine(e: { how: ItemOriginRecord['how']; source: string | null; locationId: string | null }): string {
  const where = e.locationId && mapNodeName(e.locationId) ? placeRefFor(e.locationId) : null;
  switch (e.how) {
    case 'starter':
      return ITEM_ORIGIN.starter;
    case 'bought': {
      const npc = npcShortFromSource(e.source);
      return npc ? fill(ITEM_ORIGIN.bought, { npc }) : 'Bought';
    }
    case 'loot':
      return e.source && where ? fill(ITEM_ORIGIN.loot, { foeA: foeArticled(e.source), where }) : ITEM_ORIGIN.lootNoWhere;
    case 'reward': {
      const npc = npcShortFromSource(e.source);
      return npc ? fill(ITEM_ORIGIN.reward, { npc }) : 'A reward';
    }
    case 'found':
      return where ? fill(ITEM_ORIGIN.found, { where }) : ITEM_ORIGIN.foundNoWhere;
    case 'carried':
    default:
      return ITEM_ORIGIN.carried;
  }
}

export function itemOriginLine(rec: ItemOriginRecord | undefined): string | null {
  return rec ? originEntryLine(rec) : null;
}

export function itemOrigin(chronicle: ChronicleState, itemId: string): GearOrigin {
  const rec = chronicle.items[itemId];
  const earlier = rec ? rec.history.slice(0, -1).reverse().map(originEntryLine) : [];
  return { line: itemOriginLine(rec) ?? ITEM_ORIGIN.carried, lore: rec?.lore ?? null, earlier };
}

export type GearTab = {
  gold: number;
  slots: { slot: 'weapon' | 'armor' | 'shield'; label: string; item: InventoryItem | null; detail: string }[];
  pack: (InventoryItem & { origin: GearOrigin })[];
  equipped: (InventoryItem & { origin: GearOrigin })[];
  traderHere: string | null;
};

export function selectGearTab(state: CampaignState): GearTab {
  const lo = equippedLoadout(state.inventory);
  const withOrigin = (i: InventoryItem) => ({ ...i, origin: itemOrigin(state.chronicle, i.id) });
  return {
    gold: state.inventory.gold,
    slots: [
      { slot: 'weapon', label: 'Weapon', item: lo.weapon, detail: lo.weapon ? `${itemTraits(lo.weapon).damage ?? ''}`.trim() : 'Unarmed' },
      { slot: 'armor', label: 'Armor', item: lo.armor, detail: lo.armor ? `AC ${itemTraits(lo.armor).armorBase} + DEX` : 'None' },
      { slot: 'shield', label: 'Shield', item: lo.shield, detail: lo.shield ? `+${itemTraits(lo.shield).armorBase ?? 2} AC` : 'None' },
    ],
    equipped: state.inventory.items.filter((i) => i.equipped).map(withOrigin),
    pack: state.inventory.items.filter((i) => !i.equipped).map(withOrigin),
    traderHere: state.combat.inCombat ? null : (merchantForLocation(state.locationId ?? undefined)?.keeper ?? null),
  };
}

/* ---------------- Quests ---------------- */

export type QuestTabEntry = {
  quest: QuestRecord;
  giver: string | null;
  rewards: string[];
  nextLead: string | null;
  journal: QuestJournalEntry[];
};

export type QuestTab = { active: QuestTabEntry[]; done: QuestTabEntry[]; failed: QuestTabEntry[] };

export function questRewards(questId: string): string[] {
  const xp = questXpFor(questId);
  return xp > 0 ? [`${xp} XP`] : [];
}

export function selectQuestTab(state: CampaignState): QuestTab {
  const { active, done, failed } = partitionQuests(state.quests);
  const entry = (q: QuestRecord): QuestTabEntry => {
    const journal = state.chronicle.questJournal.filter((j) => j.questId === q.id);
    const leads = journal.filter((j) => j.kind === 'lead');
    const giverId = QUEST_GIVERS[q.id];
    const trigger = QUEST_ARRIVAL_TRIGGERS[q.id];
    return {
      quest: q,
      giver: giverId ? (getNpcDef(giverId)?.name ?? null) : null,
      rewards: questRewards(q.id),
      nextLead:
        q.status !== 'active'
          ? null
          : (leads[leads.length - 1]?.text ??
            q.progressNotes ??
            (trigger ? questArrivalLead(q.id, trigger, rcFor(state)) : null)),
      journal,
    };
  };
  return { active: active.map(entry), done: done.map(entry), failed: failed.map(entry) };
}

/* ---------------- Companions ---------------- */

/** C-01 lock: a party of 4 = you + 3 slots. Escorts are free, pets count ½. */
export const PARTY_SLOTS = 3;
export const PARTY_ROLE_WEIGHT: Record<PartyRole, number> = { companion: 1, escort: 0, pet: 0.5 };

export type CompanionsTab = {
  slotsUsed: number;
  slotsTotal: number;
  members: { member: CharacterSheet; role: PartyRole; weight: number }[];
  npcs: (NpcRecord & { lastSeenName: string | null; relationship: string })[];
};

export function partySlotsUsed(companions: CharacterSheet[]): number {
  return companions.reduce((sum, c) => sum + PARTY_ROLE_WEIGHT[c.partyRole ?? 'companion'], 0);
}

export function selectCompanionsTab(state: CampaignState): CompanionsTab {
  const npcs = Object.values(state.chronicle.npcs)
    .sort((a, b) => b.lastSeenTurn - a.lastSeenTurn || a.name.localeCompare(b.name))
    .map((n) => ({
      ...n,
      lastSeenName: n.lastSeenLocationId ? mapNodeName(n.lastSeenLocationId) : null,
      relationship: n.notes.length ? n.notes[n.notes.length - 1]! : TAB_COPY.companions.relationshipFallback,
    }));
  return {
    slotsUsed: partySlotsUsed(state.companions),
    slotsTotal: PARTY_SLOTS,
    members: state.companions.map((member) => {
      const role = member.partyRole ?? 'companion';
      return { member, role, weight: PARTY_ROLE_WEIGHT[role] };
    }),
    npcs,
  };
}
