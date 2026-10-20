/**
 * P-INT-04 — shop / barter as CampaignState mutations.
 *
 * Merchant stock + purse are seeded from location/pack tables on first touch
 * and then persist per merchant in `world.merchants`. Every trade moves one
 * unit and its price between the player and the merchant, so
 * (player gold + merchant gold) and (player units + merchant units) are
 * conserved — see `tradeLedger`.
 */
import {
  applyCampaignPatch,
  campaignToState,
  normalizeInventoryItem,
  type CampaignState,
  type CampaignStatePatch,
  type InventoryItem,
  type MerchantState,
} from './campaignState';
import { itemNarrationPatch, itemTraits } from './items';
import { createStarterMap } from './map';
import type { CampaignSave } from './save';

export type MerchantDef = {
  id: string;
  name: string;
  /** Who runs it (player-facing). */
  keeper: string;
  /** Map node ids where this merchant trades. */
  locationIds: string[];
  startingGold: number;
  stock: (InventoryItem & { price: number })[];
  greeting: string;
};

/** Base catalog prices (gold) for known ids / names. */
const PRICE_BY_ID: Record<string, number> = {
  'healing-potion': 10,
  'starter-healing-potion': 10,
  shortsword: 10,
  'starter-shortsword': 10,
  dagger: 4,
  'leather-armor': 10,
  'starter-leather-armor': 10,
  'chain-shirt': 30,
  shield: 10,
  torch: 1,
  'starter-torch': 1,
  rations: 1,
  rope: 2,
  'antidote-salve': 8,
  lantern: 5,
  bedroll: 2,
};

const SHOP_ITEMS = {
  potion: {
    id: 'healing-potion',
    name: 'Healing potion',
    qty: 1,
    kind: 'consumable',
    effect: { type: 'heal', amount: 4 },
    description: 'Red, faintly warm through the glass. Restores 4 HP.',
  },
  greaterPotion: {
    id: 'greater-healing-potion',
    name: 'Greater healing potion',
    qty: 1,
    kind: 'consumable',
    effect: { type: 'heal', amount: 8 },
    description: 'Deep crimson, thick as syrup. Restores 8 HP.',
  },
  salve: {
    id: 'antidote-salve',
    name: 'Herbal salve',
    qty: 1,
    kind: 'consumable',
    effect: { type: 'heal', amount: 2 },
    description: 'A tin of green-smelling balm. Restores 2 HP.',
  },
  dagger: {
    id: 'dagger',
    name: 'Dagger',
    qty: 1,
    kind: 'gear',
    slot: 'weapon',
    damage: '1d4',
    description: 'Short, sharp, easy to hide.',
  },
  shortsword: {
    id: 'shortsword',
    name: 'Shortsword',
    qty: 1,
    kind: 'gear',
    slot: 'weapon',
    damage: '1d6',
    description: 'A plain, well-kept blade.',
  },
  chain: {
    id: 'chain-shirt',
    name: 'Chain shirt',
    qty: 1,
    kind: 'gear',
    slot: 'armor',
    armorBase: 13,
    description: 'Interlocking rings under a canvas cover. AC 13 + DEX.',
  },
  shield: {
    id: 'shield',
    name: 'Wooden shield',
    qty: 1,
    kind: 'gear',
    slot: 'shield',
    armorBase: 2,
    description: 'Iron-rimmed oak. +2 AC.',
  },
  rations: {
    id: 'rations',
    name: 'Trail rations',
    qty: 1,
    kind: 'misc',
    description: 'Hard bread, cheese, dried apple.',
  },
  rope: {
    id: 'rope',
    name: 'Hemp rope (50 ft)',
    qty: 1,
    kind: 'gear',
    description: 'Coiled and sound.',
  },
  lantern: {
    id: 'lantern',
    name: 'Hooded lantern',
    qty: 1,
    kind: 'gear',
    description: 'Brass and glass; shutters to a slit.',
  },
} satisfies Record<string, InventoryItem>;

function row(item: InventoryItem, qty: number, price: number) {
  return { ...item, qty, price };
}

