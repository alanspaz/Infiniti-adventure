/**
 * QA-01: rules-first routing for typed Tale text, before the narrator.
 *
 * SceneScreen calls routePlayerInput(); a non-null result is the whole turn
 * (state change + an honest Tale beat). null → the stub/AI narrator runs.
 * Everything here is pure (save in → save out), so the QA harness and tests
 * exercise exactly what the app does.
 */
import type { AbilityKey } from './types';
import {
  applyCampaignPatch,
  campaignToState,
  type CampaignState,
  type CampaignStatePatch,
  type InventoryItem,
} from './campaignState';
import type { CampaignSave } from './save';
import type { MapGraph } from './map';
import { whereAmI } from './map';
import { detectTravelIntent } from './scene';
import {
  equippedLoadout,
  itemNarrationPatch,
  itemTraits,
  resolveItemAction,
  type ItemActionRequest,
} from './items';
import { progressionSummary, resolveProgressionAction, type ProgressionRequest } from './progression';
import { applyCombatIntent, applyItemActionWithTurn, playerArmorClass, type CombatOutcome } from './combat';
import { applyOpenShop, detectTradeIntent, merchantForLocation, merchantState, openShopAt, resolveTrade } from './shop';

/** QA-01 nice-to-have: typed input is capped (composer maxLength matches). */
export const MAX_INPUT_CHARS = 500;
export const SHORT_REST_FRACTION = 0.25;
export const LONG_REST_COST = 5;
/** Short rests allowed between long rests (keeps the inn's 5g bed meaningful). */
export const MAX_SHORT_RESTS = 2;
export const SHORT_RESTS_FLAG = 'short_rests_since_long';
/** Where a bed can be rented, and whose purse the fee goes to. */
export const INN_LOCATIONS = ['place.copper-kettle', 'interior.kettle-common'];
export const INN_MERCHANT_ID = 'merchant.kettle';

export type InputRoute =
  | 'combat'
  | 'combat-blocked'
  | 'info'
  | 'rest'
  | 'item'
  | 'progression'
  | 'no-fight'
  | 'no-loot'
  | 'trade';

export type RoutedInput = {
  campaign: CampaignSave;
  route: InputRoute;
  ok: boolean;
  message: string;
  /** Set when a combat round (or fight start) resolved. */
  outcome?: CombatOutcome;
};

