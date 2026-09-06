import type { HitDie } from '../engine/types';

export type PackCrunch = 'light' | 'medium' | 'heavy';
export type RestHarshness = 'generous' | 'standard' | 'harsh';

export type PackClassDef = {
  id: string;
  name: string;
  hitDie: HitDie;
  summary: string;
};

export type PackToneHints = {
  /** Prose tone for future narrator. */
  summary: string;
  /** Still-generation style hint (no provider wiring). */
  imageStyle: string;
};

export type PackResources = {
  crunch: PackCrunch;
  trackSupplies: boolean;
  trackWounds: boolean;
  heroicInspiration: boolean;
  restHarshness: RestHarshness;
};

/** Data-only stubs for narrator / identity (Narrative-owned wording). */
export type PackContentStubs = {
  openingBeat: string;
  continueBeat: string;
  /** Optional short lead-in before custom fallback (not used to echo actions). */
  customBeatPrefix: string;
  /** In-world consequence prose for custom beats — never echoes raw player action. */
  customBeatFallback: string;
  narratorSystemHint: string;
  aloneClause: string;
  /** Use `{name}` placeholder. */
  partyReadyOne: string;
  /** Use `{names}` placeholder. */
  partyReadyMany: string;
};

export type PlaystylePack = {
  id: string;
  displayName: string;
  description: string;
  allowCustomClasses: boolean;
  classes: PackClassDef[];
  tone: PackToneHints;
  resources: PackResources;
  contentStubs: PackContentStubs;
};
