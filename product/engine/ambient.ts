/**
 * NARR-02b — lightweight scene clock / ambient world-tick.
 * Wait / pass time advances persisted CampaignState flags and drives stub prose.
 * Common Room hearth/fire is the must-have demo; other places use generic ticks.
 */
import type { CampaignFlagValue } from './save';

export const HEARTH_FUEL_MAX = 4;

/** Locations that share the Copper Kettle hearth ambient. */
export const HEARTH_LOCATION_IDS = new Set<string>([
  'interior.kettle-common',
  'place.copper-kettle',
]);

export const FLAG_HEARTH_FUEL = 'ambient.hearthFuel';
export const FLAG_LAST_WAIT_TICK = 'ambient.lastWaitTick';
export const FLAG_HEARTH_NEGLECT = 'ambient.hearthNeglect';
export const FLAG_HEARTH_FED_ONCE = 'ambient.hearthFedOnce';

const WAIT_RE =
  /\b(wait|pass\s+(?:the\s+)?time|press\s+the\s+moment|linger|sit\s+(?:by|near|at|beside)\s+(?:the\s+)?(?:fire|hearth)|rest\s+(?:here|a\s+(?:while|moment|bit))|do\s+nothing|kill\s+time)\b/i;

const FUEL_RE =
  /\b(add\s+(?:wood|fuel|logs?|kindling)|feed\s+(?:the\s+)?(?:fire|hearth)|poke\s+(?:the\s+)?(?:fire|hearth)|stoke\s+(?:the\s+)?(?:fire|hearth)|throw\s+(?:a\s+)?(?:log|wood|stick)s?\s+on(?:\s+(?:the\s+)?(?:fire|hearth))?|build\s+(?:up\s+)?(?:the\s+)?(?:fire|hearth))\b/i;

export type WorldTickKind = 'hearth' | 'generic' | 'fuel' | 'none';

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

/** Prose after a wait tick at the hearth (fuel is the post-tick value). */
export function hearthWaitProse(fuel: number, neglect: number, fedThisTick: boolean): string {
  if (fedThisTick) {
    return 'The hearth almost dies — then a stranger leans in with a scrap of wood. Flames catch again, thin but alive.';
  }
  if (fuel >= 4) {
    return 'You wait by the hearth. The fire burns steady and warm; sparks climb the flue.';
  }
  if (fuel === 3) {
    return 'You wait. The fire flickers — bright one breath, shy the next — still holding the cold at bay.';
  }
  if (fuel === 2) {
    return 'You wait again. The fire is weaker now; the glow shrinks toward the coals and the room feels cooler.';
  }
  if (fuel === 1) {
    return 'You wait. The hearth is almost out — a few orange eyes in the ash, smoke more than flame.';
  }
  // fuel === 0
  if (neglect >= 2) {
    return 'You wait in the dark of a dead hearth. Ash ticks. No one comes to feed it; the cold settles in for good.';
  }
  return 'You wait. The fire goes out. Only ash and the memory of warmth remain — unless someone feeds it soon.';
}

export function hearthFuelProse(fuel: number): string {
  if (fuel >= HEARTH_FUEL_MAX) {
    return 'You feed the hearth. Wood catches; heat rolls back into the common room as the fire stands tall again.';
  }
  if (fuel >= 3) {
    return 'You poke and feed the fire. Flames climb; the chill loosens its grip.';
  }
  return 'You coax the coals with fresh fuel. Life returns to the hearth, if only a little.';
}

const GENERIC_WAIT_LINES = [
  'You wait. The scene breathes — distant sound, a shift of light, time thinning around your stillness.',
  'You pass the moment. Footsteps, weather, or quiet rumor rearrange themselves while you hold still.',
  'You linger. The world does not pause with you; it edges forward a notch without asking.',
  'Time slides. Something small changes at the margins — enough to prove the wait was not empty.',
];

function pickGenericWait(tick: number): string {
  return GENERIC_WAIT_LINES[Math.abs(tick) % GENERIC_WAIT_LINES.length]!;
}

/**
 * Advance ambient scene clock from a player action.
 * Idempotent shape: always returns a hint; flagPatch may be empty.
 */
export function tickWorldAmbient(input: {
  flags?: Record<string, CampaignFlagValue>;
  locationId?: string | null;
  playerAction?: string;
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
        prose: hearthFuelProse(nextFuel),
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
        prose: hearthWaitProse(nextFuel, nextNeglect, fedThisTick),
      },
      flagPatch: patch,
    };
  }

  // Non-hearth wait: still advance lastWaitTick + varied generic prose.
  const patch: Record<string, CampaignFlagValue> = {
    [FLAG_LAST_WAIT_TICK]: nextTick,
  };
  return {
    hint: {
      kind: 'generic',
      isWait: true,
      isFuel: false,
      hearthFuel: null,
      lastWaitTick: nextTick,
      prose: pickGenericWait(nextTick),
    },
    flagPatch: patch,
  };
}