/** QA-02: "a potion" → "potion" for replies (strips leading articles/possessives). */
export function bareItemName(phrase: string): string {
  const unquote = (x: string) => x.trim().replace(/^["'“”‘’]+|["'“”‘’.!?;,]+$/g, '').trim();
  let t = unquote(phrase);
  const re = /^(?:a|an|the|my|some|your|this|that|one|any)\s+/i;
  while (re.test(t)) t = unquote(t.replace(re, ''));
  return t || phrase.trim();
}

export function clampPlayerInput(text: string): string {
  return text.trim().slice(0, MAX_INPUT_CHARS).trim();
}

function beat(campaign: CampaignSave, patch: CampaignStatePatch, prose: string, playerLine: string, now: number, advanceTurn = false): CampaignSave {
  const state = campaignToState(campaign);
  return applyCampaignPatch(campaign, {
    ...patch,
    ...itemNarrationPatch(state, prose, playerLine, now),
    ...(advanceTurn ? { session: { ...(patch.session ?? {}), turn: campaign.session.turn + 1 } } : {}),
  });
}

// ── matchers ────────────────────────────────────────────────────────────────

const HELP_RE = /^(?:help|commands|\?|what\s+can\s+i\s+(?:do|type|say)\??|how\s+do\s+i\s+play\??)$/i;
const INVENTORY_RE =
  /^(?:i\s+)?(?:inventory|inv|bag|pack|items|(?:check|open|look\s+in|search|show)\s+(?:my\s+)?(?:inventory|bag|pack|items|backpack)|what\s+am\s+i\s+carrying\??|what\s+do\s+i\s+have\??)$/i;
const WHERE_RE = /^(?:where\s+am\s+i\??|where\s+are\s+we\??|where\s+is\s+this\??)$/i;
const LONG_REST_RE =
  /\b(?:long\s+rest|rent\s+(?:a\s+)?(?:room|bed)|(?:get|take|book|pay\s+for)\s+a\s+(?:room|bed)|sleep\s+(?:at|in)\s+the\s+(?:inn|kettle|tavern)|sleep\s+for\s+the\s+night|turn\s+in\s+for\s+the\s+night|stay\s+the\s+night|go\s+to\s+(?:bed|sleep))\b|^(?:i\s+)?(?:sleep|go\s+to\s+sleep)\.?$/i;
const SHORT_REST_RE =
  /\b(?:short\s+rest|catch\s+my\s+breath|take\s+a\s+breather|rest\s+(?:a\s+while|for\s+a\s+(?:bit|moment|while)|here|up|by\s+the\s+(?:fire|hearth)))\b|^(?:i\s+)?(?:(?:take|have)\s+a\s+)?(?:quick\s+)?rest\.?$/i;
const NO_FIGHT_EXIT_RE =
  /^(?:i\s+)?(?:flee|run\s+away|retreat|escape|stand\s+down|surrender|spare\s+(?:them|it|him|her)|end\s+(?:the\s+)?(?:fight|combat)|disengage)\b/i;
const LEVEL_UP_RE = /^(?:i\s+)?(?:level\s*up|gain\s+a\s+level|advance\s+a\s+level)\b/i;
const ABILITIES: Record<string, AbilityKey> = {
  str: 'strength', strength: 'strength', dex: 'dexterity', dexterity: 'dexterity',
  con: 'constitution', constitution: 'constitution', int: 'intelligence', intelligence: 'intelligence',
  wis: 'wisdom', wisdom: 'wisdom', cha: 'charisma', charisma: 'charisma',
};
const SPEND_RE =
  /^(?:i\s+)?(?:raise|increase|boost|improve|put\s+(?:a\s+)?points?\s+(?:in|into)|spend\s+(?:a\s+|my\s+)?(?:ability\s+)?points?\s+(?:on|in|into))\s+(?:my\s+)?(str(?:ength)?|dex(?:terity)?|con(?:stitution)?|int(?:elligence)?|wis(?:dom)?|cha(?:risma)?)\b/i;

type ItemVerb = { kind: 'use' | 'equip' | 'unequip' | 'drop' | 'inspect'; strict: boolean };
const ITEM_VERBS: [RegExp, ItemVerb][] = [
  [/^(?:i\s+)?(?:drink|quaff|sip|down)\s+/i, { kind: 'use', strict: true }],
  [/^(?:i\s+)?(?:use|eat|consume|apply)\s+/i, { kind: 'use', strict: false }],
  [/^(?:i\s+)?(?:equip|wield|don|ready)\s+/i, { kind: 'equip', strict: true }],
  [/^(?:i\s+)?(?:wear|put\s+on|draw)\s+/i, { kind: 'equip', strict: false }],
  [/^(?:i\s+)?(?:unequip|take\s+off|doff|remove|sheathe|stow|unwield)\s+/i, { kind: 'unequip', strict: true }],
  [/^(?:i\s+)?(?:drop|discard|throw\s+away|ditch)\s+/i, { kind: 'drop', strict: false }],
  [/^(?:i\s+)?(?:inspect|examine|check|look\s+at|study)\s+(?:my\s+)/i, { kind: 'inspect', strict: true }],
  [/^(?:i\s+)?(?:inspect|examine|look\s+at|study)\s+/i, { kind: 'inspect', strict: false }],
];

const STOP = new Set(['a', 'an', 'the', 'my', 'some', 'of', 'this', 'that', 'it', 'one', 'your']);
function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t))
    .map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t));
}

/** Best inventory match for a typed object phrase (null if none fits). */
export function findInventoryItem(state: CampaignState, phrase: string): InventoryItem | null {
  return findItemIn(state.inventory.items, phrase);
}

export function findItemIn(items: InventoryItem[], phrase: string): InventoryItem | null {
  const want = tokens(phrase);
  if (want.length === 0) return null;
  let best: InventoryItem | null = null;
  let bestScore = 0;
  for (const it of items) {
    const have = tokens(it.name);
    const hits = want.filter((w) => have.includes(w)).length;
    if (hits === 0) continue;
    // All typed words present beats partial; fewer extra name words wins ties.
    const score = (hits === want.length ? 100 : 0) + hits * 10 - (have.length - hits);
    if (score > bestScore) {
      best = it;
      bestScore = score;
    }
  }
  return best;
}

