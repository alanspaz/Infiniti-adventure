/**
 * P-INT-01 — Items panel actions as CampaignState mutations.
 *
 * Rules live here (state in → typed patch out). Narration only describes the
 * result after the fact (stub, offline, deterministic variety).
 */
import {
  applyCampaignPatch,
  campaignToState,
  normalizeInventoryItem,
  type CampaignState,
  type CampaignStatePatch,
  type InventoryItem,
  type InventoryState,
  type ItemEffect,
  type ItemSlot,
} from './campaignState';
import { abilityModifier } from './derived';
import type { CampaignSave, StoryBeatRecord } from './save';
import {
  EQUIP_SWAP_PREFIX,
  ITEM_DROP,
  ITEM_EQUIP,
  ITEM_QUEST_LOCKED,
  ITEM_UNEQUIP,
  ITEM_USE_FULL_HP,
  ITEM_USE_HEAL,
  ITEM_USE_NOTHING,
  type ItemNameKey,
  type RecentEvent,
} from './narration/lineBanks';
import { eventFlags, itemWord, mechanicsLineFor, placeRefFor, voiceFor, type Voice } from './narration/voice';

export type ItemActionKind = 'inspect' | 'use' | 'equip' | 'move' | 'drop';

export type ItemActionRequest =
  | { kind: 'inspect'; itemId: string }
  | { kind: 'use'; itemId: string }
  | { kind: 'equip'; itemId: string }
  | { kind: 'move'; itemId: string; delta: number }
  | { kind: 'drop'; itemId: string };

export type ItemActionResult = {
  ok: boolean;
  kind: ItemActionKind;
  /** Short panel-facing line (always set; honest about no-ops). */
  message: string;
  /** Structured state change; null for read-only / rejected actions. */
  patch: CampaignStatePatch | null;
  /** Narrator prose for the Tale when the action was meaningful. */
  narration: string | null;
  /** Player-side chat line paired with the narration. */
  playerLine: string | null;
  /** NARR-04: numbers for the beat (rendered under the prose). */
  mechanicsLine?: string | null;
  /** NARR-04: `narr.last.*` anti-repeat flags for the lines picked. */
  narrFlags?: Record<string, string>;
};

/** Keep in step with SceneScreen MAX_STORY_BEATS. */
export const MAX_ITEM_STORY_BEATS = 40;

export const STARTER_KIT_FLAG = 'starter_kit_granted';

/** Small, honest starter kit for playtesting Items (explicit unpack only). */
export const STARTER_KIT: InventoryItem[] = [
  {
    id: 'starter-shortsword',
    name: 'Shortsword',
    qty: 1,
    kind: 'gear',
    slot: 'weapon',
    damage: '1d6',
    description: 'A plain, well-kept blade. Balanced for quick cuts.',
  },
  {
    id: 'starter-leather-armor',
    name: 'Leather armor',
    qty: 1,
    kind: 'gear',
    slot: 'armor',
    armorBase: 11,
    description: 'Boiled leather, oiled against rain. AC 11 + DEX.',
  },
  {
    id: 'starter-healing-potion',
    name: 'Healing potion',
    qty: 2,
    kind: 'consumable',
    effect: { type: 'heal', amount: 4 },
    description: 'Red, faintly warm through the glass. Restores 4 HP.',
  },
  {
    id: 'starter-torch',
    name: 'Torch',
    qty: 1,
    kind: 'gear',
    description: 'Pitch-soaked wood. Light for dark places.',
  },
];

const HEAL_NAME_RE = /\b(potion|salve|bandage|elixir|tonic|draught)\b/i;
const WEAPON_NAME_RE =
  /\b(sword|shortsword|longsword|dagger|knife|axe|mace|club|spear|staff|bow|crossbow|hammer|rapier|scimitar|sling)\b/i;
const SHIELD_NAME_RE = /\b(shield|buckler)\b/i;
const ARMOR_NAME_RE = /\b(armor|armour|mail|leathers|brigandine|breastplate|gambeson)\b/i;

export type ItemTraits = {
  slot: ItemSlot | null;
  effect: ItemEffect | null;
  /** Armor base AC or shield bonus, when applicable. */
  armorBase: number | null;
  damage: string | null;
};

