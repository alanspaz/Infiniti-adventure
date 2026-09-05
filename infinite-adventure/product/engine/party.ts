import { CharacterSheet, Party } from './types';

/** Empty party is valid. Never auto-spawn companions. */
export function createEmptyParty(): Party {
  return [];
}

export function addCharacter(party: Party, character: CharacterSheet): Party {
  if (party.some((c) => c.id === character.id)) {
    throw new Error(`Character id already in party: ${character.id}`);
  }
  return [...party, character];
}

export function removeCharacter(party: Party, characterId: string): Party {
  return party.filter((c) => c.id !== characterId);
}

export function findCharacter(
  party: Party,
  characterId: string,
): CharacterSheet | undefined {
  return party.find((c) => c.id === characterId);
}
