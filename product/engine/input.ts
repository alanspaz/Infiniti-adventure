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
  withBeatPatch,
  type BeatExtras,
  type ItemActionRequest,
} from './items';
import { npcsAt, type NpcDef } from './npcs';
import {
  COMBAT_BLOCKED,
  CUSTOM,
  MERCHANT_TALK,
  NPC_KEEPER_NOTES,
  NPC_MENTIONS,
  QUEST_FIRST_STEPS_MORE,
  REST_LONG,
  REST_SHORT,
  WHERE_AM_I_COMBAT,
  listJoinWords,
  numberWord,
  type Bank,
  type MerchantId,
  type NodeId,
  type NpcId,
  type RecentEvent,
} from './narration/lineBanks';
import {
  foeTokens,
  hashSeed,
  itemWord,
  mechanicsLineFor,
  recordCtxFor,
  recordLine,
  voiceFor,
  type MechanicsDelta,
  type Voice,
} from './narration/voice';
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
  | 'trade'
  | 'talk';

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

/** Extras for one routed beat: the voice (its anti-repeat ids), mechanics and the event. */
type RouteExtras = {
  voice?: Voice | null;
  mechanics?: MechanicsDelta | null;
  mechanicsLine?: string | null;
  narrFlags?: Record<string, string> | null;
  event?: RecentEvent | null;
};

function beat(
  campaign: CampaignSave,
  patch: CampaignStatePatch,
  prose: string,
  playerLine: string,
  now: number,
  advanceTurn = false,
  x: RouteExtras = {},
): CampaignSave {
  const state = campaignToState(campaign);
  const turnAfter = campaign.session.turn + (advanceTurn ? 1 : 0);
  const extras: BeatExtras = {
    mechanicsLine: x.mechanicsLine ?? mechanicsLineFor(x.mechanics),
    narrFlags: { ...(x.voice ? x.voice.flags() : {}), ...(x.narrFlags ?? {}) },
    event: x.event ?? null,
    turnAfter,
  };
  const withTurn: CampaignStatePatch = advanceTurn
    ? { ...patch, session: { ...(patch.session ?? {}), turn: campaign.session.turn + 1 } }
    : patch;
  return applyCampaignPatch(campaign, withBeatPatch(withTurn, itemNarrationPatch(state, prose, playerLine, now, extras)));
}

