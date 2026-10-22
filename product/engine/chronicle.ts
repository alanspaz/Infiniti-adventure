/**
 * TABS-01: the campaign chronicle — what the story has actually recorded
 * (people met, places visited / heard of, where items came from, quest
 * journal beats, deeds). Info tabs read it through selectors (tabs.ts);
 * nothing here invents prose: every note is either world data that was
 * shown to the player (map descriptions, NPC lines) or a fact from a
 * state change (bought X, defeated Y, quest done).
 *
 * Writes arrive as typed CampaignStatePatch fields (npcMet, placeLearned,
 * placeVisited, itemObtained, itemLore, questBeat, deed, grantTitle) plus
 * the automatic hooks in deriveChronicleEvents (travel, quest changes,
 * level-ups, items appearing) that applyCampaignPatch runs for every path.
 */
import { createStarterMap, placeRef, type MapGraph, type MapNode } from './map';
import { getNpcDef, npcsAt, QUEST_GIVERS } from './npcs';

export type NpcRecord = {
  id: string;
  name: string;
  role: string | null;
  firstMetTurn: number;
  lastSeenLocationId: string | null;
  lastSeenTurn: number;
  /** Relationship notes from events, oldest first (capped). */
  notes: string[];
};

export type PlaceRecord = {
  id: string;
  status: 'known' | 'visited';
  /** Who told you about it (known places). */
  learnedFrom: string | null;
  notes: string[];
  firstVisitTurn: number | null;
  visits: number;
};

export type ItemObtainHow = 'starter' | 'bought' | 'loot' | 'reward' | 'found' | 'carried';

export type ItemOriginRecord = {
  itemId: string;
  name: string;
  how: ItemObtainHow;
  /** Seller / foe / quest giver, when there is one. */
  source: string | null;
  locationId: string | null;
  turn: number;
  /** Lore learned by inspecting it. */
  lore: string | null;
};

export type QuestBeatKind = 'given' | 'known' | 'lead' | 'done' | 'failed';

export type QuestJournalEntry = {
  questId: string;
  turn: number;
  kind: QuestBeatKind;
  text: string;
};

export type DeedKind = 'victory' | 'quest' | 'level' | 'title';

export type DeedRecord = { turn: number; kind: DeedKind; text: string };

export type ChronicleState = {
  npcs: Record<string, NpcRecord>;
  places: Record<string, PlaceRecord>;
  items: Record<string, ItemOriginRecord>;
  questJournal: QuestJournalEntry[];
  deeds: DeedRecord[];
  titles: string[];
};

/* ---------- patch payloads (CampaignStatePatch fields) ---------- */

export type NpcMetEvent = {
  id: string;
  name?: string;
  role?: string | null;
  locationId?: string | null;
  note?: string;
};
export type PlaceEvent = { id: string; note?: string; from?: string | null };
export type ItemObtainedEvent = {
  itemId: string;
  name: string;
  how: ItemObtainHow;
  source?: string | null;
  locationId?: string | null;
};
export type ItemLoreEvent = { itemId: string; text: string };
export type QuestBeatEvent = { questId: string; kind: QuestBeatKind; text: string };
export type DeedEvent = { kind: DeedKind; text: string };

export type ChroniclePatch = {
  npcMet?: NpcMetEvent | NpcMetEvent[];
  placeLearned?: PlaceEvent | PlaceEvent[];
  placeVisited?: PlaceEvent | PlaceEvent[];
  itemObtained?: ItemObtainedEvent | ItemObtainedEvent[];
  itemLore?: ItemLoreEvent | ItemLoreEvent[];
  questBeat?: QuestBeatEvent | QuestBeatEvent[];
  deed?: DeedEvent | DeedEvent[];
  grantTitle?: string;
};

export const MAX_NOTES = 6;
export const MAX_QUEST_ENTRIES = 12;
export const MAX_DEEDS = 40;

