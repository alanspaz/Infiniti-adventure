/** Ability score keys (generic SRD-shaped names). */
export type AbilityKey =
  | 'strength'
  | 'dexterity'
  | 'constitution'
  | 'intelligence'
  | 'wisdom'
  | 'charisma';

export type AbilityScores = Record<AbilityKey, number>;

export type OriginMode = 'backstory' | 'memory-loss';

export type HitDie = 4 | 6 | 8 | 10 | 12;

export type CharacterIdentity = {
  id: string;
  name: string;
  description: string;
  className: string;
  age: number | null;
  originMode: OriginMode;
  /** Optional sealed seed; not revealed by the engine. */
  sealedBackstorySeed: string | null;
};

export type CharacterSheet = CharacterIdentity & {
  level: number;
  abilities: AbilityScores;
  /** Class hit die; default 8 when omitted at creation time. */
  hitDie: HitDie;
};

export type DerivedStats = {
  modifiers: AbilityScores;
  proficiencyBonus: number;
  armorClass: number;
  maxHitPoints: number;
  initiativeBonus: number;
  passivePerception: number;
};

/** Ordered list of characters. Empty party is valid. */
export type Party = CharacterSheet[];

export const ABILITY_KEYS: AbilityKey[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
];

export const DEFAULT_ABILITY_SCORE = 10;
export const DEFAULT_HIT_DIE: HitDie = 8;