/** Resolve mechanical traits: explicit fields first, light name inference second. */
export function itemTraits(item: InventoryItem): ItemTraits {
  let slot: ItemSlot | null = item.slot ?? null;
  if (!slot && item.kind !== 'consumable' && item.kind !== 'quest') {
    if (SHIELD_NAME_RE.test(item.name)) slot = 'shield';
    else if (ARMOR_NAME_RE.test(item.name)) slot = 'armor';
    else if (WEAPON_NAME_RE.test(item.name)) slot = 'weapon';
  }
  let effect: ItemEffect | null = item.effect ?? null;
  if (!effect && !slot && item.kind !== 'quest' && HEAL_NAME_RE.test(item.name)) {
    effect = { type: 'heal', amount: 4 };
  }
  let armorBase: number | null = item.armorBase ?? null;
  if (armorBase === null && slot === 'armor') armorBase = 11;
  if (armorBase === null && slot === 'shield') armorBase = 2;
  return {
    slot,
    effect,
    armorBase,
    damage: item.damage ?? (slot === 'weapon' ? '1d4' : null),
  };
}

export type Loadout = {
  weapon: InventoryItem | null;
  armor: InventoryItem | null;
  shield: InventoryItem | null;
};

export function equippedLoadout(inv: InventoryState | null | undefined): Loadout {
  const out: Loadout = { weapon: null, armor: null, shield: null };
  for (const it of inv?.items ?? []) {
    if (!it.equipped) continue;
    const slot = itemTraits(it).slot;
    if (slot && !out[slot]) out[slot] = it;
  }
  return out;
}

/**
 * AC with gear (no new rules system): armor replaces the 10 base
 * (armorBase + DEX mod); a shield adds its bonus. Unarmored = 10 + DEX.
 */
export function armorClassWithGear(
  dexterityScore: number,
  inv: InventoryState | null | undefined,
): number {
  const dex = abilityModifier(dexterityScore);
  const { armor, shield } = equippedLoadout(inv);
  const base = armor ? (itemTraits(armor).armorBase ?? 10) : 10;
  const shieldBonus = shield ? (itemTraits(shield).armorBase ?? 2) : 0;
  return base + dex + shieldBonus;
}

function findItem(state: CampaignState, itemId: string): InventoryItem | null {
  return state.inventory.items.find((i) => i.id === itemId) ?? null;
}

const nameKey = (item: InventoryItem): ItemNameKey => item.name.trim().toLowerCase() as ItemNameKey;

/** Item line from a per-name bank with a generic fallback; `{item}` = lower-case name. */
function itemLine(voice: Voice, path: string, banks: Parameters<Voice['say']>[1], item: InventoryItem, state: CampaignState): string {
  return (
    voice.say(path, banks, { item: itemWord(item.name), place: placeRefFor(state.locationId) }) ??
    `You see to the ${itemWord(item.name)}.`
  );
}

function reject(
  kind: ItemActionKind,
  message: string,
  narration: string | null = null,
): ItemActionResult {
  return { ok: false, kind, message, patch: null, narration, playerLine: null };
}

/** Read-only description of an item (never mutates). */
export function describeItem(item: InventoryItem): string {
  const t = itemTraits(item);
  const parts: string[] = [];
  parts.push(item.description ?? `${item.name}.`);
  if (t.slot === 'weapon') parts.push(`Weapon · damage ${t.damage}.`);
  if (t.slot === 'armor') parts.push(`Armor · AC ${t.armorBase} + DEX.`);
  if (t.slot === 'shield') parts.push(`Shield · +${t.armorBase} AC.`);
  if (t.effect?.type === 'heal') parts.push(`Use: restores ${t.effect.amount} HP.`);
  if (!t.slot && !t.effect) {
    parts.push(
      item.kind === 'quest'
        ? 'Quest item — keep it safe.'
        : 'No direct use from the pack.',
    );
  }
  if (item.equipped) parts.push('Equipped.');
  if (item.qty > 1) parts.push(`You carry ${item.qty}.`);
  return parts.join(' ');
}

function withItems(items: InventoryItem[]): CampaignStatePatch {
  return { inventory: { items: items.map(normalizeInventoryItem) } };
}

/**
 * Pure rules: resolve an Items-panel action against current state.
 * Inspect is read-only (patch null). Rejected actions return patch null.
 */
