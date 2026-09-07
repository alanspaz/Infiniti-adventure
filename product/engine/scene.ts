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
  type NarratorLocationHint,
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
import { tickWorldAmbient } from './ambient';
import {
  applyCampaignPatch,
  detectCombatEnterFromAction,
  detectCombatExitFromAction,
  enterCombatPatch,
  exitCombatPatch,
} from './campaignState';

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
  via: 'exit-label' | 'place-name' | 'go-keyword' | 'parent-leave';
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

/** Weak exit words — alone they must not fake a travel match (e.g. "stairs"). */
const WEAK_EXIT_WORDS = new Set([
  'stairs',
  'street',
  'floor',
  'room',
  'door',
  'path',
  'road',
  'threshold',
  'counter',
  'yard',
  'fields',
  'back',
  'into',
  'onto',
  'from',
  'with',
  'leave',
  'return',
  'visit',
  'enter',
  'step',
  'toward',
  'towards',
]);

const TRAVEL_STOP = new Set([
  'the',
  'and',
  'for',
  'out',
  'down',
  'over',
  'into',
  'onto',
  'from',
  'with',
  'back',
  'vale',
]);

function significantTokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !TRAVEL_STOP.has(w));
}

/** Hierarchical leave / outside / upstairs — one step up parent chain. */
const LEAVE_UP_RE =
  /\b(?:leave(?:\s+the\s+[\w'-]+)?|go\s+outside|step\s+outside|head\s+outside|head\s+out\b|go\s+out\b|head\s+upstairs|go\s+upstairs|head\s+up\b|exit(?:\s+the\s+[\w'-]+)?|step\s+out)\b/i;

function isLeaveUpIntent(text: string): boolean {
  return LEAVE_UP_RE.test(text);
}

/**
 * Move one step up the Map parent chain (room → place → locale → region).
 * Prefers an exit that targets parentId; otherwise walks parentId directly.
 */
function detectParentLeave(
  graph: MapGraph,
  node: NonNullable<ReturnType<typeof getMapNode>>,
): TravelIntent {
  if (!node.parentId) {
    return { kind: 'at-boundary' };
  }
  const parent = getMapNode(graph, node.parentId);
  if (!parent) {
    return { kind: 'at-boundary' };
  }
  const exitToParent = node.exits.find((ex) => ex.toNodeId === node.parentId);
  return {
    kind: 'travel',
    suggestion: {
      toNodeId: node.parentId,
      label: exitToParent?.label ?? `leave toward ${parent.name}`,
      via: 'parent-leave',
    },
  };
}

export type TravelIntent =
  | { kind: 'travel'; suggestion: TravelSuggestion }
  | { kind: 'unknown'; attempted: string }
  /** Already at region root — cannot leave further up the chain. */
  | { kind: 'at-boundary' }
  | { kind: 'none' };

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
 * Match travel intent against current exits / place names (TRAVEL-01).
 * Nearby exits only; go/walk/head to an unknown place → unknown (no fake move).
 */
