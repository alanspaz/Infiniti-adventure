/**
 * COMBAT-02 bestiary — small original foe table keyed by map location.
 * Leaf module (type-only imports) so campaignState can seed foes.
 */
import type { InventoryItem } from './campaignState';

export type FoeState = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  ac: number;
  /** Attack roll bonus (d20 + attackBonus vs player AC). */
  attackBonus: number;
  /** Damage notation, e.g. "1d6+1". */
  damage: string;
  /** Rewards on defeat. */
  xp: number;
  gold: number;
  loot: InventoryItem | null;
};

type FoeDef = Omit<FoeState, 'hp'>;

const ASH_WOLF: FoeDef = {
  id: 'foe.ash-wolf',
  name: 'Ash wolf',
  maxHp: 9,
  ac: 12,
  attackBonus: 3,
  damage: '1d6+1',
  xp: 50,
  gold: 0,
  loot: {
    id: 'loot-ash-wolf-pelt',
    name: 'Ash wolf pelt',
    qty: 1,
    kind: 'misc',
    description: 'Grey fur that smells of cinders. A trader might want it.',
  },
};

const SCARECROW: FoeDef = {
  id: 'foe.scarecrow-husk',
  name: 'Scarecrow husk',
  maxHp: 11,
  ac: 11,
  attackBonus: 2,
  damage: '1d6',
  xp: 50,
  gold: 4,
  loot: {
    id: 'loot-straw-charm',
    name: 'Straw charm',
    qty: 1,
    kind: 'misc',
    description: 'A knot of straw and red thread, still twitching faintly.',
  },
};

const ROAD_BANDIT: FoeDef = {
  id: 'foe.road-bandit',
  name: 'Road bandit',
  maxHp: 10,
  ac: 12,
  attackBonus: 3,
  damage: '1d6',
  xp: 75,
  gold: 8,
  loot: {
    id: 'dagger',
    name: 'Dagger',
    qty: 1,
    kind: 'gear',
    slot: 'weapon',
    damage: '1d4',
    description: 'Short, sharp, easy to hide.',
  },
};

const CELLAR_RAT: FoeDef = {
  id: 'foe.cellar-rat',
  name: 'Giant cellar rat',
  maxHp: 5,
  ac: 11,
  attackBonus: 2,
  damage: '1d4',
  xp: 25,
  gold: 1,
  loot: null,
};

const RUFFIAN: FoeDef = {
  id: 'foe.ruffian',
  name: 'Rowdy ruffian',
  maxHp: 7,
  ac: 10,
  attackBonus: 2,
  damage: '1d4',
  xp: 25,
  gold: 3,
  loot: null,
};

/** Wild places where "look for trouble" finds a fight. */
export const FOES_BY_LOCATION: Record<string, FoeDef[]> = {
  'locale.ashen-fields': [ASH_WOLF, SCARECROW],
  'region.embervale': [ROAD_BANDIT, ASH_WOLF],
  'interior.kettle-cellar': [CELLAR_RAT],
};

/** Anywhere else, starting a fight on purpose finds a brawler. */
export const FALLBACK_FOE: FoeDef = RUFFIAN;

export function hasWildFoes(locationId: string | null | undefined): boolean {
  return Boolean(locationId && FOES_BY_LOCATION[locationId]?.length);
}

/** Pick a foe for a location (index from rng-ish number in [0,1)). */
export function spawnFoe(
  locationId: string | null | undefined,
  roll = 0,
): FoeState {
  const pool = (locationId && FOES_BY_LOCATION[locationId]) || [FALLBACK_FOE];
  const def = pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))]!;
  return { ...def, hp: def.maxHp, loot: def.loot ? { ...def.loot } : null };
}

export function normalizeFoe(value: unknown): FoeState | null {
  if (!value || typeof value !== 'object') return null;
  const f = value as Partial<FoeState>;
  const maxHp = Math.max(1, Math.floor(Number(f.maxHp) || 1));
  const loot =
    f.loot && typeof f.loot === 'object' && f.loot.id && f.loot.name
      ? { ...f.loot, qty: Math.max(1, Math.floor(Number(f.loot.qty) || 1)) }
      : null;
  return {
    id: String(f.id ?? 'foe.unknown'),
    name: String(f.name ?? 'Foe'),
    hp: Math.max(0, Math.min(maxHp, Math.floor(Number(f.hp ?? maxHp)))),
    maxHp,
    ac: Math.max(1, Math.floor(Number(f.ac) || 10)),
    attackBonus: Math.floor(Number(f.attackBonus) || 0),
    damage: typeof f.damage === 'string' && f.damage ? f.damage : '1d4',
    xp: Math.max(0, Math.floor(Number(f.xp) || 0)),
    gold: Math.max(0, Math.floor(Number(f.gold) || 0)),
    loot,
  };
}
