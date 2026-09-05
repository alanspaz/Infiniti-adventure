import {
  AbilityKey,
  AbilityScores,
  CharacterSheet,
  DEFAULT_HIT_DIE,
  DerivedStats,
  HitDie,
} from './types';

/** Ability modifier: floor((score - 10) / 2). */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Proficiency bonus for level L (clamped 1–20): 2 + floor((L - 1) / 4). */
export function proficiencyBonus(level: number): number {
  const L = Math.min(20, Math.max(1, Math.floor(level)));
  return 2 + Math.floor((L - 1) / 4);
}

export function modifiersFromScores(abilities: AbilityScores): AbilityScores {
  return {
    strength: abilityModifier(abilities.strength),
    dexterity: abilityModifier(abilities.dexterity),
    constitution: abilityModifier(abilities.constitution),
    intelligence: abilityModifier(abilities.intelligence),
    wisdom: abilityModifier(abilities.wisdom),
    charisma: abilityModifier(abilities.charisma),
  };
}

/**
 * Max HP (v1 simple model):
 * level 1: max(1, hitDie + conMod)
 * higher: + (L-1) * max(1, floor(hitDie/2) + 1 + conMod)
 */
export function maxHitPoints(
  level: number,
  constitution: number,
  hitDie: HitDie = DEFAULT_HIT_DIE,
): number {
  const L = Math.max(1, Math.floor(level));
  const conMod = abilityModifier(constitution);
  const first = Math.max(1, hitDie + conMod);
  if (L === 1) return first;
  const perLevel = Math.max(1, Math.floor(hitDie / 2) + 1 + conMod);
  return first + (L - 1) * perLevel;
}

export function deriveStats(character: Pick<
  CharacterSheet,
  'level' | 'abilities' | 'hitDie'
>): DerivedStats {
  const modifiers = modifiersFromScores(character.abilities);
  return {
    modifiers,
    proficiencyBonus: proficiencyBonus(character.level),
    armorClass: 10 + modifiers.dexterity,
    maxHitPoints: maxHitPoints(
      character.level,
      character.abilities.constitution,
      character.hitDie,
    ),
    initiativeBonus: modifiers.dexterity,
    passivePerception: 10 + modifiers.wisdom,
  };
}

export function getModifier(
  abilities: AbilityScores,
  key: AbilityKey,
): number {
  return abilityModifier(abilities[key]);
}