/** Location → merchant table (Embervale starter map). */
export const MERCHANTS: MerchantDef[] = [
  {
    id: 'merchant.kettle',
    name: 'The Copper Kettle',
    keeper: 'Hollis the innkeeper',
    locationIds: ['place.copper-kettle', 'interior.kettle-common'],
    startingGold: 40,
    stock: [
      row(SHOP_ITEMS.rations, 6, 1),
      row(SHOP_ITEMS.potion, 2, 12),
      row(SHOP_ITEMS.rope, 1, 2),
    ],
    greeting:
      'Hollis wipes down the bar and nods at the shelf behind it: rations, rope, a couple of potions kept for travellers.',
  },
  {
    id: 'merchant.brightanvil',
    name: 'Brightanvil Smithy',
    keeper: 'Dagna Brightanvil',
    locationIds: ['place.brightanvil', 'interior.smith-forge'],
    startingGold: 80,
    stock: [
      row(SHOP_ITEMS.dagger, 2, 4),
      row(SHOP_ITEMS.shortsword, 1, 10),
      row(SHOP_ITEMS.chain, 1, 30),
      row(SHOP_ITEMS.shield, 1, 10),
    ],
    greeting:
      'Dagna sets down her hammer and jerks a thumb at the rack: blades, a chain shirt, a sturdy shield. "Coin first."',
  },
  {
    id: 'merchant.mossglass',
    name: 'Mossglass Alchemist',
    keeper: 'Fennick of Mossglass',
    locationIds: ['place.mossglass', 'interior.alchemist-counter'],
    startingGold: 60,
    stock: [
      row(SHOP_ITEMS.potion, 4, 10),
      row(SHOP_ITEMS.greaterPotion, 1, 25),
      row(SHOP_ITEMS.salve, 3, 6),
      row(SHOP_ITEMS.lantern, 1, 5),
    ],
    greeting:
      'Fennick peers over the ledger and gestures at the labeled vials. "Restoratives, mostly. Prices are fair and final."',
  },
];

/** Pack price tables: harsher packs charge more (applied on top of base price). */
const PACK_PRICE_MULT: Record<string, number> = {
  'ash-ledger': 1.25,
};

export function packPriceMultiplier(packId: string | null | undefined): number {
  return (packId && PACK_PRICE_MULT[packId]) || 1;
}

export function getMerchantDef(id: string): MerchantDef | null {
  return MERCHANTS.find((m) => m.id === id) ?? null;
}

const START_NODE = createStarterMap().startNodeId;

export function merchantForLocation(
  locationId: string | null | undefined,
): MerchantDef | null {
  const loc = locationId ?? START_NODE;
  return MERCHANTS.find((m) => m.locationIds.includes(loc)) ?? null;
}

/** Persisted merchant state, or the table seed if never traded with. */
export function merchantState(state: CampaignState, merchantId: string): MerchantState {
  const saved = state.merchants[merchantId];
  if (saved) return saved;
  const def = getMerchantDef(merchantId);
  if (!def) return { gold: 0, stock: [] };
  return {
    gold: def.startingGold,
    stock: def.stock.map(({ price: _p, ...it }) => normalizeInventoryItem(it)),
  };
}

function basePrice(item: InventoryItem, merchantId: string | null): number {
  const def = merchantId ? getMerchantDef(merchantId) : null;
  const listed = def?.stock.find((s) => s.id === item.id);
  if (listed) return listed.price;
  if (PRICE_BY_ID[item.id] !== undefined) return PRICE_BY_ID[item.id]!;
  const t = itemTraits(item);
  if (t.effect?.type === 'heal') return Math.max(2, t.effect.amount * 2 + 2);
  if (t.slot === 'armor') return 10 + Math.max(0, (t.armorBase ?? 11) - 11) * 10;
  if (t.slot === 'shield') return 10;
  if (t.slot === 'weapon') return 8;
  return 1;
}

/** What the merchant charges the player for one unit. */
export function buyPrice(state: CampaignState, merchantId: string, item: InventoryItem): number {
  return Math.max(1, Math.ceil(basePrice(item, merchantId) * packPriceMultiplier(state.playstylePackId)));
}

/** What the merchant pays the player for one unit (half base, min 1). */
export function sellPrice(state: CampaignState, merchantId: string, item: InventoryItem): number {
  return Math.max(1, Math.floor(basePrice(item, merchantId) / 2));
}

export type TradeLedger = {
  playerGold: number;
  merchantGold: number;
  playerUnits: number;
  merchantUnits: number;
  /** Conserved across any buy/sell. */
  totalGold: number;
  totalUnits: number;
};

const units = (items: InventoryItem[]) => items.reduce((n, i) => n + i.qty, 0);

export function tradeLedger(state: CampaignState, merchantId: string): TradeLedger {
  const m = merchantState(state, merchantId);
  const playerGold = state.inventory.gold;
  const playerUnits = units(state.inventory.items);
  const merchantUnits = units(m.stock);
  return {
    playerGold,
    merchantGold: m.gold,
    playerUnits,
    merchantUnits,
    totalGold: playerGold + m.gold,
    totalUnits: playerUnits + merchantUnits,
  };
}

export type TradeRequest =
  | { kind: 'buy'; merchantId: string; itemId: string }
  | { kind: 'sell'; merchantId: string; itemId: string };

export type TradeResult = {
  ok: boolean;
  kind: TradeRequest['kind'];
  message: string;
  patch: CampaignStatePatch | null;
  narration: string | null;
  playerLine: string | null;
};

function reject(kind: TradeRequest['kind'], message: string): TradeResult {
  return { ok: false, kind, message, patch: null, narration: null, playerLine: null };
}

function takeOne(items: InventoryItem[], id: string): InventoryItem[] {
  return items.flatMap((i) =>
    i.id !== id ? [i] : i.qty > 1 ? [{ ...i, qty: i.qty - 1 }] : [],
  );
}