export function parseItemCommand(text: string): { verb: ItemVerb; object: string } | null {
  for (const [re, verb] of ITEM_VERBS) {
    const m = text.match(re);
    if (m) {
      const object = text.slice(m[0].length).replace(/[.!?;,]+$/, '').trim();
      if (object) return { verb, object };
    }
  }
  return null;
}

/** Typed asks for free stuff (QA-01 P1-4). */
const FREE_GOLD_RE = /\b(?:find|gain|earn|loot|collect|take|grab|steal|get|pocket|conjure|summon)\s+(?:\d[\d,]*|a\s+(?:pile|sack|bag|chest|pouch)\s+of)\s*(?:gold|coins?|gp|money)\b/i;
const TAKE_RE = /^(?:i\s+)?(?:take|grab|pick\s+up|loot|pocket|steal|claim|snatch|swipe)\s+(.+)$/i;
const TAKE_IDIOM_RE =
  /^(?:a\s+|the\s+|my\s+|some\s+)?(?:(?:long|short|quick|deep)\s+)?(?:look|looks|seat|moment|breath|breather|rest|nap|break|walk|stroll|chance|risk|turn|step|stand|note|notes|stock|aim|cover|heart|pace|drink|bite|sip|quest|job|work|it|on|in|off|over|up|time|lead|charge|watch|guard|position|place|stairs|road|path|exit|door|way|offer|deal|hint|advice|hand|knee)\b/i;

