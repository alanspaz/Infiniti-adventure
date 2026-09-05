import {
  AbilityScores,
  CharacterIdentity,
  CharacterSheet,
  DEFAULT_ABILITY_SCORE,
  DEFAULT_HIT_DIE,
  HitDie,
  OriginMode,
  ABILITY_KEYS,
} from './types';

export type CreateCharacterInput = {
  id: string;
  name: string;
  description?: string;
  className?: string;
  age?: number | null;
  originMode?: OriginMode;
  sealedBackstorySeed?: string | null;
  level?: number;
  abilities?: Partial<AbilityScores>;
  hitDie?: HitDie;
};

function defaultAbilities(partial?: Partial<AbilityScores>): AbilityScores {
  const base: AbilityScores = {
    strength: DEFAULT_ABILITY_SCORE,
    dexterity: DEFAULT_ABILITY_SCORE,
    constitution: DEFAULT_ABILITY_SCORE,
    intelligence: DEFAULT_ABILITY_SCORE,
    wisdom: DEFAULT_ABILITY_SCORE,
    charisma: DEFAULT_ABILITY_SCORE,
  };
  if (!partial) return base;
  for (const key of ABILITY_KEYS) {
    if (partial[key] !== undefined) {
      base[key] = Math.floor(partial[key]!);
    }
  }
  return base;
}

/** Create a character sheet. Does not touch any party. */
export function createCharacter(input: CreateCharacterInput): CharacterSheet {
  const identity: CharacterIdentity = {
    id: input.id,
    name: input.name,
    description: input.description ?? '',
    className: input.className ?? 'Adventurer',
    age: input.age === undefined ? null : input.age,
    originMode: input.originMode ?? 'backstory',
    sealedBackstorySeed:
      input.sealedBackstorySeed === undefined
        ? null
        : input.sealedBackstorySeed,
  };

  return {
    ...identity,
    level: Math.max(1, Math.floor(input.level ?? 1)),
    abilities: defaultAbilities(input.abilities),
    hitDie: input.hitDie ?? DEFAULT_HIT_DIE,
  };
}

export function withAbilities(
  character: CharacterSheet,
  abilities: Partial<AbilityScores>,
): CharacterSheet {
  return {
    ...character,
    abilities: defaultAbilities({ ...character.abilities, ...abilities }),
  };
}

export function withIdentity(
  character: CharacterSheet,
  patch: Partial<CharacterIdentity>,
): CharacterSheet {
  return {
    ...character,
    ...patch,
    id: patch.id ?? character.id,
  };
}
