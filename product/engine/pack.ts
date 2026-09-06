import type { CharacterSheet } from './types';
import {
  getRegisteredPack,
  listRegisteredPacks,
  type PackClassDef,
  type PlaystylePack,
} from '../packs';

export type {
  PackClassDef,
  PackContentStubs,
  PackCrunch,
  PackResources,
  PackToneHints,
  PlaystylePack,
  RestHarshness,
} from '../packs';

export {
  BUILTIN_PACK_IDS,
  BUILTIN_PLAYSTYLE_PACKS,
  ashLedgerPack,
  hearthlightPack,
  registerPlaystylePack,
  resetPlaystylePackRegistry,
} from '../packs';

/** All currently registered playstyle packs (copy of list). */
export function listPlaystylePacks(): PlaystylePack[] {
  return listRegisteredPacks();
}

/** Load a pack by id. Throws if unknown. */
export function loadPlaystylePack(id: string): PlaystylePack {
  const pack = getRegisteredPack(id);
  if (!pack) {
    throw new Error(`Unknown playstyle pack: ${id}`);
  }
  return pack;
}

/** Load a pack by id, or null if unknown / empty. */
export function tryLoadPlaystylePack(
  id: string | null | undefined,
): PlaystylePack | null {
  if (id === null || id === undefined || id === '') return null;
  return getRegisteredPack(id) ?? null;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Look up a class by id or display name (case-insensitive name). */
export function getPackClass(
  pack: PlaystylePack,
  classNameOrId: string,
): PackClassDef | undefined {
  const key = norm(classNameOrId);
  return pack.classes.find(
    (c) => norm(c.id) === key || norm(c.name) === key,
  );
}

/** True if the class is listed, or the pack allows custom classes. */
export function isClassAllowed(
  pack: PlaystylePack,
  className: string,
): boolean {
  if (pack.allowCustomClasses) return true;
  return getPackClass(pack, className) !== undefined;
}

/**
 * Apply pack class defaults to a sheet: set className + hitDie from the
 * matching PackClassDef. If not found and custom classes are allowed,
 * returns the sheet unchanged (caller may keep a custom className).
 * If not found and custom is disallowed, throws.
 * Does not touch party membership.
 */
export function applyPackClassDefaults(
  sheet: CharacterSheet,
  pack: PlaystylePack,
  classNameOrId: string,
): CharacterSheet {
  const def = getPackClass(pack, classNameOrId);
  if (!def) {
    if (pack.allowCustomClasses) {
      return sheet;
    }
    throw new Error(
      `Class not allowed in pack ${pack.id}: ${classNameOrId}`,
    );
  }
  return {
    ...sheet,
    className: def.name,
    hitDie: def.hitDie,
  };
}

/**
 * Resource-rule hook available today: whether the pack wants supply tracking.
 * Future tickets may expand resource simulation; this is the boolean gate.
 */
export function packTracksSupplies(pack: PlaystylePack): boolean {
  return pack.resources.trackSupplies;
}

export function packTracksWounds(pack: PlaystylePack): boolean {
  return pack.resources.trackWounds;
}

export function packUsesHeroicInspiration(pack: PlaystylePack): boolean {
  return pack.resources.heroicInspiration;
}