function giveOne(items: InventoryItem[], item: InventoryItem): InventoryItem[] {
  const { equipped: _e, ...clean } = item;
  const idx = items.findIndex((i) => i.id === item.id);
  if (idx >= 0) {
    return items.map((i, n) => (n === idx ? { ...i, qty: i.qty + 1 } : i));
  }
  return [...items, { ...clean, qty: 1 }];
}

/** Pure rules: resolve a buy/sell. Rejections never carry a patch. */
export function resolveTrade(state: CampaignState, req: TradeRequest): TradeResult {
  const def = getMerchantDef(req.merchantId);
  if (!def) return reject(req.kind, 'No one here is trading.');
  if (state.combat.inCombat) return reject(req.kind, 'No haggling mid-fight.');
  const m = merchantState(state, req.merchantId);
  const player = state.inventory;

  if (req.kind === 'buy') {
    const item = m.stock.find((i) => i.id === req.itemId);
    if (!item) return reject('buy', `${def.keeper} has none of that left.`);
    const price = buyPrice(state, def.id, item);
    if (player.gold < price) {
      return reject('buy', `Not enough gold: ${item.name} costs ${price}, you have ${player.gold}.`);
    }
    return {
      ok: true,
      kind: 'buy',
      message: `Bought ${item.name} for ${price} gold.`,
      patch: {
        inventory: { gold: player.gold - price, items: giveOne(player.items, item) },
        merchants: {
          [def.id]: { gold: m.gold + price, stock: takeOne(m.stock, item.id) },
        },
      },
      narration: `${def.keeper} takes your ${price} gold and hands over the ${item.name.toLowerCase()}.`,
      playerLine: `Buy ${item.name}`,
    };
  }

  const item = player.items.find((i) => i.id === req.itemId);
  if (!item) return reject('sell', 'That item is no longer in your pack.');
  if (item.kind === 'quest') {
    return reject('sell', `${item.name} matters to a quest — it isn't for sale.`);
  }
  if (item.equipped) {
    return reject('sell', `You're using ${item.name} — unequip it first.`);
  }
  const price = sellPrice(state, def.id, item);
  if (m.gold < price) {
    return reject('sell', `${def.keeper} can't afford it: offers ${price}, has only ${m.gold} gold.`);
  }
  return {
    ok: true,
    kind: 'sell',
    message: `Sold ${item.name} for ${price} gold.`,
    patch: {
      inventory: { gold: player.gold + price, items: takeOne(player.items, item.id) },
      merchants: {
        [def.id]: { gold: m.gold - price, stock: giveOne(m.stock, item) },
      },
    },
    narration: `${def.keeper} turns the ${item.name.toLowerCase()} over once, then counts ${price} gold into your palm.`,
    playerLine: `Sell ${item.name}`,
  };
}

export function applyTrade(
  campaign: CampaignSave,
  req: TradeRequest,
  now: number = Date.now(),
): { campaign: CampaignSave; result: TradeResult } {
  const state = campaignToState(campaign);
  const result = resolveTrade(state, req);
  if (!result.ok || !result.patch) return { campaign, result };
  let patch = result.patch;
  if (result.narration) {
    patch = { ...patch, ...itemNarrationPatch(state, result.narration, result.playerLine, now) };
  }
  return { campaign: applyCampaignPatch(campaign, patch), result };
}

const TRADE_RE =
  /\b(trade|shop|shopping|barter|haggle|buy|sell|browse|wares|merchant|what (?:do|have) you (?:got|have|sell))\b/i;

export function detectTradeIntent(action: string): boolean {
  return TRADE_RE.test(action.trim());
}

/** Open (or honestly refuse) a shop at the current location. */
export function openShopAt(state: CampaignState): {
  ok: boolean;
  merchantId: string | null;
  patch: CampaignStatePatch | null;
  narration: string;
} {
  const def = merchantForLocation(state.locationId);
  if (!def) {
    return {
      ok: false,
      merchantId: null,
      patch: null,
      narration:
        'No one here is selling anything. In Emberford, try the Copper Kettle, Brightanvil Smithy, or Mossglass Alchemist.',
    };
  }
  return {
    ok: true,
    merchantId: def.id,
    patch: {
      shop: { activeMerchantId: def.id, atLocationId: state.locationId ?? null },
    },
    narration: def.greeting,
  };
}

export function closeShopPatch(): CampaignStatePatch {
  return { shop: { activeMerchantId: null, atLocationId: null } };
}

/**
 * Open the shop here (or refuse honestly) and add a Tale beat either way —
 * a trade request never goes silent.
 */
export function applyOpenShop(
  campaign: CampaignSave,
  playerLine: string,
  now: number = Date.now(),
): { campaign: CampaignSave; ok: boolean; merchantId: string | null } {
  const state = campaignToState(campaign);
  const open = openShopAt(state);
  const patch: CampaignStatePatch = {
    ...(open.patch ?? {}),
    ...itemNarrationPatch(state, open.narration, playerLine, now),
  };
  return {
    campaign: applyCampaignPatch(campaign, patch),
    ok: open.ok,
    merchantId: open.merchantId,
  };
}
