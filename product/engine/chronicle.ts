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
import { createStarterMap, type MapGraph, type MapNode } from './mapGraph';
import { getNpcDef, npcsAt, QUEST_GIVERS } from './npcs';
import {
  FIRST_STEPS_JOURNAL,
  NPC_FIRST_MET,
  NPC_MENTIONS,
  QUEST_JOURNAL,
  type NodeId,
  type NpcId,
} from './narration/lineBanks';
import { DEFAULT_RECORD_CTX, placeRefFor, recordLine, type RecordCtx } from './narration/voice';

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
  /** NARR-04: fights won here (drives "wonThere" lines). Missing on older saves → 0. */
  victories?: number;
};

export type ItemObtainHow = 'starter' | 'bought' | 'loot' | 'reward' | 'found' | 'carried';

/** One acquisition of an item (newest last in ItemOriginRecord.history). */
export type ItemOriginEntry = {
  how: ItemObtainHow;
  source: string | null;
  locationId: string | null;
  turn: number;
};

/** Acquisition history kept per item (CoS follow-up to TABS-01). */
export const MAX_ITEM_HISTORY = 3;

export type ItemOriginRecord = {
  itemId: string;
  name: string;
  /** Latest acquisition (same as the last history entry). */
  how: ItemObtainHow;
  /** Seller / foe / quest giver, when there is one. */
  source: string | null;
  locationId: string | null;
  turn: number;
  /** Lore learned by inspecting it. */
  lore: string | null;
  /**
   * The last MAX_ITEM_HISTORY acquisitions, oldest first. Saves from before this
   * field migrate to a one-entry history built from the record itself.
   */
  history: ItemOriginEntry[];
};

export type QuestBeatKind = 'given' | 'known' | 'lead' | 'done' | 'failed';

export type QuestJournalEntry = {
  questId: string;
  turn: number;
  kind: QuestBeatKind;
  text: string;
};

export type DeedKind = 'victory' | 'quest' | 'level' | 'title';

/** Structured facts behind a deed, so the tabs never parse the text. */
export type DeedFacts = {
  foeName?: string;
  locationId?: string;
  questTitle?: string;
  questId?: string;
  level?: number;
};

export type DeedRecord = { turn: number; kind: DeedKind; text: string } & DeedFacts;

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
export type PlaceEvent = { id: string; note?: string; from?: string | null; victory?: boolean };
export type ItemObtainedEvent = {
  itemId: string;
  name: string;
  how: ItemObtainHow;
  source?: string | null;
  locationId?: string | null;
};
export type ItemLoreEvent = { itemId: string; text: string };
export type QuestBeatEvent = { questId: string; kind: QuestBeatKind; text: string };
export type DeedEvent = { kind: DeedKind; text: string } & DeedFacts;

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
        ...(int(p.victories) > 0 ? { victories: int(p.victories) } : {}),
      };
    }
  }
  if (isObj(value.items)) {
    for (const [id, it] of Object.entries(value.items)) {
      if (!isObj(it)) continue;
      const latest: ItemOriginEntry = {
        how: HOWS.includes(it.how as ItemObtainHow) ? (it.how as ItemObtainHow) : 'found',
        source: str(it.source),
        locationId: str(it.locationId),
        turn: int(it.turn),
      };
      // Migration: records saved before history existed get a one-entry history.
      const history = Array.isArray(it.history)
        ? it.history.filter(isObj).map(
            (h): ItemOriginEntry => ({
              how: HOWS.includes(h.how as ItemObtainHow) ? (h.how as ItemObtainHow) : 'found',
              source: str(h.source),
              locationId: str(h.locationId),
              turn: int(h.turn),
            }),
          )
        : [];
      out.items[id] = {
        itemId: id,
        name: str(it.name) ?? id,
        ...latest,
        lore: str(it.lore),
        history: (history.length ? history : [latest]).slice(-MAX_ITEM_HISTORY),
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
      .map((d) => ({ turn: int(d.turn), kind: d.kind as DeedKind, text: str(d.text)!, ...deedFacts(d) }))
      .slice(-MAX_DEEDS);
  }
  if (Array.isArray(value.titles)) {
    out.titles = [...new Set(value.titles.map(str).filter((x): x is string => !!x))];
  }
  return out;
}

function deedFacts(d: Record<string, unknown> | DeedFacts): DeedFacts {
  const r = d as Record<string, unknown>;
  const out: DeedFacts = {};
  const foe = str(r.foeName);
  const loc = str(r.locationId);
  const qt = str(r.questTitle);
  const qid = str(r.questId);
  if (foe) out.foeName = foe;
  if (loc) out.locationId = loc;
  if (qt) out.questTitle = qt;
  if (qid) out.questId = qid;
  if (Number.isFinite(Number(r.level)) && Number(r.level) > 0) out.level = Math.floor(Number(r.level));
  // NARR-04 migration: TABS-01 deeds were text-only. Recover the facts once, here.
  const text = str(r.text) ?? '';
  if (r.kind === 'victory' && !out.foeName) {
    const m = text.match(/^Defeated an? (.+?)(?: in (.+))?$/i);
    if (m) {
      out.foeName = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1);
      const id = m[2] ? nodeIdByName(m[2]) : null;
      if (id && !out.locationId) out.locationId = id;
    }
  }
  if (r.kind === 'quest' && !out.questTitle) {
    const m = text.match(/^Completed\s+[“"](.+?)[”"]/);
    if (m) out.questTitle = m[1]!;
  }
  if (r.kind === 'level' && !out.level) {
    const m = text.match(/level (\d+)/i);
    if (m) out.level = Number(m[1]);
  }
  return out;
}

