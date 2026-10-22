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
import { INTERIOR_FLOORS, QUEST_GIVERS, getNpcDef } from './npcs';
import { tryLoadPlaystylePack } from './pack';
import { progressionSummary } from './progression';
import { merchantForLocation } from './shop';
import type { MapNodeKind } from './map';
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

function listJoin(xs: string[]): string {
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/**
 * One short line built only from recorded events: titles, deeds, people
 * who know you. Empty chronicle → a neutral line, never made-up prose.
 */
export function storySoFar(state: CampaignState): string {
  const c = state.chronicle;
  const parts: string[] = [];
  if (c.titles.length) parts.push(`Known as ${listJoin(c.titles)}`);
  const victories = c.deeds.filter((d) => d.kind === 'victory');
  if (victories.length === 1) parts.push(victories[0]!.text);
  else if (victories.length > 1) parts.push(`Won ${victories.length} fights (last: ${victories[victories.length - 1]!.text.replace(/^Defeated /, '')})`);
  const quests = c.deeds.filter((d) => d.kind === 'quest');
  if (quests.length) parts.push(listJoin(quests.map((d) => d.text)));
  const level = [...c.deeds].reverse().find((d) => d.kind === 'level');
  if (level) parts.push(level.text);
  const known = Object.values(c.npcs).map((n) => n.name);
  if (known.length) parts.push(`Known to ${listJoin(known)}`);
  if (parts.length === 0) return 'Your story is just beginning.';
  return `${parts.join('. ')}.`;
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

export function selectMapTab(state: CampaignState): MapTab {
  const g = chronicleMap();
  const hereId = state.locationId;
  const here = hereId ? g.nodes[hereId] : undefined;
  const chain: MapChainLink[] = [];
  for (const n of mapChain(hereId)) {
    if (n.kind === 'interior' && INTERIOR_FLOORS[n.id]) {
      chain.push({ level: 'Floor', id: `${n.id}#floor`, name: INTERIOR_FLOORS[n.id]! });
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

export type GearOrigin = { line: string; lore: string | null };

const HOW_LABEL: Record<ItemOriginRecord['how'], string> = {
  starter: 'From your starting kit',
  bought: 'Bought',
  loot: 'Taken from',
  reward: 'Reward from',
  found: 'Found',
  carried: 'Already in your pack',
};

/** "Bought from Dagna Brightanvil at the Forge Floor" — facts only. */
export function itemOriginLine(rec: ItemOriginRecord | undefined): string | null {
  if (!rec) return null;
  const where = rec.locationId && mapNodeName(rec.locationId) ? ` at ${placePhrase(rec.locationId)}` : '';
  switch (rec.how) {
    case 'starter':
      return `${HOW_LABEL.starter}${where}`;
    case 'bought':
      return `Bought${rec.source ? ` from ${rec.source}` : ''}${where}`;
    case 'loot':
      return `Taken from ${rec.source ? `${/^[aeiou]/i.test(rec.source) ? 'an' : 'a'} ${rec.source.toLowerCase()}` : 'a fallen foe'}${where}`;
    case 'reward':
      return `Reward${rec.source ? ` from ${rec.source}` : ''}${where}`;
    case 'found':
      return `Found${where}`;
    case 'carried':
    default:
      return HOW_LABEL.carried;
  }
}

export function itemOrigin(chronicle: ChronicleState, itemId: string): GearOrigin {
  const rec = chronicle.items[itemId];
  return { line: itemOriginLine(rec) ?? HOW_LABEL.carried, lore: rec?.lore ?? null };
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
          : (leads[leads.length - 1]?.text ?? q.progressNotes ?? (trigger ? `Reach ${mapNodeName(trigger)}` : null)),
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
      relationship: n.notes.length ? n.notes[n.notes.length - 1]! : 'Met.',
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
