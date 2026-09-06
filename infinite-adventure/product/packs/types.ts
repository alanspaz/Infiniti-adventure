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

/** Data-only stubs for later narrator / identity tickets. */
export type PackContentStubs = {
  openingBeat: string;
  narratorSystemHint: string;
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