const BUY_RE = /^(?:i\s+)?(?:buy|purchase)\s+(.+?)(?:\s+from\s+[\w\s'’]+)?[.!?]*$/i;
const SELL_RE = /^(?:i\s+)?sell\s+(.+?)(?:\s+to\s+[\w\s'’]+)?[.!?]*$/i;

// ── handlers ───────────────────────────────────────────────────────────────

/** Nice-to-have: "buy rations" / "sell my torch" trade one unit right away (shop opens too). */
function typedBuySell(campaign: CampaignSave, text: string, kind: 'buy' | 'sell', phrase: string, now: number): RoutedInput | null {
  const state = campaignToState(campaign);
  const def = merchantForLocation(state.locationId);
  if (!def) return null; // generic trade path answers "no one here is selling"
  const open = openShopAt(state);
  const openPatch = open.patch ?? {};
  const item = kind === 'buy' ? findItemIn(merchantState(state, def.id).stock, phrase) : findInventoryItem(state, phrase);
  if (!item) {
    const msg =
      kind === 'buy'
        ? `${def.keeper} has no ${bareItemName(phrase)} for sale. ${def.greeting}`
        : `You don't have any ${bareItemName(phrase)} to sell.`;
    return { campaign: beat(campaign, openPatch, msg, text, now), route: 'trade', ok: false, message: msg };
  }
  const result = resolveTrade(state, { kind, merchantId: def.id, itemId: item.id });
  const patch = result.ok && result.patch ? { ...result.patch, ...openPatch } : openPatch;
  const prose = result.ok ? (result.narration ?? result.message) : result.message;
  return { campaign: beat(campaign, patch, prose, text, now), route: 'trade', ok: result.ok, message: result.message };
}

export function inventoryLine(state: CampaignState): string {
  const items = state.inventory.items;
  const list =
    items.length === 0
      ? 'Your pack is empty.'
      : `Your pack: ${items
          .map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}${i.equipped ? ' (equipped)' : ''}`)
          .join(', ')}.`;
  const lo = equippedLoadout(state.inventory);
  return `${list} Gold: ${state.inventory.gold}. HP ${state.combat.hp ?? '?'}/${state.combat.maxHp ?? '?'}, AC ${playerArmorClass(state, 'none')}${lo.weapon ? `, wielding ${lo.weapon.name.toLowerCase()}` : ''}.`;
}

export const HELP_LINE =
  'Type what you do. Some things the rules handle directly: travel ("go to Emberford", "leave"), "where am I", "inventory", "drink a healing potion", "equip shortsword", "drop torch", "short rest", "rent a room" (5 gold at the Copper Kettle), "level up", "raise strength", "trade" with a shopkeeper, and "look for trouble" where foes roam (Ashen Fields, the vale road, the Kettle cellar). In a fight: attack, cast, defend, dodge, use an item, or flee.';

function restHere(campaign: CampaignSave, text: string, long: boolean, now: number): RoutedInput {
  const state = campaignToState(campaign);
  const hp = state.combat.hp ?? 0;
  const max = state.combat.maxHp ?? 0;
  if (state.combat.inCombat) {
    const msg = `No resting with ${state.combat.foe ? state.combat.foe.name.toLowerCase() : 'an enemy'} in front of you.`;
    return { campaign: beat(campaign, {}, msg, text, now), route: 'rest', ok: false, message: msg };
  }
  if (long) {
    if (!INN_LOCATIONS.includes(state.locationId ?? '')) {
      const msg = `There's no bed to rent here — the Copper Kettle lets rooms for ${LONG_REST_COST} gold. You could take a short rest instead.`;
      return { campaign: beat(campaign, {}, msg, text, now), route: 'rest', ok: false, message: msg };
    }
    if (state.inventory.gold < LONG_REST_COST) {
      const msg = `Hollis shakes his head: a room is ${LONG_REST_COST} gold and you have ${state.inventory.gold}. A short rest by the hearth costs nothing.`;
      return { campaign: beat(campaign, {}, msg, text, now), route: 'rest', ok: false, message: msg };
    }
    const purse = merchantState(state, INN_MERCHANT_ID);
    const msg = `You pay Hollis ${LONG_REST_COST} gold and sleep the night through upstairs. You wake rested: ${max}/${max} HP.`;
    const patch: CampaignStatePatch = {
      spendGold: LONG_REST_COST,
      merchants: { [INN_MERCHANT_ID]: { ...purse, gold: purse.gold + LONG_REST_COST } },
      combat: { hp: max },
      flags: { [SHORT_RESTS_FLAG]: 0 },
      // TABS-01: Hollis remembers paying guests.
      npcMet: { id: 'npc.hollis', locationId: state.locationId, note: `Rented you a room for ${LONG_REST_COST} gold.` },
    };
    return { campaign: beat(campaign, patch, msg, text, now, true), route: 'rest', ok: true, message: msg };
  }
  const used = Number(state.flags[SHORT_RESTS_FLAG]) || 0;
  if (used >= MAX_SHORT_RESTS) {
    const msg = `You've rested as much as a short break allows. You need a proper night's sleep — a room at the Copper Kettle is ${LONG_REST_COST} gold.`;
    return { campaign: beat(campaign, {}, msg, text, now), route: 'rest', ok: false, message: msg };
  }
  const heal = Math.max(1, Math.ceil(max * SHORT_REST_FRACTION));
  const next = Math.min(max, hp + heal);
  const msg =
    next > hp
      ? `You sit a while, catch your breath and bind your scrapes. +${next - hp} HP (${next}/${max}).`
      : `You sit a while. You were already at full strength (${max}/${max}); time passes all the same.`;
  const patch: CampaignStatePatch = { combat: { hp: next }, flags: { [SHORT_RESTS_FLAG]: used + 1 } };
  return { campaign: beat(campaign, patch, msg, text, now, true), route: 'rest', ok: true, message: msg };
}