export function detectTravelIntent(
  action: string,
  graph: MapGraph,
  locationId: string | null,
): TravelIntent {
  const raw = action.trim();
  const text = raw.toLowerCase();
  if (!text || !locationId) return { kind: 'none' };
  const node = getMapNode(graph, locationId);
  if (!node) return { kind: 'none' };

  // Full exit label substring (strongest).
  for (const ex of node.exits) {
    const label = ex.label.trim().toLowerCase();
    if (label.length >= 4 && text.includes(label)) {
      return {
        kind: 'travel',
        suggestion: {
          toNodeId: ex.toNodeId,
          label: ex.label,
          via: 'exit-label',
        },
      };
    }
  }

  // Destination place name — full name or significant tokens.
  for (const ex of node.exits) {
    const dest = getMapNode(graph, ex.toNodeId);
    if (!dest) continue;
    const name = dest.name.trim().toLowerCase();
    if (name.length >= 4 && text.includes(name)) {
      return {
        kind: 'travel',
        suggestion: {
          toNodeId: ex.toNodeId,
          label: ex.label,
          via: 'place-name',
        },
      };
    }
    const nameToks = significantTokens(dest.name);
    if (
      nameToks.length > 0 &&
      nameToks.every((t) => text.includes(t))
    ) {
      return {
        kind: 'travel',
        suggestion: {
          toNodeId: ex.toNodeId,
          label: ex.label,
          via: 'place-name',
        },
      };
    }
    // Single distinctive dest token (e.g. "cellar", "kettle").
    const strong = nameToks.filter((t) => t.length >= 5);
    if (strong.length === 1 && text.includes(strong[0]!)) {
      return {
        kind: 'travel',
        suggestion: {
          toNodeId: ex.toNodeId,
          label: ex.label,
          via: 'place-name',
        },
      };
    }
  }

  // TRAVEL-01 hierarchical leave: one step up parent chain.
  if (isLeaveUpIntent(text)) {
    return detectParentLeave(graph, node);
  }

  if (GO_RE.test(text)) {
    const scored: Array<{ suggestion: TravelSuggestion; score: number }> = [];
    for (const ex of node.exits) {
      const dest = getMapNode(graph, ex.toNodeId);
      const nameToks = dest ? significantTokens(dest.name) : [];
      const labelToks = significantTokens(ex.label).filter(
        (w) => !WEAK_EXIT_WORDS.has(w),
      );
      let score = 0;
      for (const t of nameToks) {
        if (text.includes(t)) score += 3;
      }
      for (const t of labelToks) {
        if (text.includes(t)) score += 2;
      }
      if (score > 0) {
        scored.push({
          score,
          suggestion: {
            toNodeId: ex.toNodeId,
            label: ex.label,
            via: 'go-keyword',
          },
        });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    if (scored.length === 1) {
      return { kind: 'travel', suggestion: scored[0]!.suggestion };
    }
    if (scored.length > 1 && scored[0]!.score > scored[1]!.score) {
      return { kind: 'travel', suggestion: scored[0]!.suggestion };
    }
    // Go/walk/head with no unique nearby match → honest refusal.
    return { kind: 'unknown', attempted: raw.slice(0, 80) };
  }

  return { kind: 'none' };
}

/**
 * Match travel against current exits / place names (nearby only).
 */
export function detectTravelSuggestion(
  action: string,
  graph: MapGraph,
  locationId: string | null,
): TravelSuggestion | null {
  const intent = detectTravelIntent(action, graph, locationId);
  return intent.kind === 'travel' ? intent.suggestion : null;
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
  let travelUnknown: string | null = null;
  let travelAtBoundary = false;
  if (!input.skipTravel && action) {
    const intent = detectTravelIntent(action, graph, locationId);
    if (intent.kind === 'travel') {
      travel = intent.suggestion;
    } else if (intent.kind === 'unknown') {
      travelUnknown = intent.attempted;
    } else if (intent.kind === 'at-boundary') {
      travelAtBoundary = true;
    }
  }

  // Map-truth for stub "where am I" — same source as Map panel (current place).
  let locationHint: NarratorLocationHint | null = null;
  try {
    const hereNow = whereAmI(graph, locationId);
    locationHint = {
      name: hereNow.name,
      description: hereNow.description,
      nearby: hereNow.exits.map((e) => ({
        toName: e.toName,
        label: e.label,
      })),
    };
  } catch {
    locationHint = null;
  }

  // Arrival hint for successful nearby travel (narrate the NEW place).
  let arrivalHint: NarratorLocationHint | null = null;
  if (travel) {
    try {
      const dest = whereAmI(graph, travel.toNodeId);
      arrivalHint = {
        name: dest.name,
        description: dest.description,
        nearby: dest.exits.map((e) => ({
          toName: e.toName,
          label: e.label,
        })),
      };
    } catch {
      arrivalHint = null;
    }
  }

  // NARR-02c: wait / fuel advances ambient scene clock at CURRENT location.
  const ambient = tickWorldAmbient({
    flags: input.campaign.flags,
    locationId,
    playerAction: action || undefined,
  });

  const travelOutcome =
    travel && arrivalHint
      ? ({ kind: 'arrived' as const, place: arrivalHint })
      : travelAtBoundary && locationHint
        ? ({ kind: 'at-boundary' as const, place: locationHint })
        : travelUnknown
          ? ({ kind: 'refused' as const, attempted: travelUnknown })
          : null;

  // Check / travel stay structured (UI cards / Map). Arrival/refusal are stub prose.
  const narratorResult = await narrator.narrateScene({
    playstylePackId: input.campaign.playstylePackId,
    locationId,
    partyNames,
    turn: input.campaign.session.turn,
    playerAction: action || undefined,
    logSummary: input.campaign.session.logSummary || undefined,
    verbosity,
    beat,
    locationHint,
    worldTick: ambient.hint,
    travelOutcome,
  });

  const prose = narratorResult.prose;

  const nextTurn = nextTurnForBeat(input.campaign.session.turn, action, beat);
  const nextLocation = travel ? travel.toNodeId : locationId;

  const logLine = action
    ? truncate(
        `T${nextTurn}: ${action}${check ? ` [${check.result.success ? 'ok' : 'fail'}]` : ''}${travel ? ` →${travel.toNodeId}` : ''}${travelUnknown ? ' [travel-refused]' : ''}`,
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

  // COMBAT-01: enter/exit from Tale attack / fight-end language.
  if (action && detectCombatExitFromAction(action)) {
    campaign = applyCampaignPatch(
      campaign,
      exitCombatPatch(campaign.world?.combat, 'Combat ends'),
    );
  } else if (action && detectCombatEnterFromAction(action)) {
    campaign = applyCampaignPatch(
      campaign,
      enterCombatPatch(campaign.world?.combat, 'Combat begins'),
    );
  }

  if (Object.keys(ambient.flagPatch).length > 0) {
    campaign = {
      ...campaign,
      flags: { ...campaign.flags, ...ambient.flagPatch },
      updatedAt: new Date().toISOString(),
    };
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
