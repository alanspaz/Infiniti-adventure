/**
 * NARR-04 · Prose lint shared by tests and the remote-narrator guard.
 * A remote reply that fails any check is thrown away and the stub bank line is used.
 */
import { LOCATION_LABELS } from './lineBanks';

/**
 * Brand/IP vocabulary, NSFW/gore and stock sign-offs. Ported from Narrative's lint.ts.
 * IP terms are WotC-specific only (brand, settings, trademark monsters). Generic fantasy
 * words (dragon, dungeon, cleric, bard, rogue, paladin…) are fine; the player's own
 * class name is always let through (see `allowTerms`).
 */
export const BANNED_PROSE_RE =
  /\b(nearby:|exits:|the air is thick|little do you know|the world waits|the moment holds|next choice is yours|what will you do|wizards of the coast|wotc|d&d|dnd|dungeons\s*(?:&|and)\s*dragons|dungeon master'?s guide|player'?s handbook|monster manual|5e|forgotten realms|waterdeep|baldur'?s gate|neverwinter|faer[uû]n|greyhawk|eberron|ravenloft|dragonlance|spelljammer|beholders?|mind flayers?|illithids?|githyanki|githzerai|tieflings?|drow|displacer beasts?|nsfw|naked|sex|gore|entrails|guts)\b/i;

/** Tokens the banks may use (lineBanks TokenValues). */
export const KNOWN_TOKENS: ReadonlySet<string> = new Set([
  'place', 'name', 'companions', 'keeper', 'item', 'foe', 'Foe', 'weapon', 'loot', 'questTitle',
  'npc', 'where', 'foeA', 'fightCount', 'levelWord', 'titles', 'quests', 'people',
]);

const NUMBER_WORDS_RE =
  /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred)\s+(gold|coins?|xp|hp|points?|damage|wounds?|potions?)\b/i;

/** Words that may be capitalised mid-sentence without being a "name" the narrator invented. */
const WORLD_WORDS = new Set<string>([
  'I', 'Hollis', 'Dagna', 'Brightanvil', 'Fennick', 'Mossglass', 'Kettle', 'Copper', 'Emberford',
  'Embervale', 'Ashen', 'Fields', 'Common', 'Room', 'Inn', 'Cellar', 'Forge', 'Floor', 'Shop',
  'Counter', 'Smithy', 'Alchemist', 'The', 'First', 'Map', 'Tale',
]);
for (const l of Object.values(LOCATION_LABELS)) for (const w of l.name.split(/\s+/)) WORLD_WORDS.add(w);

export type ProseLintOptions = {
  /** Extra allowed names (party, people here, foes, items). */
  allowNames?: readonly string[];
  verbosity?: 'short' | 'standard' | 'lush';
  /**
   * Exact strings always allowed, even if they hit the banned list (the player's own class name).
   * Only the whole string is exempt (case-insensitive): 'Beholder-hunter' passes, a separate
   * 'beholder' or 'beholders' elsewhere in the reply still fails.
   */
  allowTerms?: readonly string[];
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SENTENCE_BUDGET = { short: 2, standard: 4, lush: 6 } as const;

/** Problems found in a prose string (empty = clean). */
export function proseLintIssues(text: string, opts: ProseLintOptions = {}): string[] {
  const issues: string[] = [];
  const t = text.trim();
  if (!t) issues.push('empty');
  if (/\d/.test(t)) issues.push('digit');
  if (/\b(nearby|exits)\s*:/i.test(t) || /\bHere at\b/.test(t)) issues.push('list');
  let scan = t;
  for (const term of opts.allowTerms ?? []) {
    const w = term.trim();
    if (w) scan = scan.replace(new RegExp(`(?<![\\w-])${escapeRe(w)}(?![\\w-])`, 'gi'), ' ');
  }
  const banned = scan.match(BANNED_PROSE_RE);
  if (banned) issues.push(`banned:${banned[0]}`);
  if (NUMBER_WORDS_RE.test(t)) issues.push('number-word');
  if (/\{\w+\}/.test(t)) issues.push('token');
  if (opts.verbosity) {
    const sentences = t.split(/(?<=[.!?])\s+/).filter(Boolean).length;
    if (sentences > SENTENCE_BUDGET[opts.verbosity] * 2) issues.push('too-long');
  }
  const allow = new Set<string>(WORLD_WORDS);
  for (const n of [...(opts.allowNames ?? []), ...(opts.allowTerms ?? [])]) for (const w of n.split(/[\s'’-]+/)) if (w) allow.add(w);
  // Capitalised words that do not start a sentence or a quote must be known names.
  const re = /([^.!?"“”'‘’\s(—–-])\s+([A-Z][a-z]+)/g;
  for (const m of t.matchAll(re)) {
    const word = m[2]!;
    if (!allow.has(word)) {
      issues.push(`name:${word}`);
      break;
    }
  }
  return issues;
}

export function isCleanProse(text: string, opts: ProseLintOptions = {}): boolean {
  return proseLintIssues(text, opts).length === 0;
}