function runItem(
  campaign: CampaignSave,
  text: string,
  cmd: { verb: ItemVerb; object: string },
  now: number,
  rng?: () => number,
): RoutedInput | null {
  const state = campaignToState(campaign);
  const item = findInventoryItem(state, cmd.object);
  if (!item) {
    if (!cmd.verb.strict) return null;
    const msg = `You don't have any ${bareItemName(cmd.object)}. ${inventoryLine(state)}`;
    return { campaign: beat(campaign, {}, msg, text, now), route: 'item', ok: false, message: msg };
  }
  let req: ItemActionRequest;
  if (cmd.verb.kind === 'equip' || cmd.verb.kind === 'unequip') {
    const wantOn = cmd.verb.kind === 'equip';
    if (!itemTraits(item).slot) {
      const msg = `${item.name} isn't something you can wear or wield.`;
      return { campaign: beat(campaign, {}, msg, text, now), route: 'item', ok: false, message: msg };
    }
    if (Boolean(item.equipped) === wantOn) {
      const msg = wantOn ? `${item.name} is already equipped.` : `${item.name} isn't equipped.`;
      return { campaign: beat(campaign, {}, msg, text, now), route: 'item', ok: false, message: msg };
    }
    req = { kind: 'equip', itemId: item.id };
  } else {
    req = { kind: cmd.verb.kind, itemId: item.id };
  }
  if (state.combat.inCombat && req.kind !== 'inspect') {
    // Nice-to-have: changing kit mid-fight costs the round (foe acts).
    const r = applyItemActionWithTurn(campaign, req, { now, playerLine: text, ...(rng ? { rng } : {}) });
    if (!r.result.ok) {
      return { campaign: beat(campaign, {}, r.result.message, text, now), route: 'item', ok: false, message: r.result.message };
    }
    return { campaign: r.campaign, route: 'item', ok: true, message: r.result.message, ...(r.turn ? { outcome: r.turn.outcome } : {}) };
  }
  const result = resolveItemAction(state, req);
  const prose = result.narration ?? result.message;
  let patch: CampaignStatePatch = result.ok && result.patch ? result.patch : {};
  if (patch.combat) patch = { ...patch, combat: { ...state.combat, ...patch.combat } };
  return { campaign: beat(campaign, patch, prose, text, now), route: 'item', ok: result.ok, message: result.message };
}

function runProgression(campaign: CampaignSave, text: string, req: ProgressionRequest, now: number): RoutedInput {
  const state = campaignToState(campaign);
  const result = resolveProgressionAction(state, req);
  let prose = result.narration ?? result.message;
  if (result.ok && result.narration) prose = `${result.narration} (${result.message})`;
  if (!result.ok && req.kind === 'level-up') {
    const s = progressionSummary(state);
    if (s.unspentPoints > 0) prose += ` You have ${s.unspentPoints} ability point${s.unspentPoints === 1 ? '' : 's'} to spend ("raise strength").`;
  }
  const patch = result.ok && result.patch ? result.patch : {};
  return { campaign: beat(campaign, patch, prose, text, now), route: 'progression', ok: result.ok, message: result.message };
}

/**
 * Route typed text. Returns null when the narrator should handle it.
 * Order: info → (combat: fight actions / block everything else) → rest →
 * no-fight exits → progression → items → free-loot refusals → fight entry → trade.
 */
