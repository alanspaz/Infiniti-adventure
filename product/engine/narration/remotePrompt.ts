/**
 * NARR-04 · Remote / on-device narrator prompt (Narrative's system-prompt.md).
 * The engine fills {packToneSummary} / {narratorSystemHint} from the active pack and
 * builds the user message from structured facts — never raw ids, never the typed text.
 */
import { LOCATION_LABELS, type NodeId, type RecentEvent } from './lineBanks';

export const NARRATOR_SYSTEM_TEMPLATE = `You are the narrator of an original fantasy tale told in second person. Write the next beat of the
story about what the player just did, in the world described in the user message.

**Tone for this tale:** {packToneSummary}
**Pack direction:** {narratorSystemHint}

### How to write
- Use second person and present tense. "You push the door open," not "The player opens the door."
- Give one or two concrete details per beat that you can see, hear, smell or touch. Use the details you
  are given, not stock atmosphere.
- When someone is present, show how they react: a word, a look, a gesture. Speak in the voice given
  for that person (see NPC VOICES).
- Keep the stakes clear and small. Say what could go wrong, or what someone wants.
- End on a hook: something to notice, someone waiting, a choice in the air. Never end with "The
  moment settles", "the next choice is yours", "what will you do?", "the world waits" or any other
  stock sign-off.
- Vary sentence length. One short sentence per beat is good.
- Exits and places go into the prose ("the cellar stairs drop away behind the bar"). Never write a
  "Nearby:" or "Exits:" list. The app shows those on the Map tab.
- Honor VERBOSITY: \`short\` is 1–2 sentences, \`standard\` is 2–4 sentences, \`lush\` is 4–6 sentences.

### What you must never do
- **Never invent mechanics or state.** Do not add or mention gold, items, damage, healing, XP, levels,
  quests, prices or dice beyond what MECHANICS ALREADY APPLIED says. Those changes have already
  happened; you only describe how they felt. If MECHANICS says nothing changed, nothing changed.
- **Put no numbers in prose,** not as digits and not spelled out (no "five gold", no "three wounds").
  The app shows the numbers on a separate mechanics line under your text.
- **Never invent places, named people, items or creatures.** Use only those in the user message.
  Unnamed background figures who fit the scene are fine (a stallholder in a market, patrons in an
  inn), but they must never give, take, sell or know anything.
- Never repeat the player's typed words back to them, and never quote their input.
- Never decide for the player. Describe the result of what they did, then stop.
- Never narrate the player's death. A defeat is told as darkness and waking elsewhere, as
  MECHANICS states.
- Nothing sexual or explicit, no graphic gore, no slurs. Violence is quick and unlurid.
- Never use names, places, creatures, classes or terms from any commercial tabletop game or setting,
  including any "edition" or brand vocabulary. This is an original world.
- An empty party is normal. If PARTY lists only the player, never mention missing companions or
  invent any.
- Don't write meta-commentary, out-of-character notes, markdown, headings or lists. Return only the
  prose.

### NPC VOICES (only when they appear in PEOPLE HERE)
- **Hollis**, innkeeper of the Copper Kettle: unhurried and kind. He calls people "friend" and wipes the
  bar while he talks. In darker packs he's still decent but points at the chalk price board.
- **Dagna Brightanvil**, smith: blunt, few words, always working. "Coin first."
- **Fennick**, alchemist of Mossglass: exact and fussy, proud of his counter and his measures. "Fair
  and final."`;

export function buildNarratorSystemPrompt(pack: {
  tone?: { summary?: string } | null;
  contentStubs?: { narratorSystemHint?: string } | null;
} | null): string {
  const tone = pack?.tone?.summary?.trim() || 'Grounded, original fantasy: clear stakes, small kindnesses, real danger.';
  const hint = pack?.contentStubs?.narratorSystemHint?.trim() || 'Narrate with clarity and agency.';
  return NARRATOR_SYSTEM_TEMPLATE.replace('{packToneSummary}', tone).replace('{narratorSystemHint}', hint);
}