/** First word of an NPC's name ("Dagna Brightanvil" → "Dagna"). */
function npcShort(n: NpcDef): string {
  return n.name.split(/\s+/)[0] ?? n.name;
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

const TALK_RE = /^(?:i\s+)?(?:talk|speak|chat|ask|greet|say\s+hello)(?:\s+(?:to|with|at))?(?:\s+(.+?))?[.!?]*$/i;

/** NARR-04 §3: "talk to Hollis" / bare "talk" with one person here. null → narrator. */
function routeTalk(campaign: CampaignSave, state: CampaignState, text: string, now: number, voice: Voice): RoutedInput | null {
  const m = text.match(TALK_RE);
  if (!m) return null;
  const here = npcsAt(state.locationId);
  if (here.length === 0) return null;
  const who = (m[1] ?? '').toLowerCase().replace(/^(?:the|a|an)\s+/, '').split(/\s+about\s+/)[0]!.trim();
  let npc: NpcDef | null = null;
  if (!who || /^(?:him|her|them|someone|anyone|people|folk)$/.test(who)) {
    npc = here.length === 1 ? here[0]! : null;
  } else {
    npc =
      here.find((n) => {
        const name = n.name.toLowerCase();
        const role = n.role.toLowerCase().split(/\s+/)[0] ?? '';
        return name.includes(who) || who.includes(name.split(/\s+/)[0]!) || (role && who.includes(role));
      }) ?? null;
  }
  if (!npc) return null;
  const id = npc.id as NpcId;
  const short = npcShort(npc);
  let prose: string | null = null;

  // 2. First steps: Hollis nudges you out the door about one time in three.
  const firstSteps = state.quests.some((q) => q.id === 'quest-first-steps' && q.status === 'active');
  if (firstSteps && id === 'npc.hollis') {
    if (hashSeed(campaign.id, campaign.session.turn, state.storyBeats.length, 'talk.remind') % 3 === 0) prose = voice.say('talk.remind', QUEST_FIRST_STEPS_MORE.remind, {});
  }

  // 3. A spoken hint, preferring a place you know of but haven't been.
  if (!prose) {
    const places = state.chronicle.places;
    const mentions = npc.mentions
      .map((mn) => ({ mn, rec: places[mn.placeId] }))
      .filter((x) => NPC_MENTIONS[id]?.[x.mn.placeId as NodeId]);
    const known = mentions.filter((x) => !x.rec || x.rec.status !== 'visited');
    const pool = known.length ? known : mentions;
    if (pool.length) {
      const idx = Math.abs(state.storyBeats.length + campaign.session.turn) % pool.length;
      const pick = pool[idx]!;
      const bank = NPC_MENTIONS[id]![pick.mn.placeId as NodeId]!.spoken;
      const placeSeen = pick.rec ? (pick.rec.status === 'visited' ? 'visited' : 'known') : 'unknown';
      prose = voice.say(`talk.mention.${id}`, bank, {}, {
        ctx: { placeSeen, wonThere: (pick.rec?.victories ?? 0) > 0 },
      });
      // Every other talk falls through to the keeper's own lines so it doesn't only ever hint.
      if (known.length === 0 && idx % 2 === 1) prose = null;
    }
  }

  // 4. Keeper talk: hurt / after a fight / first greeting / small talk.
  if (!prose && npc.merchantId && MERCHANT_TALK[npc.merchantId as MerchantId]) {
    const t = MERCHANT_TALK[npc.merchantId as MerchantId];
    const met = Boolean(state.chronicle.npcs[npc.id]);
    const recent = voice.ctx.recentEvent;
    const banks: Bank[] = [];
    if (voice.ctx.hpLow) banks.push(t.hurt);
    if (recent === 'justFought' || recent === 'justLost') banks.push(t.afterFight);
    banks.push(met ? t.smallTalk : t.greet, t.smallTalk);
    prose = voice.say(`talk.${npc.merchantId}`, banks, {});
  }
  if (!prose) prose = `${short} nods at you, and goes back to work.`;
  const patch: CampaignStatePatch = { npcMet: { id: npc.id, locationId: state.locationId } };
  return {
    campaign: beat(campaign, patch, prose, text, now, false, { voice }),
    route: 'talk',
    ok: true,
    message: `You talk with ${short}.`,
  };
}

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
  const keeper = def.keeper.split(' ')[0] ?? def.keeper;
  const item = kind === 'buy' ? findItemIn(merchantState(state, def.id).stock, phrase) : findInventoryItem(state, phrase);
  if (!item) {
    const what = itemWord(bareItemName(phrase)) || 'that';
    const msg =
      kind === 'buy'
        ? `${keeper} has no ${what} for sale. ${open.narration ?? def.greeting}`
        : `You don't have any ${what} to sell.`;
    return {
      campaign: beat(campaign, openPatch, msg, text, now, false, { narrFlags: open.narrFlags ?? null }),
      route: 'trade',
      ok: false,
      message: msg,
    };
  }
  const result = resolveTrade(state, { kind, merchantId: def.id, itemId: item.id });
  const patch = result.ok && result.patch ? withBeatPatch(result.patch, openPatch) : openPatch;
  const prose = result.narration ?? result.message;
  return {
    campaign: beat(campaign, patch, prose, text, now, false, {
      mechanicsLine: result.ok ? result.mechanicsLine ?? null : null,
      narrFlags: { ...(open.narrFlags ?? {}), ...(result.narrFlags ?? {}) },
      event: result.ok ? 'justTraded' : null,
    }),
    route: 'trade',
    ok: result.ok,
    message: result.message,
  };
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

/** NARR-04: Tale prose for "inventory" — no numbers (they go on the mechanics line). */
/** "healing potion" → "healing potions"; already-plural names ("trail rations") stay. */
function pluralWord(w: string): string {
  if (/s$/i.test(w)) return w;
  if (/[^aeiou]y$/i.test(w)) return `${w.slice(0, -1)}ies`;
  if (/(ch|sh|x)$/i.test(w)) return `${w}es`;
  return `${w}s`;
}

export function inventoryProse(state: CampaignState): string {
  const items = state.inventory.items;
  if (items.length === 0) return 'Your pack is empty.';
  const names = items.map((i) => {
    const w = itemWord(i.name);
    const counted = i.qty > 1 ? `${numberWord(i.qty, 'a stack of')} ${pluralWord(w)}` : w;
    return i.equipped ? `${counted}, in hand` : counted;
  });
  const lo = equippedLoadout(state.inventory);
  return `You go through your pack: ${listJoinWords(names)}.${lo.weapon ? ` You're wielding your ${itemWord(lo.weapon.name)}.` : ''}`;
}

/** NARR-04: the numbers for the inventory beat. */
export function inventoryMechanics(state: CampaignState): string {
  const parts = [
    `Gold ${state.inventory.gold}`,
    `HP ${state.combat.hp ?? '?'}/${state.combat.maxHp ?? '?'}`,
    `AC ${playerArmorClass(state, 'none')}`,
    ...state.inventory.items.filter((i) => i.qty > 1).map((i) => `${i.name} ×${i.qty}`),
  ];
  return parts.join(' · ');
}

/** NARR-04: number-free help prose (HELP_LINE stays the panel message). */
export const HELP_PROSE =
  'Type what you do. Some things the rules handle directly: travel ("go to Emberford", "leave"), "where am I", "inventory", "talk to Hollis", "drink a healing potion", "equip shortsword", "drop torch", "short rest", "rent a room" at the Copper Kettle, "level up", "raise strength", "trade" with a shopkeeper, and "look for trouble" where foes roam (Ashen Fields, the vale road, the Kettle cellar). In a fight: attack, cast, defend, dodge, use an item, or flee.';

export const HELP_LINE =
  'Type what you do. Some things the rules handle directly: travel ("go to Emberford", "leave"), "where am I", "inventory", "drink a healing potion", "equip shortsword", "drop torch", "short rest", "rent a room" (5 gold at the Copper Kettle), "level up", "raise strength", "trade" with a shopkeeper, and "look for trouble" where foes roam (Ashen Fields, the vale road, the Kettle cellar). In a fight: attack, cast, defend, dodge, use an item, or flee.';

function restHere(campaign: CampaignSave, text: string, long: boolean, now: number): RoutedInput {
  const state = campaignToState(campaign);
  const voice = voiceFor(state);
  const hp = state.combat.hp ?? 0;
  const max = state.combat.maxHp ?? 0;
  const roomNote = `Room · ${LONG_REST_COST} gold at the Copper Kettle`;
  const fail = (msg: string, prose: string | null, mechanics: MechanicsDelta | null = null): RoutedInput => ({
    campaign: beat(campaign, {}, prose ?? msg, text, now, false, { voice, mechanics }),
    route: 'rest',
    ok: false,
    message: msg,
  });
  if (state.combat.inCombat) {
    const msg = `No resting with ${state.combat.foe ? state.combat.foe.name.toLowerCase() : 'an enemy'} in front of you.`;
    return fail(msg, voice.say('rest.inCombat', REST_SHORT.inCombat, foeTokens(state.combat.foe?.name)));
  }
  if (long) {
    if (!INN_LOCATIONS.includes(state.locationId ?? '')) {
      const msg = `There's no bed to rent here — the Copper Kettle lets rooms for ${LONG_REST_COST} gold. You could take a short rest instead.`;
      return fail(msg, voice.say('rest.notInn', REST_LONG.notInn, {}), { notes: [roomNote] });
    }
    if (state.inventory.gold < LONG_REST_COST) {
      const msg = `Hollis shakes his head: a room is ${LONG_REST_COST} gold and you have ${state.inventory.gold}. A short rest by the hearth costs nothing.`;
      return fail(msg, voice.say('rest.cantAfford', REST_LONG.cantAfford, {}), { notes: [roomNote, `Gold ${state.inventory.gold}`] });
    }
    const purse = merchantState(state, INN_MERCHANT_ID);
    const msg = `You pay Hollis ${LONG_REST_COST} gold and sleep the night through upstairs. You wake rested: ${max}/${max} HP.`;
    const rc = recordCtxFor(campaign.id, campaign.playstylePackId);
    const note = recordLine(NPC_KEEPER_NOTES['npc.hollis'].rented, rc, `rented:${campaign.session.turn}`);
    const patch: CampaignStatePatch = {
      spendGold: LONG_REST_COST,
      merchants: { [INN_MERCHANT_ID]: { ...purse, gold: purse.gold + LONG_REST_COST } },
      combat: { hp: max },
      flags: { [SHORT_RESTS_FLAG]: 0 },
      // TABS-01: Hollis remembers paying guests (NARR-04 copy, no numbers).
      npcMet: { id: 'npc.hollis', locationId: state.locationId, ...(note ? { note } : {}) },
    };
    const prose = voice.say('rest.long', REST_LONG.slept, {}) ?? msg;
    return {
      campaign: beat(campaign, patch, prose, text, now, true, {
        voice,
        mechanics: { gold: -LONG_REST_COST, hp: max, hpMax: max },
        event: 'justRested',
      }),
      route: 'rest',
      ok: true,
      message: msg,
    };
  }
  const used = Number(state.flags[SHORT_RESTS_FLAG]) || 0;
  if (used >= MAX_SHORT_RESTS) {
    const msg = `You've rested as much as a short break allows. You need a proper night's sleep — a room at the Copper Kettle is ${LONG_REST_COST} gold.`;
    return fail(msg, voice.say('rest.limit', REST_SHORT.limit, {}), { notes: [roomNote] });
  }
  const heal = Math.max(1, Math.ceil(max * SHORT_REST_FRACTION));
  const next = Math.min(max, hp + heal);
  const msg =
    next > hp
      ? `You sit a while, catch your breath and bind your scrapes. +${next - hp} HP (${next}/${max}).`
      : `You sit a while. You were already at full strength (${max}/${max}); time passes all the same.`;
  const prose =
    (next > hp ? voice.say('rest.short', REST_SHORT.healed, {}) : voice.say('rest.full', REST_SHORT.alreadyFull, {})) ?? msg;
  const patch: CampaignStatePatch = { combat: { hp: next }, flags: { [SHORT_RESTS_FLAG]: used + 1 } };
  return {
    campaign: beat(campaign, patch, prose, text, now, true, {
      voice,
      mechanics: next > hp ? { hpChange: next - hp, hp: next, hpMax: max } : { hp: next, hpMax: max },
      event: 'justRested',
    }),
    route: 'rest',
    ok: true,
    message: msg,
  };
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
    const prose = `You don't have any ${itemWord(bareItemName(cmd.object)) || 'of that'}. ${inventoryProse(state)}`;
    return {
      campaign: beat(campaign, {}, prose, text, now, false, { mechanicsLine: inventoryMechanics(state) }),
      route: 'item',
      ok: false,
      message: msg,
    };
  }
  let req: ItemActionRequest;
  if (cmd.verb.kind === 'equip' || cmd.verb.kind === 'unequip') {
    const wantOn = cmd.verb.kind === 'equip';
    if (!itemTraits(item).slot) {
      const msg = `${item.name} isn't something you can wear or wield.`;
      const prose = `Your ${itemWord(item.name)} isn't something you can wear or wield.`;
      return { campaign: beat(campaign, {}, prose, text, now), route: 'item', ok: false, message: msg };
    }
    if (Boolean(item.equipped) === wantOn) {
      const msg = wantOn ? `${item.name} is already equipped.` : `${item.name} isn't equipped.`;
      const w = itemWord(item.name);
      const prose = wantOn ? `Your ${w} is already in hand.` : `Your ${w} isn't equipped.`;
      return { campaign: beat(campaign, {}, prose, text, now), route: 'item', ok: false, message: msg };
    }
    req = { kind: 'equip', itemId: item.id };
  } else {
    req = { kind: cmd.verb.kind, itemId: item.id };
  }
  if (state.combat.inCombat && req.kind !== 'inspect') {
    // Nice-to-have: changing kit mid-fight costs the round (foe acts).
    const r = applyItemActionWithTurn(campaign, req, { now, playerLine: text, ...(rng ? { rng } : {}) });
    if (!r.result.ok) {
      return {
        campaign: beat(campaign, {}, r.result.narration ?? r.result.message, text, now, false, { narrFlags: r.result.narrFlags ?? null }),
        route: 'item',
        ok: false,
        message: r.result.message,
      };
    }
    return { campaign: r.campaign, route: 'item', ok: true, message: r.result.message, ...(r.turn ? { outcome: r.turn.outcome } : {}) };
  }
  const result = resolveItemAction(state, req);
  const prose = result.narration ?? result.message;
  let patch: CampaignStatePatch = result.ok && result.patch ? result.patch : {};
  if (patch.combat) patch = { ...patch, combat: { ...state.combat, ...patch.combat } };
  return {
    campaign: beat(campaign, patch, prose, text, now, false, {
      mechanicsLine: result.ok ? result.mechanicsLine ?? null : null,
      narrFlags: result.narrFlags ?? null,
    }),
    route: 'item',
    ok: result.ok,
    message: result.message,
  };
}

