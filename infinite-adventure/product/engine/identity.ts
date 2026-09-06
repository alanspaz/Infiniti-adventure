import { createCharacter } from './character';
import {
  applyPackClassDefaults,
  isClassAllowed,
  loadPlaystylePack,
} from './pack';
import { placeCampaignAtMapStart } from './map';
import { createCampaign, type CampaignSave } from './save';
import { createSeededRng, defaultRng, randomInt, type Rng } from './rng';
import type { CharacterSheet, OriginMode } from './types';

export type IdentityFormInput = {
  name: string;
  description?: string;
  className: string;
  age?: number | null;
  originMode: OriginMode;
  playstylePackId: string;
  /** Stable character id; generated if omitted. */
  characterId?: string;
  /** Stable campaign id; generated if omitted. */
  campaignId?: string;
  campaignTitle?: string;
};

export type CreateFromIdentityOptions = {
  rng?: Rng;
  /**
   * When true (default), party is the single created PC.
   * When false, party stays empty (still valid); character is not attached.
   * Never spawns companions beyond the optional PC.
   */
  includeCharacter?: boolean;
  /** Wall-clock override for tests. */
  nowIso?: string;
};

const SEED_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function trimName(name: string): string {
  return name.trim();
}

/** Opaque on-device sealed backstory seed (not narrated here). */
export function generateSealedBackstorySeed(rng: Rng = defaultRng()): string {
  let body = '';
  for (let i = 0; i < 24; i += 1) {
    body += SEED_ALPHABET[randomInt(rng, 0, SEED_ALPHABET.length - 1)]!;
  }
  return `ia.seal.${body}`;
}

/** New opaque id for character / campaign create. */
export function generateEntityId(
  prefix: string,
  rng: Rng = defaultRng(),
): string {
  let body = '';
  for (let i = 0; i < 12; i += 1) {
    body += SEED_ALPHABET[randomInt(rng, 0, SEED_ALPHABET.length - 1)]!;
  }
  return `${prefix}_${body}`;
}

/**
 * Build a CharacterSheet from identity form fields.
 * Validates class against the selected pack. Generates sealedBackstorySeed
 * only when originMode is memory-loss.
 */
export function createCharacterFromIdentity(
  input: IdentityFormInput,
  options: CreateFromIdentityOptions = {},
): CharacterSheet {
  const name = trimName(input.name);
  if (!name) {
    throw new Error('Name is required');
  }
  const className = input.className.trim();
  if (!className) {
    throw new Error('Class is required');
  }

  const pack = loadPlaystylePack(input.playstylePackId);
  if (!isClassAllowed(pack, className)) {
    throw new Error(`Class not allowed in pack ${pack.id}: ${className}`);
  }

  const rng = options.rng ?? defaultRng();
  const originMode = input.originMode;
  const sealedBackstorySeed =
    originMode === 'memory-loss' ? generateSealedBackstorySeed(rng) : null;

  const sheet = createCharacter({
    id: input.characterId ?? generateEntityId('pc', rng),
    name,
    description: input.description ?? '',
    className,
    age: input.age === undefined ? null : input.age,
    originMode,
    sealedBackstorySeed,
  });

  return applyPackClassDefaults(sheet, pack, className);
}

/**
 * Create a campaign from pack + identity. Default party is [pc] only.
 * Pass includeCharacter: false for an empty party with pack id set.
 */
export function createCampaignFromIdentity(
  input: IdentityFormInput,
  options: CreateFromIdentityOptions = {},
): CampaignSave {
  const rng = options.rng ?? defaultRng();
  const includeCharacter = options.includeCharacter !== false;
  const character = createCharacterFromIdentity(input, { ...options, rng });
  const title =
    input.campaignTitle?.trim() || `${character.name}'s Adventure`;

  const campaign = createCampaign({
    id: input.campaignId ?? generateEntityId('camp', rng),
    title,
    createdAt: options.nowIso,
    playstylePackId: input.playstylePackId,
    party: includeCharacter ? [character] : [],
  });
  // Natural start: starter map common room (session.locationId).
  return placeCampaignAtMapStart(campaign);
}

/** Seeded helper for reproducible tests. */
export function createIdentityRng(seed: number): Rng {
  return createSeededRng(seed);
}