/** Legacy deed text → node id ("Ashen Fields" / "the Ashen Fields"). */
function nodeIdByName(name: string): string | null {
  const want = name.replace(/^the\s+/i, '').trim().toLowerCase();
  const g = createStarterMap();
  for (const n of Object.values(g.nodes)) if (n.name.toLowerCase() === want) return n.id;
  return null;
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
      ...(prev?.victories ? { victories: prev.victories } : {}),
    };
  }
  for (const e of arr(patch.placeLearned)) {
    if (!str(e?.id)) continue;
    const prev = c.places[e.id];
    const base: PlaceRecord = prev
      ? { ...prev, learnedFrom: prev.learnedFrom ?? str(e.from), notes: addNote(prev.notes, e.note) }
      : { id: e.id, status: 'known', learnedFrom: str(e.from), notes: addNote([], e.note), firstVisitTurn: null, visits: 0 };
    c.places[e.id] = e.victory ? { ...base, victories: (base.victories ?? 0) + 1 } : base;
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
    const entry: ItemOriginEntry = {
      how: HOWS.includes(e.how) ? e.how : 'found',
      source: str(e.source) ?? null,
      locationId: e.locationId !== undefined ? str(e.locationId) : null,
      turn,
    };
    c.items[e.itemId] = {
      itemId: e.itemId,
      name: str(e.name) ?? prev?.name ?? e.itemId,
      ...entry,
      lore: prev?.lore ?? null,
      history: [...(prev?.history ?? []), entry].slice(-MAX_ITEM_HISTORY),
    };
  }
  for (const e of arr(patch.itemLore)) {
    const text = str(e?.text);
    if (!str(e?.itemId) || !text) continue;
    const prev = c.items[e.itemId];
    c.items[e.itemId] = prev
      ? { ...prev, lore: text }
      : {
          itemId: e.itemId,
          name: e.itemId,
          how: 'carried',
          source: null,
          locationId: null,
          turn,
          lore: text,
          history: [{ how: 'carried', source: null, locationId: null, turn }],
        };
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
    c.deeds = [...c.deeds, { turn, kind: e.kind, text, ...deedFacts(e) }].slice(-MAX_DEEDS);
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

/** "the Ashen Fields" / "Emberford" / "the common room" (LOCATION_LABELS ref). */
export function placePhrase(id: string | null | undefined): string {
  return placeRefFor(id, 'somewhere unmapped');
}

/** Arriving somewhere: visit it (+ its parents), meet who is there, hear what they mention. */
export function arrivalEvents(
  chronicle: ChronicleState,
  locationId: string,
  rc: RecordCtx = DEFAULT_RECORD_CTX,
): ChroniclePatch {
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
    const where = placePhrase(locationId);
    const firstMet = met
      ? null
      : (recordLine(NPC_FIRST_MET[npc.id as NpcId], rc, `met:${npc.id}`, { where }) ?? `First met at ${where}.`);
    npcMet.push({
      id: npc.id,
      name: npc.name,
      role: npc.role,
      locationId,
      ...(firstMet ? { note: firstMet } : {}),
    });
    // A mention is written once: only for places the chronicle has never recorded.
    for (const m of npc.mentions) {
      if (chronicle.places[m.placeId]) continue;
      const note =
        recordLine(NPC_MENTIONS[npc.id as NpcId]?.[m.placeId as NodeId]?.note, rc, `mention:${npc.id}:${m.placeId}`) ??
        m.note;
      placeLearned.push({ id: m.placeId, note, from: npc.name });
    }
  }
  return { placeVisited, npcMet, placeLearned };
}

export function recordArrival(
  chronicle: ChronicleState,
  locationId: string,
  turn: number,
  rc: RecordCtx = DEFAULT_RECORD_CTX,
): ChronicleState {
  return applyChroniclePatch(chronicle, arrivalEvents(chronicle, locationId, rc), turn);
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
  /** Campaign + pack for record picks. */
  record?: RecordCtx;
};

const FIRST_STEPS_ID = 'quest-first-steps';