export function resolveItemAction(
  state: CampaignState,
  req: ItemActionRequest,
): ItemActionResult {
  const item = findItem(state, req.itemId);
  if (!item) return reject(req.kind, 'That item is no longer in your pack.');
  const items = state.inventory.items;
  const traits = itemTraits(item);
  const voice = voiceFor(state);

  switch (req.kind) {
    case 'inspect':
      return {
        ok: true,
        kind: 'inspect',
        message: describeItem(item),
        patch: null,
        narration: null,
        playerLine: null,
      };

    case 'move': {
      const from = items.findIndex((i) => i.id === item.id);
      const to = Math.max(0, Math.min(items.length - 1, from + Math.trunc(req.delta)));
      if (to === from) return reject('move', `${item.name} is already there.`);
      const next = [...items];
      next.splice(from, 1);
      next.splice(to, 0, item);
      return {
        ok: true,
        kind: 'move',
        message: `Moved ${item.name} ${to < from ? 'up' : 'down'}.`,
        patch: withItems(next),
        narration: null,
        playerLine: null,
      };
    }

    case 'equip': {
      if (!traits.slot) {
        return reject('equip', `${item.name} isn't something you can wear or wield.`);
      }
      if (item.equipped) {
        const next = items.map((i) =>
          i.id === item.id ? { ...i, equipped: false } : i,
        );
        return {
          ok: true,
          kind: 'equip',
          message: `Unequipped ${item.name}.`,
          patch: withItems(next),
          narration: itemLine(voice, 'item.unequip', ITEM_UNEQUIP, item, state),
          playerLine: `Unequip ${item.name}`,
          narrFlags: voice.flags(),
        };
      }
      let swapped: InventoryItem | null = null;
      const next = items.map((i) => {
        if (i.id === item.id) return { ...i, equipped: true, slot: traits.slot! };
        if (i.equipped && itemTraits(i).slot === traits.slot) {
          swapped = i;
          return { ...i, equipped: false };
        }
        return i;
      });
      const swapName = (swapped as InventoryItem | null)?.name;
      const verb = traits.slot === 'weapon' ? 'wield' : 'wear';
      const slot = traits.slot as 'weapon' | 'armor' | 'shield';
      const base = itemLine(voice, `item.equip.${slot}`, [ITEM_EQUIP[nameKey(item)], ITEM_EQUIP[slot]], item, state);
      const swapLead = swapName
        ? voice.sayString('item.equip.swap', EQUIP_SWAP_PREFIX, { item: itemWord(swapName) })
        : null;
      return {
        ok: true,
        kind: 'equip',
        message: swapName
          ? `Equipped ${item.name} (replaced ${swapName}).`
          : `Equipped ${item.name}.`,
        patch: withItems(next),
        narration: swapLead ? `${swapLead} ${base}` : base,
        playerLine: `${verb === 'wield' ? 'Wield' : 'Wear'} ${item.name}`,
        narrFlags: voice.flags(),
      };
    }

    case 'use': {
      if (traits.effect?.type === 'heal') {
        const maxHp = state.combat.maxHp ?? 10;
        const hp = state.combat.hp ?? maxHp;
        if (hp >= maxHp) {
          // Panel message keeps the numbers; the Tale (if it logs this) gets the bank line.
          return reject(
            'use',
            `You're already at full health (${hp}/${maxHp}). ${item.name} kept.`,
            itemLine(voice, 'item.use.full', ITEM_USE_FULL_HP, item, state),
          );
        }
        const nextHp = Math.min(maxHp, hp + traits.effect.amount);
        const gained = nextHp - hp;
        const nextItems =
          item.qty > 1
            ? items.map((i) => (i.id === item.id ? { ...i, qty: i.qty - 1 } : i))
            : items.filter((i) => i.id !== item.id);
        const left = item.qty - 1;
        return {
          ok: true,
          kind: 'use',
          message: `${item.name}: +${gained} HP (${nextHp}/${maxHp}).${left > 0 ? ` ${left} left.` : ' None left.'}`,
          patch: {
            ...withItems(nextItems),
            combat: { hp: nextHp, maxHp },
          },
          narration: itemLine(voice, 'item.use.heal', [ITEM_USE_HEAL[nameKey(item)], ITEM_USE_HEAL.generic], item, state),
          playerLine: `Use ${item.name}`,
          mechanicsLine: mechanicsLineFor({
            hpChange: gained,
            hp: nextHp,
            hpMax: maxHp,
            qtyLeft: { name: item.name, qty: left },
          }),
          narrFlags: voice.flags(),
        };
      }
      if (traits.slot) {
        return reject(
          'use',
          `${item.name} isn't used up — equip it instead.`,
        );
      }
      return reject('use', `${item.name} has no use on its own.`, itemLine(voice, 'item.use.nothing', ITEM_USE_NOTHING, item, state));
    }

    case 'drop': {
      if (item.kind === 'quest') {
        return reject('drop', itemLine(voice, 'item.questLocked', ITEM_QUEST_LOCKED, item, state));
      }
      const nextItems = items.filter((i) => i.id !== item.id);
      const what = item.qty > 1 ? `${item.qty}× ${item.name}` : item.name;
      return {
        ok: true,
        kind: 'drop',
        message: `Dropped ${what}.`,
        patch: withItems(nextItems),
        narration: itemLine(voice, 'item.drop', [ITEM_DROP[nameKey(item)], ITEM_DROP.generic], item, state),
        playerLine: `Drop ${what}`,
        mechanicsLine: mechanicsLineFor({ itemsLost: [item.qty > 1 ? `${item.name} ×${item.qty}` : item.name] }),
        narrFlags: voice.flags(),
      };
    }
    default:
      return reject((req as ItemActionRequest).kind, 'Unknown item action.');
  }
}