function runProgression(campaign: CampaignSave, text: string, req: ProgressionRequest, now: number): RoutedInput {
  const state = campaignToState(campaign);
  const result = resolveProgressionAction(state, req);
  // NARR-04: one message, not narration + "(message)"; numbers go on the mechanics line.
  let prose = result.narration ?? result.message;
  if (!result.ok && req.kind === 'level-up') {
    const s = progressionSummary(state);
    if (s.unspentPoints > 0) {
      prose += ` You have ${numberWord(s.unspentPoints)} ability point${s.unspentPoints === 1 ? '' : 's'} to spend ("raise strength").`;
    }
  }
  const patch = result.ok && result.patch ? result.patch : {};
  return {
    campaign: beat(campaign, patch, prose, text, now, false, {
      mechanicsLine: result.mechanicsLine ?? null,
      narrFlags: result.narrFlags ?? null,
    }),
    route: 'progression',
    ok: result.ok,
    message: result.message,
  };
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
  const voice = voiceFor(state);
  const info = (msg: string, prose: string = msg, mechanicsLine: string | null = null): RoutedInput => ({
    campaign: beat(campaign, {}, prose, text, now, false, { voice, mechanicsLine }),
    route: 'info',
    ok: true,
    message: msg,
  });

  if (HELP_RE.test(text)) return info(HELP_LINE, HELP_PROSE);
  if (INVENTORY_RE.test(text)) return info(inventoryLine(state), inventoryProse(state), inventoryMechanics(state));

  if (state.combat.inCombat) {
    const foe = state.combat.foe;
    const foeName = foe ? foe.name.toLowerCase() : 'your foe';
    const ft = foeTokens(foe?.name);
    if (WHERE_RE.test(text)) {
      let line = 'You are mid-fight.';
      try {
        line = whereAmI(opts.map, loc).line;
      } catch {
        /* unknown node: keep the plain line */
      }
      const prose = voice.say('where.combat', WHERE_AM_I_COMBAT, ft) ?? `${ft.Foe} is still on you.`;
      return info(`${line} The ${foeName} is still on you — you can't leave until you flee.`, prose);
    }
    if (LONG_REST_RE.test(text) || SHORT_REST_RE.test(text)) return restHere(campaign, text, false, now);
    if (LEVEL_UP_RE.test(text) || SPEND_RE.test(text)) {
      const msg = 'Not mid-fight — finish the combat first.';
      const prose = voice.say('combat.blocked', COMBAT_BLOCKED, ft) ?? msg;
      return { campaign: beat(campaign, {}, prose, text, now, false, { voice }), route: 'progression', ok: false, message: msg };
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
    const lead = voice.say('combat.blocked', COMBAT_BLOCKED, ft) ?? `${ft.Foe} is still on you.`;
    const prose = travel ? `${lead} Flee, or fight on.` : `${lead} Attack, Cast, Defend, Dodge, Use Item, or Flee.`;
    return { campaign: beat(campaign, {}, prose, text, now, false, { voice }), route: 'combat-blocked', ok: false, message: msg };
  }

  if (LONG_REST_RE.test(text)) return restHere(campaign, text, true, now);
  if (SHORT_REST_RE.test(text)) return restHere(campaign, text, false, now);

  // NARR-04 §3: talking to someone who is here.
  const talk = routeTalk(campaign, state, text, now, voice);
  if (talk) return talk;

  if (NO_FIGHT_EXIT_RE.test(text) && detectTravelIntent(text, opts.map, loc).kind !== 'travel') {
    const msg = "There's no fight to walk away from. You're steady where you stand.";
    const prose = voice.say('custom.fight', CUSTOM.fight, {}) ?? msg;
    return { campaign: beat(campaign, {}, prose, text, now, false, { voice }), route: 'no-fight', ok: false, message: msg };
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
    const prose = voice.say('custom.take', CUSTOM.take, {}) ?? msg;
    return { campaign: beat(campaign, {}, prose, text, now, false, { voice }), route: 'no-loot', ok: false, message: msg };
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

