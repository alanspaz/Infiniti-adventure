/**
 * Adventure scene loop (pure TS): narrate → optional check → apply state → optional still.
 * Offline-first; stub narrator works without network.
 */
import type { AbilityKey, CharacterSheet } from './types';
import { deriveStats } from './derived';
import {
  checkModifier,
  resolveCheck,
  type CheckResult,
} from './dice';
import { createSeededRng, type Rng } from './rng';
import {
  createStarterMap,
  getMapNode,
  setCampaignLocation,
  whereAmI,
  type MapGraph,
  type WhereAmIResult,
} from './map';
import {
  createNarratorProvider,
  type NarratorBeat,
  type NarratorProvider,
  type NarratorSceneResult,
  type NarratorVerbosity,
} from './narrator';
import {
  createStillProvider,
  type StillProvider,
  type StillResult,
} from './stills';
import { withSession, type CampaignSave } from './save';

export type SuggestedCheck = {
  ability: AbilityKey;
  dc: number;
  /** Heuristic label for UI (e.g. "climb", "persuade"). */
  label: string;
  proficient?: boolean;
};

export type TravelSuggestion = {
  toNodeId: string;
  label: string;
  /** How the match was found. */
  via: 'exit-label' | 'place-name' | 'go-keyword';
};

export type SceneCheckOutcome = {
  suggestion: SuggestedCheck;
  result: CheckResult;
  /** Short line for log / UI. */
  line: string;
};

export type SceneBeatInput = {
  campaign: CampaignSave;
  /** Player action text; omit/empty for opening / refresh beat. */
  playerAction?: string;
  verbosity?: NarratorVerbosity;
  beat?: NarratorBeat;
  /** Injected narrator (tests / app factory). Default: stub. */
  narrator?: NarratorProvider;
  /** Injected stills (tests). Default: stub. */
  stills?: StillProvider;
  map?: MapGraph;
  /** When true, request a placeholder still for the beat. */
  showMe?: boolean;
  /** Force a check (skips heuristic). null skips check entirely. */
  forceCheck?: SuggestedCheck | null;
  /** Skip auto travel from action text. */
  skipTravel?: boolean;
  rng?: Rng;
};

export type SceneBeatResult = {
  campaign: CampaignSave;
  prose: string;
  narrator: NarratorSceneResult;
  check: SceneCheckOutcome | null;
  travel: TravelSuggestion | null;
  where: WhereAmIResult | null;
  still: StillResult | null;
  /** Truncated action / beat summary appended to log. */
  logLine: string;
};

/** Keyword → ability (simple v1 heuristic). */
const CHECK_PATTERNS: Array<{
  re: RegExp;
  ability: AbilityKey;
  label: string;
  dc: number;
}> = [
  {
    re: /\b(climb|lift|smash|break|force|push|pull|grapple|athlet)\w*\b/i,
    ability: 'strength',
    label: 'athletics',
    dc: 13,
  },
  {
    re: /\b(sneak|hide|stealth|pick\s*pocket|slip|quiet)\w*\b/i,
    ability: 'dexterity',
    label: 'stealth',
    dc: 14,
  },
  {
    re: /\b(dodge|acrob|balance|tumble)\w*\b/i,
    ability: 'dexterity',
    label: 'acrobatics',
    dc: 13,
  },
  {
    re: /\b(endure|resist\s*poison|hold\s*breath|tough)\w*\b/i,
    ability: 'constitution',
    label: 'endurance',
    dc: 13,
  },
  {
    re: /\b(recall|know|identify|arcana|history|investigat)\w*\b/i,
    ability: 'intelligence',
    label: 'knowledge',
    dc: 13,
  },
  {
    re: /\b(search|look\s*for|examine|inspect|track|spot|listen|perceiv|insight|medic)\w*\b/i,
    ability: 'wisdom',
    label: 'perception',
    dc: 12,
  },
  {
    re: /\b(persuade|convince|charm|deceive|lie|intimidate|negotiate|bargain)\w*\b/i,
    ability: 'charisma',
    label: 'social',
    dc: 13,
  },
  {
    re: /\b(attack|strike|hit|fight|swing)\w*\b/i,
    ability: 'strength',
    label: 'attack',
    dc: 12,
  },
  {
    re: /\b(check|roll|try\s+to)\b/i,
    ability: 'wisdom',
    label: 'general',
    dc: 12,
  },
];

const GO_RE =
  /\b(?:go|head|walk|travel|enter|leave|return|move|step|descend|ascend)\b/i;

/**
 * Detect a suggested ability check from player action text.
 * Returns null when no check is warranted.
 */
export function detectSuggestedCheck(action: string): SuggestedCheck | null {
  const text = action.trim();
  if (!text) return null;
  for (const p of CHECK_PATTERNS) {
    if (p.re.test(text)) {
      return {
        ability: p.ability,
        dc: p.dc,
        label: p.label,
        proficient: false,
      };
    }
  }
  return null;
}

/**
 * Match travel intent against current exits / place names (simple v1).
 */
export function detectTravelSuggestion(
  action: string,
  graph: MapGraph,
  locationId: string | null,
): TravelSuggestion | null {
  const text = action.trim().toLowerCase();
  if (!text || !locationId) return null;
  const node = getMapNode(graph, locationId);
  if (!node) return null;

  for (const ex of node.exits) {
    const label = ex.label.trim().toLowerCase();
    if (label && text.includes(label)) {
      return { toNodeId: ex.toNodeId, label: ex.label, via: 'exit-label' };
    }
  }

  for (const ex of node.exits) {
    const dest = getMapNode(graph, ex.toNodeId);
    if (!dest) continue;
    const name = dest.name.trim().toLowerCase();
    if (name.length >= 4 && text.includes(name)) {
      return { toNodeId: ex.toNodeId, label: ex.label, via: 'place-name' };
    }
  }

  if (GO_RE.test(text)) {
    const hits: TravelSuggestion[] = [];
    for (const ex of node.exits) {
      const words = ex.label
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4);
      if (words.some((w) => text.includes(w))) {
        hits.push({
          toNodeId: ex.toNodeId,
          label: ex.label,
          via: 'go-keyword',
        });
      }
    }
    if (hits.length === 1) return hits[0]!;
  }

  return null;
}