export type BeatExtras = {
  /** Compact mechanics line (formatMechanicsLine) shown under the prose. */
  mechanicsLine?: string | null;
  /** `narr.last.*` anti-repeat flags from the voice that picked the prose. */
  narrFlags?: Record<string, string>;
  /** What just happened (drives recentEvent tags next beat). null clears it. */
  event?: RecentEvent | null;
  /** Turn after this beat (default: state.session.turn). */
  turnAfter?: number;
};

/** Append a narrator beat (player line + prose) to session story beats. */
export function itemNarrationPatch(
  state: CampaignState,
  narration: string,
  playerLine: string | null,
  now: number = Date.now(),
  extras: BeatExtras = {},
): CampaignStatePatch {
  const record: StoryBeatRecord = {
    id: `item-${state.session.turn}-${now}`,
    prose: narration,
    checkLine: null,
    stillCacheKey: null,
    placeLine: null,
    playerLine,
    ...(extras.mechanicsLine ? { mechanicsLine: extras.mechanicsLine } : {}),
  };
  const beats = [...state.storyBeats, record].slice(-MAX_ITEM_STORY_BEATS);
  return {
    storyBeats: beats,
    storyMeta: { beatCount: state.storyMeta.beatCount + 1 },
    flags: {
      ...(extras.narrFlags ?? {}),
      ...eventFlags(extras.event ?? null, extras.turnAfter ?? state.session.turn),
    },
  };
}

/** Merge a beat patch into an action patch without dropping either side's flags. */
export function withBeatPatch(patch: CampaignStatePatch, beat: CampaignStatePatch): CampaignStatePatch {
  return {
    ...patch,
    ...beat,
    ...(patch.flags || beat.flags ? { flags: { ...(patch.flags ?? {}), ...(beat.flags ?? {}) } } : {}),
  };
}

/**
 * Resolve + apply an item action to a save. Returns the next save (same
 * object when nothing changed) and the result for panel feedback.
 */
export function applyItemAction(
  campaign: CampaignSave,
  req: ItemActionRequest,
  now: number = Date.now(),
): { campaign: CampaignSave; result: ItemActionResult } {
  const state = campaignToState(campaign);
  const result = resolveItemAction(state, req);
  // TABS-01: inspecting records the item's lore once (the Gear tab shows it).
  // No beat, no turn, no other state change.
  if (req.kind === 'inspect' && result.ok && !result.patch) {
    const it = findItem(state, req.itemId);
    if (it && state.chronicle.items[it.id]?.lore !== result.message) {
      return {
        campaign: applyCampaignPatch(campaign, {
          itemLore: { itemId: it.id, text: result.message },
          ...(state.chronicle.items[it.id]
            ? {}
            : { itemObtained: { itemId: it.id, name: it.name, how: 'carried' as const, locationId: null } }),
        }),
        result,
      };
    }
  }
  if (!result.ok || !result.patch) return { campaign, result };
  let patch: CampaignStatePatch = result.patch;
  if (result.narration) {
    patch = withBeatPatch(
      patch,
      itemNarrationPatch(state, result.narration, result.playerLine, now, {
        mechanicsLine: result.mechanicsLine ?? null,
        narrFlags: result.narrFlags ?? {},
      }),
    );
  }
  if (patch.combat) {
    patch = { ...patch, combat: { ...state.combat, ...patch.combat } };
  }
  return { campaign: applyCampaignPatch(campaign, patch), result };
}

/** One-time starter kit unpack (flag-guarded; no-op if already granted). */
export function starterKitPatch(state: CampaignState): CampaignStatePatch | null {
  if (state.flags[STARTER_KIT_FLAG] === true) return null;
  const have = new Set(state.inventory.items.map((i) => i.id));
  const add = STARTER_KIT.filter((i) => !have.has(i.id));
  return {
    inventory: { items: [...state.inventory.items, ...add].map(normalizeInventoryItem) },
    flags: { [STARTER_KIT_FLAG]: true },
    itemObtained: add.map((i) => ({
      itemId: i.id,
      name: i.name,
      how: 'starter' as const,
      source: 'your starting kit',
      locationId: state.locationId,
    })),
  };
}
