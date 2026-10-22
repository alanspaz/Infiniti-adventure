/**
 * NARR-02c — lightweight scene clock / ambient world-tick.
 * Wait / pass time / "take a moment" advances persisted CampaignState flags
 * and drives stub prose at the CURRENT location (hearth, inn, street, etc.).
 */
import type { CampaignFlagValue } from './save';
import {
  HEARTH_FEED,
  HEARTH_WAIT,
  lineMatches,
  WAIT_ARCS,
  WAIT_CONTEXT,
  WAIT_FALLBACK,
  composeLine,
  type Bank,
  type NodeId,
} from './narration/lineBanks';
import { DEFAULT_RECORD_CTX, placeRefFor, recordLineContext, Voice } from './narration/voice';

export const HEARTH_FUEL_MAX = 4;

/** Common Room hearth only — not the inn threshold / other Copper Kettle nodes. */
export const HEARTH_LOCATION_IDS = new Set<string>([
  'interior.kettle-common',
]);

export const FLAG_HEARTH_FUEL = 'ambient.hearthFuel';
export const FLAG_LAST_WAIT_TICK = 'ambient.lastWaitTick';
export const FLAG_HEARTH_NEGLECT = 'ambient.hearthNeglect';
export const FLAG_HEARTH_FED_ONCE = 'ambient.hearthFedOnce';
/** Per-location wait step (progressing ambient beats). */
export const FLAG_LOC_WAIT_PREFIX = 'ambient.locWait.';

const WAIT_RE =
  /\b(wait|pass\s+(?:the\s+)?time|press\s+the\s+moment|take\s+a\s+(?:moment|beat|breath|pause)|linger|sit\s+(?:by|near|at|beside)\s+(?:the\s+)?(?:fire|hearth)|rest\s+(?:here|a\s+(?:while|moment|bit))|do\s+nothing|kill\s+time)\b/i;

const FUEL_RE =
  /\b(add\s+(?:wood|fuel|logs?|kindling)|feed\s+(?:the\s+)?(?:fire|hearth)|poke\s+(?:the\s+)?(?:fire|hearth)|stoke\s+(?:the\s+)?(?:fire|hearth)|throw\s+(?:a\s+)?(?:log|wood|stick)s?\s+on(?:\s+(?:the\s+)?(?:fire|hearth))?|build\s+(?:up\s+)?(?:the\s+)?(?:fire|hearth))\b/i;

export type WorldTickKind = 'hearth' | 'place' | 'generic' | 'fuel' | 'none';

export type WorldTickHint = {
  kind: WorldTickKind;
  /** True when player waited / passed time. */
  isWait: boolean;
  /** True when player stoked / fed the fire. */
  isFuel: boolean;
  hearthFuel: number | null;
  lastWaitTick: number;
  /** Player-facing stub prose forced by the tick (non-empty when wait/fuel handled). */
  prose: string | null;
};

export type WorldTickResult = {
  hint: WorldTickHint;
  /** Flags to merge onto CampaignSave.flags (persist). */
  flagPatch: Record<string, CampaignFlagValue>;
};