/** State-diff hooks: travel, quest lifecycle, level-ups, items appearing. */
export function deriveChronicleEvents(chronicle: ChronicleState, d: ChronicleDiffInput): ChroniclePatch[] {
  const out: ChroniclePatch[] = [];
  const rc = d.record ?? DEFAULT_RECORD_CTX;
  if (d.nextLocationId && (d.nextLocationId !== d.prevLocationId || chronicle.places[d.nextLocationId]?.status !== 'visited')) {
    out.push(arrivalEvents(chronicle, d.nextLocationId, rc));
  }
  const questBeat: QuestBeatEvent[] = [];
  const deed: DeedEvent[] = [];
  for (const q of d.nextQuests) {
    const before = d.prevQuests.find((p) => p.id === q.id);
    if (!before || (before.status !== 'active' && q.status === 'active')) {
      questBeat.push(...questOpeningBeats(q, d.arrivalTrigger, rc));
    }
    if (before && q.progressNotes && q.progressNotes !== before.progressNotes) {
      questBeat.push({ questId: q.id, kind: 'lead', text: q.progressNotes });
    }
    if (q.status === 'done' && before?.status === 'active') {
      // XP stays on the quest card's Earned row; the journal text has no numbers.
      const where = placePhrase(d.nextLocationId);
      const bank = q.id === FIRST_STEPS_ID ? FIRST_STEPS_JOURNAL.journalDone : QUEST_JOURNAL.done;
      const text =
        recordLine(bank, rc, `done:${q.id}`, { where }) ??
        recordLine(QUEST_JOURNAL.backfillDone, rc, `done:${q.id}`) ??
        'Done.';
      questBeat.push({ questId: q.id, kind: 'done', text });
      deed.push({
        kind: 'quest',
        text: `Completed “${q.title}”`,
        questTitle: q.title,
        questId: q.id,
        ...(d.nextLocationId ? { locationId: d.nextLocationId } : {}),
      });
    }
    if (q.status === 'failed' && before?.status === 'active') {
      questBeat.push({
        questId: q.id,
        kind: 'failed',
        text: recordLine(QUEST_JOURNAL.failed, rc, `failed:${q.id}`) ?? 'The trail went cold.',
      });
    }
  }
  if (d.prevLevel !== null && d.nextLevel !== null && d.nextLevel > d.prevLevel) {
    deed.push({ kind: 'level', text: `Reached level ${d.nextLevel}`, level: d.nextLevel });
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
  rc: RecordCtx = DEFAULT_RECORD_CTX,
): QuestBeatEvent[] {
  const out: QuestBeatEvent[] = [];
  const giverId = QUEST_GIVERS[q.id];
  const giver = giverId ? getNpcDef(giverId) : null;
  const givenBank =
    q.id === FIRST_STEPS_ID
      ? FIRST_STEPS_JOURNAL.journalGiven
      : giver
        ? QUEST_JOURNAL.given[giver.id as NpcId]
        : QUEST_JOURNAL.given.self;
  out.push({
    questId: q.id,
    kind: 'given',
    text:
      recordLine(givenBank, rc, `given:${q.id}`) ??
      (giver ? `Given by ${giver.name}.` : 'Your own idea. Nobody asked you to.'),
  });
  if (q.summary) out.push({ questId: q.id, kind: 'known', text: q.summary });
  if (q.progressNotes) out.push({ questId: q.id, kind: 'lead', text: q.progressNotes });
  const trigger = arrivalTrigger(q.id);
  if (trigger && mapNodeName(trigger)) {
    out.push({ questId: q.id, kind: 'lead', text: questArrivalLead(q.id, trigger, rc) });
  }
  return out;
}

/** "Step out into Emberford." — the arrival lead for a scripted quest (stable per campaign). */
export function questArrivalLead(questId: string, triggerId: string, rc: RecordCtx = DEFAULT_RECORD_CTX): string {
  const where = placePhrase(triggerId);
  const text = recordLine(QUEST_JOURNAL.leadArrival, rc, `lead:${questId}`, { where }) ?? `Step out into ${where}.`;
  return text.charAt(0).toUpperCase() + text.slice(1);
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
  record?: RecordCtx;
}): ChronicleState {
  let c = createEmptyChronicle();
  const rc = input.record ?? DEFAULT_RECORD_CTX;
  const turn = Math.max(0, Math.floor(input.turn || 0));
  if (input.locationId) c = applyChroniclePatch(c, arrivalEvents(c, input.locationId, rc), turn);
  c = applyChroniclePatch(
    c,
    {
      itemObtained: input.items.map((i) => ({ itemId: i.id, name: i.name, how: 'carried' as const, source: null, locationId: null })),
      questBeat: input.quests.flatMap((q) => [
        ...questOpeningBeats(q, input.arrivalTrigger, rc),
        ...(q.status === 'done'
          ? [{ questId: q.id, kind: 'done' as const, text: recordLine(QUEST_JOURNAL.backfillDone, rc, `bfd:${q.id}`) ?? 'Already behind you.' }]
          : []),
        ...(q.status === 'failed'
          ? [{ questId: q.id, kind: 'failed' as const, text: recordLine(QUEST_JOURNAL.backfillFailed, rc, `bff:${q.id}`) ?? 'Already behind you, unfinished.' }]
          : []),
      ]),
      deed: input.quests
        .filter((q) => q.status === 'done')
        .map((q) => ({ kind: 'quest' as const, text: `Completed “${q.title}”`, questTitle: q.title, questId: q.id })),
    },
    turn,
  );
  return c;
}