export function routePlayerInput(
  campaign: CampaignSave,
  raw: string,
  opts: { map: MapGraph; now?: number; rng?: () => number },
): RoutedInput | null {
  const text = clampPlayerInput(raw);
  if (!text) return null;
  const now = opts.now ?? Date.now();
  const state = campaignToState(campaign);
  const loc = state.locationId ?? opts.map.startNodeId;
  const info = (msg: string): RoutedInput => ({ campaign: beat(campaign, {}, msg, text, now), route: 'info', ok: true, message: msg });

  if (HELP_RE.test(text)) return info(HELP_LINE);
  if (INVENTORY_RE.test(text)) return info(inventoryLine(state));

  if (state.combat.inCombat) {
    const foe = state.combat.foe;
    const foeName = foe ? foe.name.toLowerCase() : 'your foe';
    if (WHERE_RE.test(text)) {
      let line = 'You are mid-fight.';
      try {
        line = whereAmI(opts.map, loc).line;
      } catch {
        /* unknown node: keep the plain line */
      }
      return info(`${line} The ${foeName} is still on you — you can't leave until you flee.`);
    }
    if (LONG_REST_RE.test(text) || SHORT_REST_RE.test(text)) return restHere(campaign, text, false, now);
    if (LEVEL_UP_RE.test(text) || SPEND_RE.test(text)) {
      const msg = 'Not mid-fight — finish the combat first.';
      return { campaign: beat(campaign, {}, msg, text, now), route: 'progression', ok: false, message: msg };
    }
    const cmd = parseItemCommand(text);
    if (cmd) {
      const r = runItem(campaign, text, cmd, now, opts.rng);
      if (r) return r;
    }
    const fight = applyCombatIntent(campaign, text, { now, ...(opts.rng ? { rng: opts.rng } : {}) });
    if (fight) return { campaign: fight.campaign, route: 'combat', ok: fight.result.ok, message: fight.result.message, outcome: fight.result.outcome };
    // QA-01 P1-2: nothing else slips through mid-fight (no travel, no waiting it out).
    const travel = detectTravelIntent(text, opts.map, loc).kind !== 'none' || /^(?:i\s+)?(?:leave|go|head|walk|exit|travel|return)\b/i.test(text);
    const waiting = /^(?:i\s+)?(?:wait|do\s+nothing|stand\s+still|pass|hold\s+on)\b/i.test(text);
    const msg = travel
      ? `You can't just walk away — the ${foeName} is on you. Flee (a DEX check) or fight on.`
      : waiting
        ? `No time to wait — the ${foeName} won't. Attack, Cast, Defend, Dodge, Use Item, or Flee.`
        : `The ${foeName} is still on you. Attack, Cast, Defend, Dodge, Use Item, or Flee.`;
    return { campaign: beat(campaign, {}, msg, text, now), route: 'combat-blocked', ok: false, message: msg };
  }

  if (LONG_REST_RE.test(text)) return restHere(campaign, text, true, now);
  if (SHORT_REST_RE.test(text)) return restHere(campaign, text, false, now);

  if (NO_FIGHT_EXIT_RE.test(text) && detectTravelIntent(text, opts.map, loc).kind !== 'travel') {
    const msg = "There's no fight to walk away from. You're steady where you stand.";
    return { campaign: beat(campaign, {}, msg, text, now), route: 'no-fight', ok: false, message: msg };
  }

  if (LEVEL_UP_RE.test(text)) return runProgression(campaign, text, { kind: 'level-up' }, now);
  const spend = text.match(SPEND_RE);
  if (spend?.[1]) {
    const key = spend[1].toLowerCase();
    const ability = ABILITIES[key] ?? ABILITIES[key.slice(0, 3)];
    if (ability) return runProgression(campaign, text, { kind: 'spend-point', ability }, now);
  }

  const cmd = parseItemCommand(text);
  if (cmd) {
    const r = runItem(campaign, text, cmd, now);
    if (r) return r;
  }

  if (FREE_GOLD_RE.test(text)) {
    const msg = "You look, but gold doesn't turn up just because you want it to. Coin comes from fights, quests and trade.";
    return { campaign: beat(campaign, {}, msg, text, now), route: 'no-loot', ok: false, message: msg };
  }
  const take = text.match(TAKE_RE);
  if (take?.[1] && !TAKE_IDIOM_RE.test(take[1]) && detectTravelIntent(text, opts.map, loc).kind === 'none' && !detectTradeIntent(text)) {
    const obj = take[1].replace(/[.!?]+$/, '').trim();
    const msg = `There's no ${bareItemName(obj)} here for the taking. Gear comes from fights, quests and the Emberford shops.`;
    return { campaign: beat(campaign, {}, msg, text, now), route: 'no-loot', ok: false, message: msg };
  }

  const fight = applyCombatIntent(campaign, text, { now, ...(opts.rng ? { rng: opts.rng } : {}) });
  if (fight) return { campaign: fight.campaign, route: 'combat', ok: fight.result.ok, message: fight.result.message, outcome: fight.result.outcome };

  const typedTrade = text.match(BUY_RE) ?? text.match(SELL_RE);
  if (typedTrade?.[1] && detectTravelIntent(text, opts.map, loc).kind === 'none') {
    const r = typedBuySell(campaign, text, /^(?:i\s+)?sell\b/i.test(text) ? 'sell' : 'buy', typedTrade[1], now);
    if (r) return r;
  }

  if (detectTradeIntent(text) && detectTravelIntent(text, opts.map, loc).kind === 'none') {
    const r = applyOpenShop(campaign, text, now);
    return { campaign: r.campaign, route: 'trade', ok: r.ok, message: r.ok ? 'Shop open.' : 'No shop here.' };
  }
  return null;
}