function primaryPc(campaign: CampaignSave): CharacterSheet | null {
  return campaign.party.length > 0 ? campaign.party[0]! : null;
}

function runCheckForPc(
  pc: CharacterSheet | null,
  suggestion: SuggestedCheck,
  rng: Rng,
): SceneCheckOutcome {
  let modifier = 0;
  if (pc) {
    const stats = deriveStats(pc);
    modifier = checkModifier(
      pc.abilities,
      suggestion.ability,
      Boolean(suggestion.proficient),
      stats.proficiencyBonus,
    );
  }
  const result = resolveCheck(modifier, suggestion.dc, { rng });
  const outcome = result.success ? 'success' : 'failure';
  const modStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;
  const line = `${suggestion.label} (${suggestion.ability}) d20=${result.d20} ${modStr} = ${result.total} vs DC ${suggestion.dc} → ${outcome}`;
  return { suggestion, result, line };
}

function truncate(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function appendLogSummary(prev: string, line: string, maxLen = 280): string {
  const next = prev.trim() ? `${prev.trim()} | ${line}` : line;
  if (next.length <= maxLen) return next;
  return next.slice(next.length - maxLen);
}

function nextTurnForBeat(
  currentTurn: number,
  action: string,
  beat: NarratorBeat,
): number {
  if (action) return currentTurn + 1;
  if (beat === 'opening' && currentTurn === 0) return 1;
  return currentTurn;
}

/**
 * Resolve a scene beat: narrate (stub/remote), optional dice, travel, still,
 * persist-ready campaign.
 */
export async function resolveSceneBeat(
  input: SceneBeatInput,
): Promise<SceneBeatResult> {
  const graph = input.map ?? createStarterMap();
  const narrator = input.narrator ?? createNarratorProvider('stub');
  const stills = input.stills ?? createStillProvider('stub');
  const verbosity = input.verbosity ?? 'standard';
  const action = (input.playerAction ?? '').trim();
  const beat: NarratorBeat =
    input.beat ??
    (action
      ? 'custom'
      : input.campaign.session.turn > 0
        ? 'continue'
        : 'opening');

  const partyNames = input.campaign.party.map((c) => c.name);
  const locationId =
    input.campaign.session.locationId ?? graph.startNodeId;

  let check: SceneCheckOutcome | null = null;
  const suggestion =
    input.forceCheck === null
      ? null
      : (input.forceCheck ?? (action ? detectSuggestedCheck(action) : null));

  const seed =
    input.campaign.session.rngSeed ??
    (Math.floor(Date.now() / 1000) % 1_000_000);
  const rng =
    input.rng ?? createSeededRng(seed + input.campaign.session.turn);

  if (suggestion) {
    // Empty party: checks still run with modifier 0 (no auto-spawn).
    check = runCheckForPc(primaryPc(input.campaign), suggestion, rng);
  }

  let travel: TravelSuggestion | null = null;
  if (!input.skipTravel && action) {
    travel = detectTravelSuggestion(action, graph, locationId);
  }

  // Check / travel stay structured (UI cards / Map). Do not inject into prose.
  const narratorResult = await narrator.narrateScene({
    playstylePackId: input.campaign.playstylePackId,
    locationId,
    partyNames,
    turn: input.campaign.session.turn,
    playerAction: action || undefined,
    logSummary: input.campaign.session.logSummary || undefined,
    verbosity,
    beat,
  });

  const prose = narratorResult.prose;

  const nextTurn = nextTurnForBeat(input.campaign.session.turn, action, beat);
  const nextLocation = travel ? travel.toNodeId : locationId;

  const logLine = action
    ? truncate(
        `T${nextTurn}: ${action}${check ? ` [${check.result.success ? 'ok' : 'fail'}]` : ''}${travel ? ` →${travel.toNodeId}` : ''}`,
        120,
      )
    : truncate(`T${nextTurn}: ${beat} beat`, 120);

  const logSummary = appendLogSummary(
    input.campaign.session.logSummary,
    logLine,
  );

  let campaign = withSession(input.campaign, {
    turn: nextTurn,
    locationId: nextLocation,
    logSummary,
    rngSeed: seed,
  });

  if (travel) {
    campaign = setCampaignLocation(campaign, travel.toNodeId);
  }

  let where: WhereAmIResult | null = null;
  try {
    where = whereAmI(
      graph,
      campaign.session.locationId ?? graph.startNodeId,
    );
  } catch {
    where = null;
  }

  let still: StillResult | null = null;
  if (input.showMe) {
    still = await stills.requestStill({
      subjectKind: 'described',
      prompt: truncate(prose, 80),
      locationId: campaign.session.locationId,
      playstylePackId: campaign.playstylePackId,
    });
  }

  return {
    campaign,
    prose,
    narrator: narratorResult,
    check,
    travel,
    where,
    still,
    logLine,
  };
}

/** Convenience: opening beat for a campaign (offline stub by default). */
export async function resolveOpeningBeat(
  campaign: CampaignSave,
  extras: Omit<SceneBeatInput, 'campaign' | 'playerAction' | 'beat'> = {},
): Promise<SceneBeatResult> {
  return resolveSceneBeat({
    ...extras,
    campaign,
    beat: 'opening',
  });
}
