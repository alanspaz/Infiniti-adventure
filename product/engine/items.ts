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

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pick(pool: string[], seed: string): string {
  return pool[hashString(seed) % pool.length]!;
}

function reject(
  kind: ItemActionKind,
  message: string,
): ItemActionResult {
  return { ok: false, kind, message, patch: null, narration: null, playerLine: null };
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
  const seed = `${item.id}:${state.storyMeta.beatCount}:${state.storyBeats.length}`;

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
          narration: pick(
            [
              `You set the ${item.name.toLowerCase()} aside and stow it in your pack.`,
              `The ${item.name.toLowerCase()} comes off; you pack it away with care.`,
              `You free yourself of the ${item.name.toLowerCase()} and tuck it into your gear.`,
            ],
            seed,
          ),
          playerLine: `Unequip ${item.name}`,
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
      const lower = item.name.toLowerCase();
      const base =
        traits.slot === 'weapon'
          ? pick(
              [
                `You draw the ${lower} and test its weight — it settles into your grip.`,
                `The ${lower} comes up in your hand, ready.`,
                `You buckle the ${lower} where you can reach it fast.`,
              ],
              seed,
            )
          : traits.slot === 'armor'
            ? pick(
                [
                  `You shrug into the ${lower} and cinch the straps tight.`,
                  `The ${lower} settles over your shoulders, snug and familiar.`,
                  `Buckle by buckle, you don the ${lower}.`,
                ],
                seed,
              )
            : pick(
                [
                  `You sling the ${lower} onto your arm.`,
                  `The ${lower} locks onto your forearm with a solid thunk.`,
                ],
                seed,
              );
      return {
        ok: true,
        kind: 'equip',
        message: swapName
          ? `Equipped ${item.name} (replaced ${swapName}).`
          : `Equipped ${item.name}.`,
        patch: withItems(next),
        narration: swapName
          ? `You put away the ${swapName.toLowerCase()}. ${base}`
          : base,
        playerLine: `${verb === 'wield' ? 'Wield' : 'Wear'} ${item.name}`,
      };
    }

    case 'use': {
      if (traits.effect?.type === 'heal') {
        const maxHp = state.combat.maxHp ?? 10;
        const hp = state.combat.hp ?? maxHp;
        if (hp >= maxHp) {
          return reject('use', `You're already at full health (${hp}/${maxHp}). ${item.name} kept.`);
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
          narration: `${pick(
            [
              `You uncork the ${item.name.toLowerCase()} and drink. Warmth spreads through your chest`,
              `The ${item.name.toLowerCase()} goes down bitter and bright; the ache in your limbs eases`,
              `You knock back the ${item.name.toLowerCase()}. Heat blooms behind your ribs and your breath steadies`,
            ],
            seed,
          )} — ${gained} HP restored (${nextHp}/${maxHp}).`,
          playerLine: `Use ${item.name}`,
        };
      }
      if (traits.slot) {
        return reject(
          'use',
          `${item.name} isn't used up — equip it instead.`,
        );
      }
      return reject('use', `${item.name} has no use on its own right now.`);
    }

    case 'drop': {
      if (item.kind === 'quest') {
        return reject('drop', `${item.name} matters to a quest — you hold on to it.`);
      }
      const nextItems = items.filter((i) => i.id !== item.id);
      const what = item.qty > 1 ? `${item.qty}× ${item.name}` : item.name;
      return {
        ok: true,
        kind: 'drop',
        message: `Dropped ${what}.`,
        patch: withItems(nextItems),
        narration: pick(
          [
            `You leave the ${item.name.toLowerCase()} behind${item.equipped ? ', unbuckling it first' : ''}. Your pack is a little lighter.`,
            `You set the ${item.name.toLowerCase()} down and walk on without it.`,
            `The ${item.name.toLowerCase()} stays where you drop it.`,
          ],
          seed,
        ),
        playerLine: `Drop ${what}`,
      };
    }
    default:
      return reject((req as ItemActionRequest).kind, 'Unknown item action.');
  }
}

/** Append a narrator beat (player line + prose) to session story beats. */
export function itemNarrationPatch(
  state: CampaignState,
  narration: string,
  playerLine: string | null,
  now: number = Date.now(),
): CampaignStatePatch {
  const record: StoryBeatRecord = {
    id: `item-${state.session.turn}-${now}`,
    prose: narration,
    checkLine: null,
    stillCacheKey: null,
    placeLine: null,
    playerLine,
  };
  const beats = [...state.storyBeats, record].slice(-MAX_ITEM_STORY_BEATS);
  return {
    storyBeats: beats,
    storyMeta: { beatCount: state.storyMeta.beatCount + 1 },
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
  if (!result.ok || !result.patch) return { campaign, result };
  let patch: CampaignStatePatch = result.patch;
  if (result.narration) {
    patch = { ...patch, ...itemNarrationPatch(state, result.narration, result.playerLine, now) };
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
  };
}