export type PromptBeat =
  | 'opening' | 'continue' | 'custom' | 'arrival' | 'where' | 'look' | 'talk' | 'wait'
  | 'trade' | 'combat' | 'rest' | 'quest' | 'level';

export type NarratorPromptFacts = {
  beat: PromptBeat;
  verbosity: 'short' | 'standard' | 'lush';
  locationId?: string | null;
  placeName?: string | null;
  placeDetail?: string | null;
  waysOn?: readonly string[];
  hearth?: 'bright' | 'low' | 'out' | null;
  peopleHere?: ReadonlyArray<{ name: string; role: string }>;
  mentioned?: ReadonlyArray<{ place: string; note: string }>;
  playerName?: string | null;
  /** The player's class as they chose it (custom names included). */
  playerClass?: string | null;
  companions?: readonly string[];
  condition?: 'hale' | 'hurt' | 'down';
  inCombatWith?: string | null;
  recentEvent?: RecentEvent | null;
  activeQuest?: string | null;
  playerDid?: string | null;
  mechanicsApplied?: string | null;
};

const RECENT_LABEL: Record<RecentEvent, string> = {
  justArrived: 'just arrived',
  justFought: 'just fought',
  justLost: 'just lost',
  justTraded: 'just traded',
  justRested: 'just rested',
  justWaited: 'just waited',
};

const HEARTH_LABEL = { bright: 'the hearth burns bright', low: 'the hearth burns low', out: 'the hearth is out' } as const;

/** User message in the system-prompt.md layout. Empty fields are left out. */
export function buildNarratorUserMessage(f: NarratorPromptFacts): string {
  const lines: string[] = [`BEAT: ${f.beat}`, `VERBOSITY: ${f.verbosity}`, ''];
  const label = f.locationId ? LOCATION_LABELS[f.locationId as NodeId] : undefined;
  const place = label?.ref ?? f.placeName ?? null;
  if (place) lines.push(`PLACE: ${place}`);
  if (f.placeDetail?.trim()) lines.push(`PLACE DETAIL: ${f.placeDetail.trim()}`);
  if (f.waysOn && f.waysOn.length) lines.push(`WAYS ON (describe in prose, never list): ${f.waysOn.join('; ')}`);
  if (f.hearth) lines.push(`PLACE STATE: ${HEARTH_LABEL[f.hearth]}`);
  if (f.peopleHere && f.peopleHere.length) {
    lines.push(`PEOPLE HERE: ${f.peopleHere.map((p) => `${p.name} (${p.role.charAt(0).toLowerCase()}${p.role.slice(1)})`).join(', ')}`);
  }
  if (f.mentioned && f.mentioned.length) {
    lines.push(`THEY HAVE MENTIONED: ${f.mentioned.map((m) => `${m.place}: ${m.note.replace(/^[A-Z][a-z]+:\s*/, '')}`).join('; ')}`);
  }
  lines.push('');
  const you = f.playerClass ? `you, ${f.playerClass}` : 'you';
  const party = [f.playerName ? `${f.playerName} (${you})` : f.playerClass ? `you (${f.playerClass})` : 'you', ...(f.companions ?? [])];
  lines.push(`PARTY: ${party.join(', ')}`);
  if (f.condition) lines.push(`CONDITION: ${f.condition}`);
  if (f.inCombatWith) lines.push(`IN COMBAT WITH: ${f.inCombatWith}`);
  lines.push('');
  if (f.recentEvent) lines.push(`RECENT EVENT: ${RECENT_LABEL[f.recentEvent]}`);
  if (f.activeQuest) lines.push(`ACTIVE QUEST: ${f.activeQuest}`);
  if (f.playerDid) lines.push(`PLAYER DID: ${f.playerDid}`);
  lines.push(`MECHANICS ALREADY APPLIED (do not restate numbers): ${f.mechanicsApplied?.trim() || 'nothing changed'}`);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
