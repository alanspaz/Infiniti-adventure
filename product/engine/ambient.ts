/**
 * NARR-02c — lightweight scene clock / ambient world-tick.
 * Wait / pass time / "take a moment" advances persisted CampaignState flags
 * and drives stub prose at the CURRENT location (hearth, inn, street, etc.).
 */
import type { CampaignFlagValue } from './save';

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

/** Progressing place-specific wait lines (index = loc wait step after tick, 1-based). */
const PLACE_WAIT_ARCS: Record<string, string[]> = {
  'place.copper-kettle': [
    'You take a moment on the inn threshold. The copper kettle over the door ticks as it cools; hearth-smoke thins into the street air.',
    'You wait at The Copper Kettle. A laugh rolls from the common room; boot-soles scrape the timber step; someone pours another round inside.',
    'Time stretches at the inn door. A cart rattles past on Emberford stone; the kettle sign creaks; warm light spills, then dims, as the door swings.',
    'You linger. The innkeeper calls a name you do not know; a cloak is hung; the threshold smells of bread, ale, and rain on copper.',
  ],
  'locale.emberford': [
    'You take a moment on Emberford\'s street. Chimneys breathe; market shutters clap; a river breeze carries wet brick and fried dough.',
    'You wait among the riverside noise. A hawker changes pitch; gulls argue over the quay; lantern-hooks sway for evening.',
    'Time slides on the cobbles. A watchman nods past; wagon wheels grind; somewhere a smithy answers with three bright hammer-falls.',
    'You linger in Emberford. The crowd thins a notch; puddles mirror the chimneys; the road toward the vale waits if you want it.',
  ],
  'locale.ashen-fields': [
    'You take a moment in the Ashen Fields. Pale soil lifts on the wind; scarecrows lean; hedgerows tick with insects.',
    'You wait under open sky. Clouds drag shadows across the furrows; a crow lands, then decides against you.',
    'Time thins on the farm track. Dust settles on your boots; a distant mill turns; the road back to Emberford stays clear.',
    'You linger. The scarecrow\'s coat flaps once; soil cools underfoot; the vale\'s watch-stones glint far off.',
  ],
  'region.embervale': [
    'You take a moment at the edge of Embervale. River light, mill towns, and old watch-stones hold still around you.',
    'You wait on the vale road. Wind combs the hedgerows; a cart\'s bell fades; the land feels wider than any single errand.',
    'Time edges forward. Smoke from distant chimneys drifts; a heron lifts from the water; paths fork without hurry.',
    'You linger in the open vale. The world does not pause — it simply grants you a longer breath before the next mile.',
  ],
  'interior.kettle-cellar': [
    'You take a moment in the inn cellar. Cool stone sweats; cider casks tick as they settle; the locked spice-chest keeps its secret.',
    'You wait below. Drips count time in the dark corner; a rat decides you are boring; the stair up to the common room creaks once.',
    'Time pools with the cider chill. Labels blur in low light; the air tastes of oak and old spice; nothing rushes you.',
    'You linger among the casks. A cork sighs; dust motes drift; the chest\'s lock gleams — still shut, still waiting.',
  ],
  'place.brightanvil': [
    'You take a moment in the smithy yard. Sparks leap; the anvil rings a clean note; heat rolls off the open forge.',
    'You wait by Brightanvil. Quenching steam hisses; unfinished blades tick as they cool; a apprentice swaps tongs.',
    'Time keeps forge-rhythm. Three hammer falls, a breath, then three again; horseshoes stack; the street noise feels far.',
    'You linger in the yard. Coal glow paints the racks; the smith nods without stopping; iron smells like rain and work.',
  ],
  'interior.smith-forge': [
    'You take a moment on the forge floor. Bellows breathe; racks of blades and shoes shimmer; heat presses your cheeks.',
    'You wait in the forge. The hammer speaks; scale flakes from a billet; water in the quench tub shivers.',
    'Time is measured in heats. Coals settle; tongs scrape; unfinished work waits in honest rows.',
    'You linger by the bellows. Sweat and iron fill the air; the yard door frames a cooler slice of Emberford.',
  ],
  'place.mossglass': [
    'You take a moment at Mossglass. Green bottles catch the light; drying herbs tick; a soft lamp paints the narrow shop.',
    'You wait among the vials. A cork pops softly in back; labels in tidy script line the shelf; the street door chime stays still.',
    'Time smells of leaf and glass. Dust floats in a green-lamp shaft; a ledger page turns somewhere out of sight.',
    'You linger in the alchemist\'s front. Herbs sway on their strings; bottles wink; the counter inside still waits if you step closer.',
  ],
  'interior.alchemist-counter': [
    'You take a moment at the shop counter. Labeled vials stand in careful ranks; the ledger\'s ink is still damp on the last line.',
    'You wait by the polished wood. A pestle taps once in back; green-glass lamps hum; prices stay honest and exact.',
    'Time drips like tincture. Seals glint; a bitter herb note rises; the street door feels a world away.',
    'You linger at the counter. The alchemist\'s tools rest mid-task; nothing is rushed; every bottle has a name.',
  ],
};

const GENERIC_WAIT_LINES = [
  'You wait. Distant sound and a shift of light prove the place is still moving around your stillness.',
  'You pass the moment. Footsteps, weather, or quiet rumor rearrange at the margins while you hold still.',
  'You linger. The world edges forward a notch — enough to show the wait was not empty.',
  'Time slides. Something small changes here: a shadow, a creak, a breath of air from an exit you already know.',
];

function pickPlaceArc(locationId: string | null): string[] | null {
  if (!locationId) return null;
  if (PLACE_WAIT_ARCS[locationId]) return PLACE_WAIT_ARCS[locationId]!;
  return null;
}

function pickProgressingLine(lines: string[], step: number): string {
  if (lines.length === 0) return GENERIC_WAIT_LINES[0]!;
  // Progress through the arc, then gently cycle without immediate repeat.
  const idx = Math.max(0, step - 1) % lines.length;
  return lines[idx]!;
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

  // Non-hearth wait: advance global + per-location step; place-specific arcs first.
  const locKey = locationId ? locWaitFlag(locationId) : null;
  const locStep = locKey ? numFlag(flags, locKey, 0) + 1 : nextTick;
  const arc = pickPlaceArc(locationId);
  const prose = arc
    ? pickProgressingLine(arc, locStep)
    : pickProgressingLine(GENERIC_WAIT_LINES, nextTick);

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