function numFlag(
  flags: Record<string, CampaignFlagValue> | undefined,
  key: string,
  fallback: number,
): number {
  const v = flags?.[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return fallback;
}

export function isWaitAction(action: string | undefined): boolean {
  const text = (action ?? '').trim();
  if (!text) return false;
  return WAIT_RE.test(text);
}

export function isFuelAction(action: string | undefined): boolean {
  const text = (action ?? '').trim();
  if (!text) return false;
  return FUEL_RE.test(text);
}

export function isHearthLocation(locationId: string | null | undefined): boolean {
  if (!locationId) return false;
  return HEARTH_LOCATION_IDS.has(locationId);
}

function clampFuel(n: number): number {
  return Math.max(0, Math.min(HEARTH_FUEL_MAX, Math.floor(n)));
}

function locWaitFlag(locationId: string): string {
  return `${FLAG_LOC_WAIT_PREFIX}${locationId}`;
}

/** Fallback voice when the caller has none (tests / tools): seeded by the tick. */
function defaultAmbientVoice(seed: string): Voice {
  return new Voice({ ctx: recordLineContext(DEFAULT_RECORD_CTX), seedBase: `ambient|${seed}` });
}

/** Prose after a wait tick at the hearth (fuel is the post-tick value). Bank: HEARTH_WAIT. */
export function hearthWaitProse(
  fuel: number,
  neglect: number,
  fedThisTick: boolean,
  voice: Voice = defaultAmbientVoice(`hearth|${fuel}|${neglect}|${fedThisTick}`),
): string {
  const key: keyof typeof HEARTH_WAIT = fedThisTick
    ? 'fedByStranger'
    : fuel >= 4
      ? 'steady'
      : fuel === 3
        ? 'fuel3'
        : fuel === 2
          ? 'fuel2'
          : fuel === 1
            ? 'fuel1'
            : neglect >= 2
              ? 'dead'
              : 'out';
  return voice.say(`hearth.wait.${key}`, HEARTH_WAIT[key], {}) ?? 'You wait by the hearth.';
}

/** Feeding the fire. Bank: HEARTH_FEED (keeps /feed|hearth|fire|coals/). */
export function hearthFuelProse(fuel: number, voice: Voice = defaultAmbientVoice(`feed|${fuel}`)): string {
  const key: keyof typeof HEARTH_FEED = fuel >= HEARTH_FUEL_MAX ? 'full' : fuel >= 3 ? 'mid' : 'low';
  return voice.say(`hearth.feed.${key}`, HEARTH_FEED[key], {}) ?? 'You feed the fire.';
}

/**
 * Place wait: the ordered WAIT_ARCS line for this step (1-based, cycles), so the
 * arc progresses and never repeats back to back. Unknown places use WAIT_FALLBACK.
 */
function placeWaitProse(locationId: string | null, step: number, voice: Voice): { prose: string; arc: boolean } {
  const values = { place: placeRefFor(locationId) };
  const arcBank: Bank | undefined = locationId ? WAIT_ARCS[locationId as Exclude<NodeId, 'interior.kettle-common'>] : undefined;
  let prose: string | null = null;
  if (arcBank && arcBank.length) {
    const eligible = arcBank.filter((l) => lineMatches(l, voice.ctx));
    const pool = eligible.length ? eligible : arcBank;
    const line = pool[Math.max(0, step - 1) % pool.length]!;
    prose = composeLine(line, voice.verbosity, { ...voice.baseValues, ...values });
  }
  const arc = prose !== null;
  if (!prose) prose = voice.say('wait.fallback', WAIT_FALLBACK, values) ?? 'You wait a while.';
  // Optional context prefix (hurt, …): only lines whose tags match right now.
  const ctxLines = WAIT_CONTEXT.filter((l) => l.when && Object.keys(l.when).length > 0 && lineMatches(l, voice.ctx));
  if (ctxLines.length) {
    const c = voice.say('wait.context', ctxLines, values, { verbosity: 'short' });
    if (c) prose = `${c} ${prose}`;
  }
  return { prose, arc };
}

/**
 * Advance ambient scene clock from a player action.
 * Idempotent shape: always returns a hint; flagPatch may be empty.
 */
export function tickWorldAmbient(input: {
  flags?: Record<string, CampaignFlagValue>;
  locationId?: string | null;
  playerAction?: string;
  /** NARR-04: the beat's voice (seeded, anti-repeat). Optional for tools/tests. */
  voice?: Voice;
}): WorldTickResult {
  const flags = input.flags ?? {};
  const locationId = input.locationId ?? null;
  const action = (input.playerAction ?? '').trim();
  const lastWaitTick = numFlag(flags, FLAG_LAST_WAIT_TICK, 0);
  const hearth = isHearthLocation(locationId);

  let fuel = numFlag(flags, FLAG_HEARTH_FUEL, HEARTH_FUEL_MAX);
  // First visit defaults to full hearth without writing until interaction.
  fuel = clampFuel(fuel);
  let neglect = Math.max(0, Math.floor(numFlag(flags, FLAG_HEARTH_NEGLECT, 0)));
  const fedOnce = Boolean(flags[FLAG_HEARTH_FED_ONCE]);

  const empty: WorldTickResult = {
    hint: {
      kind: 'none',
      isWait: false,
      isFuel: false,
      hearthFuel: hearth ? fuel : null,
      lastWaitTick,
      prose: null,
    },
    flagPatch: {},
  };

  if (!action) return empty;
  const voice = input.voice ?? defaultAmbientVoice(`${locationId ?? ''}|${lastWaitTick}|${fuel}|${neglect}`);

  // Fuel / stoke takes priority over wait when both match.
  if (isFuelAction(action) && hearth) {
    const nextFuel = clampFuel(Math.min(HEARTH_FUEL_MAX, fuel + 2));
    const patch: Record<string, CampaignFlagValue> = {
      [FLAG_HEARTH_FUEL]: nextFuel,
      [FLAG_HEARTH_NEGLECT]: 0,
    };
    return {
      hint: {
        kind: 'fuel',
        isWait: false,
        isFuel: true,
        hearthFuel: nextFuel,
        lastWaitTick,
        prose: hearthFuelProse(nextFuel, voice),
      },
      flagPatch: patch,
    };
  }

  if (!isWaitAction(action)) return empty;

  const nextTick = lastWaitTick + 1;

  if (hearth) {
    let fedThisTick = false;
    let nextFuel = fuel;
    let nextNeglect = neglect;

    if (fuel > 0) {
      // Burning → dimming. The extinguish tick always lands on ash (demo arc).
      nextFuel = clampFuel(fuel - 1);
      if (nextFuel === 0) {
        nextNeglect = neglect + 1;
      }
    } else {
      // Already out — further waits deepen neglect; one NPC feed may restart
      // the cycle until neglect ends it for good.
      if (!fedOnce && neglect < 2 && nextTick % 2 === 0) {
        fedThisTick = true;
        nextFuel = 3;
        nextNeglect = 0;
      } else {
        nextNeglect = neglect + 1;
      }
    }

    const patch: Record<string, CampaignFlagValue> = {
      [FLAG_HEARTH_FUEL]: nextFuel,
      [FLAG_LAST_WAIT_TICK]: nextTick,
      [FLAG_HEARTH_NEGLECT]: nextNeglect,
    };
    if (fedThisTick) patch[FLAG_HEARTH_FED_ONCE] = true;

    return {
      hint: {
        kind: 'hearth',
        isWait: true,
        isFuel: false,
        hearthFuel: nextFuel,
        lastWaitTick: nextTick,
        prose: hearthWaitProse(nextFuel, nextNeglect, fedThisTick, voice),
      },
      flagPatch: patch,
    };
  }

  // Non-hearth wait: advance global + per-location step; place-specific arcs first.
  const locKey = locationId ? locWaitFlag(locationId) : null;
  const locStep = locKey ? numFlag(flags, locKey, 0) + 1 : nextTick;
  const { prose, arc } = placeWaitProse(locationId, locStep, voice);

  const patch: Record<string, CampaignFlagValue> = {
    [FLAG_LAST_WAIT_TICK]: nextTick,
  };
  if (locKey) patch[locKey] = locStep;

  return {
    hint: {
      kind: arc ? 'place' : 'generic',
      isWait: true,
      isFuel: false,
      hearthFuel: null,
      lastWaitTick: nextTick,
      prose,
    },
    flagPatch: patch,
  };
}
