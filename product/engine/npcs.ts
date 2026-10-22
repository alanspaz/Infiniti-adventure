/**
 * TABS-01: known people of the Embervale starter world (pure data, no imports).
 * Each NPC is "met" when you enter one of their locations; what they mention
 * becomes a known-but-unvisited place on the Map tab. Keepers match the
 * merchant table in shop.ts (same names, same rooms).
 */
export type NpcMention = {
  placeId: string;
  /** What they tell you about it (shown as the place's note until you go). */
  note: string;
};

export type NpcDef = {
  id: string;
  name: string;
  /** Short role line ("innkeeper, the Copper Kettle"). */
  role: string;
  /** Map node ids where you find them. */
  locationIds: string[];
  /** Merchant id when they trade (shop.ts). */
  merchantId?: string;
  mentions: NpcMention[];
};

export const NPCS: NpcDef[] = [
  {
    id: 'npc.hollis',
    name: 'Hollis',
    role: 'Innkeeper of the Copper Kettle',
    locationIds: ['place.copper-kettle', 'interior.kettle-common'],
    merchantId: 'merchant.kettle',
    mentions: [
      { placeId: 'place.brightanvil', note: "Hollis: \"Dagna's forge, if you need a blade or mail.\"" },
      { placeId: 'place.mossglass', note: 'Hollis: "Fennick sells the potions I can\'t keep in stock."' },
      { placeId: 'locale.ashen-fields', note: 'Hollis: "Trouble roams the Ashen Fields past town."' },
    ],
  },
  {
    id: 'npc.dagna',
    name: 'Dagna Brightanvil',
    role: 'Smith of Brightanvil Smithy',
    locationIds: ['place.brightanvil', 'interior.smith-forge'],
    merchantId: 'merchant.brightanvil',
    mentions: [
      { placeId: 'locale.ashen-fields', note: 'Dagna: "Ash wolves on the Fields. Bring something sharp."' },
      { placeId: 'region.embervale', note: 'Dagna: "Bandits work the vale road outside town."' },
    ],
  },
  {
    id: 'npc.fennick',
    name: 'Fennick',
    role: 'Alchemist of Mossglass',
    locationIds: ['place.mossglass', 'interior.alchemist-counter'],
    merchantId: 'merchant.mossglass',
    mentions: [
      { placeId: 'place.copper-kettle', note: 'Fennick: "Hollis at the Copper Kettle keeps a potion or two for travellers."' },
    ],
  },
];

export function getNpcDef(id: string): NpcDef | null {
  return NPCS.find((n) => n.id === id) ?? null;
}

export function npcsAt(locationId: string | null | undefined): NpcDef[] {
  if (!locationId) return [];
  return NPCS.filter((n) => n.locationIds.includes(locationId));
}

export function npcForMerchant(merchantId: string): NpcDef | null {
  return NPCS.find((n) => n.merchantId === merchantId) ?? null;
}

/** Who hands out each scripted quest (journal "given by"). */
export const QUEST_GIVERS: Record<string, string> = {
  'quest-first-steps': 'npc.hollis',
};

/** Floor level of interiors for the Map tab chain (building → floor → room). */
export const INTERIOR_FLOORS: Record<string, string> = {
  'interior.kettle-common': 'Ground floor',
  'interior.kettle-cellar': 'Cellar',
  'interior.smith-forge': 'Ground floor',
  'interior.alchemist-counter': 'Ground floor',
};