export function createEmptyChronicle(): ChronicleState {
  return { npcs: {}, places: {}, items: {}, questJournal: [], deeds: [], titles: [] };
}

const arr = <T,>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v: unknown, d = 0): number => (Number.isFinite(Number(v)) ? Math.max(0, Math.floor(Number(v))) : d);
const notesOf = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map(str).filter((x): x is string => !!x))].slice(-MAX_NOTES) : [];
const HOWS: ItemObtainHow[] = ['starter', 'bought', 'loot', 'reward', 'found', 'carried'];
const BEATS: QuestBeatKind[] = ['given', 'known', 'lead', 'done', 'failed'];
const DEEDS: DeedKind[] = ['victory', 'quest', 'level', 'title'];

function isObj(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** Old saves (no chronicle) and junk both normalize to a valid chronicle. */
export function normalizeChronicle(value: unknown): ChronicleState {
  if (!isObj(value)) return createEmptyChronicle();
  const out = createEmptyChronicle();
  if (isObj(value.npcs)) {
    for (const [id, n] of Object.entries(value.npcs)) {
      if (!isObj(n)) continue;
      out.npcs[id] = {
        id,
        name: str(n.name) ?? id,
        role: str(n.role),
        firstMetTurn: int(n.firstMetTurn),
        lastSeenLocationId: str(n.lastSeenLocationId),
        lastSeenTurn: int(n.lastSeenTurn),
        notes: notesOf(n.notes),
      };
    }
  }
  if (isObj(value.places)) {
    for (const [id, p] of Object.entries(value.places)) {
      if (!isObj(p)) continue;
      const visited = p.status === 'visited';
      out.places[id] = {
        id,
        status: visited ? 'visited' : 'known',
        learnedFrom: str(p.learnedFrom),
        notes: notesOf(p.notes),
        firstVisitTurn: visited ? int(p.firstVisitTurn) : null,
        visits: visited ? Math.max(1, int(p.visits, 1)) : 0,
      };
    }
  }
  if (isObj(value.items)) {
    for (const [id, it] of Object.entries(value.items)) {
      if (!isObj(it)) continue;
      out.items[id] = {
        itemId: id,
        name: str(it.name) ?? id,
        how: HOWS.includes(it.how as ItemObtainHow) ? (it.how as ItemObtainHow) : 'found',
        source: str(it.source),
        locationId: str(it.locationId),
        turn: int(it.turn),
        lore: str(it.lore),
      };
    }
  }
  if (Array.isArray(value.questJournal)) {
    out.questJournal = value.questJournal
      .filter(isObj)
      .filter((e) => str(e.questId) && str(e.text) && BEATS.includes(e.kind as QuestBeatKind))
      .map((e) => ({ questId: str(e.questId)!, turn: int(e.turn), kind: e.kind as QuestBeatKind, text: str(e.text)! }));
  }
  if (Array.isArray(value.deeds)) {
    out.deeds = value.deeds
      .filter(isObj)
      .filter((d) => str(d.text) && DEEDS.includes(d.kind as DeedKind))
      .map((d) => ({ turn: int(d.turn), kind: d.kind as DeedKind, text: str(d.text)! }))
      .slice(-MAX_DEEDS);
  }
  if (Array.isArray(value.titles)) {
    out.titles = [...new Set(value.titles.map(str).filter((x): x is string => !!x))];
  }
  return out;
}

/* ---------- reducer ---------- */

function addNote(notes: string[], note: string | null | undefined): string[] {
  const n = str(note);
  if (!n || notes.includes(n)) return notes;
  return [...notes, n].slice(-MAX_NOTES);
}

/** Apply explicit chronicle events (immutable). */
export function applyChroniclePatch(chronicle: ChronicleState, patch: ChroniclePatch, turn: number): ChronicleState {
  const c: ChronicleState = {
    npcs: { ...chronicle.npcs },
    places: { ...chronicle.places },
    items: { ...chronicle.items },
    questJournal: [...chronicle.questJournal],
    deeds: [...chronicle.deeds],
    titles: [...chronicle.titles],
  };
  for (const e of arr(patch.placeVisited)) {
    if (!str(e?.id)) continue;
    const prev = c.places[e.id];
    c.places[e.id] = {
      id: e.id,
      status: 'visited',
      learnedFrom: prev?.learnedFrom ?? null,
      notes: addNote(prev?.notes ?? [], e.note),
      firstVisitTurn: prev?.status === 'visited' ? prev.firstVisitTurn : turn,
      visits: (prev?.status === 'visited' ? prev.visits : 0) + 1,
    };
  }
  for (const e of arr(patch.placeLearned)) {
    if (!str(e?.id)) continue;
    const prev = c.places[e.id];
    c.places[e.id] = prev
      ? { ...prev, learnedFrom: prev.learnedFrom ?? str(e.from), notes: addNote(prev.notes, e.note) }
      : { id: e.id, status: 'known', learnedFrom: str(e.from), notes: addNote([], e.note), firstVisitTurn: null, visits: 0 };
  }
  for (const e of arr(patch.npcMet)) {
    if (!str(e?.id)) continue;
    const def = getNpcDef(e.id);
    const prev = c.npcs[e.id];
    c.npcs[e.id] = {
      id: e.id,
      name: str(e.name) ?? prev?.name ?? def?.name ?? e.id,
      role: str(e.role) ?? prev?.role ?? def?.role ?? null,
      firstMetTurn: prev?.firstMetTurn ?? turn,
      lastSeenLocationId:
        e.locationId !== undefined ? str(e.locationId) : (prev?.lastSeenLocationId ?? null),
      lastSeenTurn: turn,
      notes: addNote(prev?.notes ?? [], e.note),
    };
  }
  for (const e of arr(patch.itemObtained)) {
    if (!str(e?.itemId)) continue;
    const prev = c.items[e.itemId];
    c.items[e.itemId] = {
      itemId: e.itemId,
      name: str(e.name) ?? prev?.name ?? e.itemId,
      how: HOWS.includes(e.how) ? e.how : 'found',
      source: str(e.source) ?? null,
      locationId: e.locationId !== undefined ? str(e.locationId) : null,
      turn,
      lore: prev?.lore ?? null,
    };
  }
  for (const e of arr(patch.itemLore)) {
    const text = str(e?.text);
    if (!str(e?.itemId) || !text) continue;
    const prev = c.items[e.itemId];
    c.items[e.itemId] = prev
      ? { ...prev, lore: text }
      : { itemId: e.itemId, name: e.itemId, how: 'carried', source: null, locationId: null, turn, lore: text };
  }
  for (const e of arr(patch.questBeat)) {
    const text = str(e?.text);
    if (!str(e?.questId) || !text || !BEATS.includes(e.kind)) continue;
    if (c.questJournal.some((j) => j.questId === e.questId && j.kind === e.kind && j.text === text)) continue;
    c.questJournal.push({ questId: e.questId, turn, kind: e.kind, text });
    const mine = c.questJournal.filter((j) => j.questId === e.questId);
    if (mine.length > MAX_QUEST_ENTRIES) {
      const drop = mine.find((j) => j.kind === 'lead' || j.kind === 'known');
      if (drop) c.questJournal.splice(c.questJournal.indexOf(drop), 1);
    }
  }
  for (const e of arr(patch.deed)) {
    const text = str(e?.text);
    if (!text || !DEEDS.includes(e.kind)) continue;
    c.deeds = [...c.deeds, { turn, kind: e.kind, text }].slice(-MAX_DEEDS);
  }
  const title = str(patch.grantTitle);
  if (title && !c.titles.includes(title)) {
    c.titles.push(title);
    c.deeds = [...c.deeds, { turn, kind: 'title' as const, text: `Became known as ${title}` }].slice(-MAX_DEEDS);
  }
  return c;
}

/* ---------- automatic hooks (every engine path goes through applyCampaignPatch) ---------- */

let starterMap: MapGraph | null = null;
/** The world map the chronicle resolves names against (starter map today). */
export function chronicleMap(): MapGraph {
  return (starterMap ??= createStarterMap());
}

export function mapNodeName(id: string | null | undefined): string | null {
  if (!id) return null;
  return chronicleMap().nodes[id]?.name ?? null;
}

/** Node + its ancestors, root first. */
export function mapChain(id: string | null | undefined): MapNode[] {
  const out: MapNode[] = [];
  const g = chronicleMap();
  let cur = id ? g.nodes[id] : undefined;
  let guard = 0;
  while (cur && guard++ < 16) {
    out.unshift(cur);
    cur = cur.parentId ? g.nodes[cur.parentId] : undefined;
  }
  return out;
}

/** "the Inn Cellar" / "Emberford" for notes (same rule as map.ts placeRef). */
export function placePhrase(id: string | null | undefined): string {
  const name = mapNodeName(id);
  return name ? placeRef(name) : 'somewhere unmapped';
}

/** Arriving somewhere: visit it (+ its parents), meet who is there, hear what they mention. */
export function arrivalEvents(chronicle: ChronicleState, locationId: string): ChroniclePatch {
  const chain = mapChain(locationId);
  if (chain.length === 0) return {};
  const placeVisited: PlaceEvent[] = chain.map((n) => {
    const known = chronicle.places[n.id];
    // The description is what the narrator shows on arrival; noted once.
    return known?.status === 'visited' ? { id: n.id } : { id: n.id, note: n.description };
  });
  const npcMet: NpcMetEvent[] = [];
  const placeLearned: PlaceEvent[] = [];
  for (const npc of npcsAt(locationId)) {
    const met = chronicle.npcs[npc.id];
    npcMet.push({
      id: npc.id,
      name: npc.name,
      role: npc.role,
      locationId,
      ...(met ? {} : { note: `First met at ${placePhrase(locationId)}.` }),
    });
    for (const m of npc.mentions) placeLearned.push({ id: m.placeId, note: m.note, from: npc.name });
  }
  return { placeVisited, npcMet, placeLearned };
}

export function recordArrival(chronicle: ChronicleState, locationId: string, turn: number): ChronicleState {
  return applyChroniclePatch(chronicle, arrivalEvents(chronicle, locationId), turn);
}

export type ChronicleDiffInput = {
  prevLocationId: string | null;
  nextLocationId: string | null;
  prevQuests: { id: string; title: string; status: string; summary?: string; progressNotes?: string }[];
  nextQuests: { id: string; title: string; status: string; summary?: string; progressNotes?: string }[];
  prevLevel: number | null;
  nextLevel: number | null;
  pcName: string | null;
  prevItemIds: string[];
  nextItems: { id: string; name: string }[];
  /** Item ids the patch already explains (explicit itemObtained). */
  explainedItemIds: string[];
  questXp: (id: string) => number;
  arrivalTrigger: (id: string) => string | null;
};

/** State-diff hooks: travel, quest lifecycle, level-ups, items appearing. */
export function deriveChronicleEvents(chronicle: ChronicleState, d: ChronicleDiffInput): ChroniclePatch[] {
  const out: ChroniclePatch[] = [];
  if (d.nextLocationId && (d.nextLocationId !== d.prevLocationId || chronicle.places[d.nextLocationId]?.status !== 'visited')) {
    out.push(arrivalEvents(chronicle, d.nextLocationId));
  }
  const questBeat: QuestBeatEvent[] = [];
  const deed: DeedEvent[] = [];
  for (const q of d.nextQuests) {
    const before = d.prevQuests.find((p) => p.id === q.id);
    if (!before || (before.status !== 'active' && q.status === 'active')) {
      questBeat.push(...questOpeningBeats(q, d.arrivalTrigger));
    }
    if (before && q.progressNotes && q.progressNotes !== before.progressNotes) {
      questBeat.push({ questId: q.id, kind: 'lead', text: q.progressNotes });
    }
    if (q.status === 'done' && before?.status === 'active') {
      const xp = d.questXp(q.id);
      const where = d.nextLocationId ? ` at ${placePhrase(d.nextLocationId)}` : '';
      questBeat.push({ questId: q.id, kind: 'done', text: `Completed${where}${xp > 0 ? ` — ${xp} XP` : ''}.` });
      deed.push({ kind: 'quest', text: `Completed “${q.title}”` });
    }
    if (q.status === 'failed' && before?.status === 'active') {
      questBeat.push({ questId: q.id, kind: 'failed', text: 'The trail went cold — quest failed.' });
    }
  }
  if (d.prevLevel !== null && d.nextLevel !== null && d.nextLevel > d.prevLevel) {
    deed.push({ kind: 'level', text: `Reached level ${d.nextLevel}` });
  }
  if (questBeat.length || deed.length) out.push({ questBeat, deed });
  const prevIds = new Set(d.prevItemIds);
  const explained = new Set(d.explainedItemIds);
  const found = d.nextItems.filter((i) => !prevIds.has(i.id) && !explained.has(i.id) && !chronicle.items[i.id]);
  if (found.length) {
    out.push({
      itemObtained: found.map((i) => ({ itemId: i.id, name: i.name, how: 'found' as const, locationId: d.nextLocationId })),
    });
  }
  return out;
}

/** Journal lines a quest opens with: giver, what's known, first lead. */
export function questOpeningBeats(
  q: { id: string; summary?: string; progressNotes?: string },
  arrivalTrigger: (id: string) => string | null = () => null,
): QuestBeatEvent[] {
  const out: QuestBeatEvent[] = [];
  const giver = QUEST_GIVERS[q.id] ? getNpcDef(QUEST_GIVERS[q.id]!) : null;
  out.push({
    questId: q.id,
    kind: 'given',
    text: giver ? `Given by ${giver.name} (${giver.role}).` : 'Taken up on your own word in the Tale.',
  });
  if (q.summary) out.push({ questId: q.id, kind: 'known', text: q.summary });
  if (q.progressNotes) out.push({ questId: q.id, kind: 'lead', text: q.progressNotes });
  const trigger = arrivalTrigger(q.id);
  const where = mapNodeName(trigger);
  if (where) out.push({ questId: q.id, kind: 'lead', text: `Reach ${where} to see it through.` });
  return out;
}

/**
 * Save migration v1 → v2: v1 saves have no chronicle. Backfill only from
 * facts the save already holds (where you are, what you carry, your quests);
 * nothing is invented.
 */
export function backfillChronicle(input: {
  locationId: string | null;
  turn: number;
  items: { id: string; name: string }[];
  quests: { id: string; title: string; status: string; summary?: string; progressNotes?: string }[];
  arrivalTrigger?: (id: string) => string | null;
}): ChronicleState {
  let c = createEmptyChronicle();
  const turn = Math.max(0, Math.floor(input.turn || 0));
  if (input.locationId) c = applyChroniclePatch(c, arrivalEvents(c, input.locationId), turn);
  c = applyChroniclePatch(
    c,
    {
      itemObtained: input.items.map((i) => ({ itemId: i.id, name: i.name, how: 'carried' as const, source: null, locationId: null })),
      questBeat: input.quests.flatMap((q) => [
        ...questOpeningBeats(q, input.arrivalTrigger),
        ...(q.status === 'done' ? [{ questId: q.id, kind: 'done' as const, text: 'Completed.' }] : []),
        ...(q.status === 'failed' ? [{ questId: q.id, kind: 'failed' as const, text: 'Quest failed.' }] : []),
      ]),
      deed: input.quests
        .filter((q) => q.status === 'done')
        .map((q) => ({ kind: 'quest' as const, text: `Completed “${q.title}”` })),
    },
    turn,
  );
  return c;
}
