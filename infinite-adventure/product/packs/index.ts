import type { PlaystylePack } from './types';
import { hearthlightPack } from './hearthlight';
import { ashLedgerPack } from './ash-ledger';

export type {
  PackClassDef,
  PackContentStubs,
  PackCrunch,
  PackResources,
  PackToneHints,
  PlaystylePack,
  RestHarshness,
} from './types';

export { hearthlightPack } from './hearthlight';
export { ashLedgerPack } from './ash-ledger';

/** Built-in packs in stable display order. */
export const BUILTIN_PLAYSTYLE_PACKS: readonly PlaystylePack[] = [
  hearthlightPack,
  ashLedgerPack,
] as const;

export const BUILTIN_PACK_IDS = BUILTIN_PLAYSTYLE_PACKS.map((p) => p.id);

const registry: Map<string, PlaystylePack> = new Map(
  BUILTIN_PLAYSTYLE_PACKS.map((p) => [p.id, p]),
);

/** Register or replace a pack (tests / future mods). */
export function registerPlaystylePack(pack: PlaystylePack): void {
  registry.set(pack.id, pack);
}

/** Reset registry to built-ins only (tests). */
export function resetPlaystylePackRegistry(): void {
  registry.clear();
  for (const p of BUILTIN_PLAYSTYLE_PACKS) {
    registry.set(p.id, p);
  }
}

export function getRegisteredPack(id: string): PlaystylePack | undefined {
  return registry.get(id);
}

export function listRegisteredPacks(): PlaystylePack[] {
  return Array.from(registry.values());
}
