/**
 * BG-01 — Tale backdrop resolver (pure, no image requires; see src/backdrop.tsx).
 *
 * Precedence (first match wins):
 *   1. Combat speaker  — `foe:<foeId>` art while a fight is active.
 *   2. Shop speaker    — `merchant:<merchantId>` art while a shop is open.
 *   3. Location chain  — current node → parent → … → region (first node with art).
 *   4. Placeholder     — theme gradient/vignette, tinted by region/locale.
 * A speaker with no art of its own falls through to the location chain but
 * keeps its mood (tint + heavier scrim), so a fight never looks like a calm room.
 */
import type { CampaignState } from './campaignState';
import { createStarterMap, getMapNode, type MapGraph } from './map';

/** Art ids that exist in product/assets (mapped to static requires in src/backdrop.tsx). */
export type BackdropArtId = 'art.hearth' | 'art.vista';

/** Keys that currently have art. Everything else falls back. */
export const BACKDROP_ART: Record<string, BackdropArtId> = {
  // packs/pack-hearthlight.png — hearth interior: the Copper Kettle and its rooms.
  'location:place.copper-kettle': 'art.hearth',
  // splash-epic-cliffside.png — vista over the vale town: region-level default.
  'location:region.embervale': 'art.vista',
};

export type BackdropMood = 'calm' | 'shop' | 'combat';

/** Placeholder / tint palettes (all derived from #140f0c + #d4a054). */
export type BackdropTint = 'hearth' | 'town' | 'ash' | 'cellar' | 'forge' | 'alchemy' | 'default';

export type BackdropSpeaker =
  | { kind: 'narrator' }
  | { kind: 'merchant'; id: string }
  | { kind: 'foe'; id: string; name: string };

export type ResolvedBackdrop = {
  /** Art to show, or null → placeholder gradient only. */
  art: BackdropArtId | null;
  /** Which key supplied the art (or 'placeholder'). */
  sourceKey: string;
  source: 'speaker' | 'location' | 'placeholder';
  speaker: BackdropSpeaker;
  mood: BackdropMood;
  tint: BackdropTint;
  /** 0–1 dark scrim over art for text contrast. */
  scrimOpacity: number;
  /** Keys checked (in order) that had no art — feed for the Artist list. */
  missingKeys: string[];
};

const SCRIM: Record<BackdropMood, number> = { calm: 0.72, shop: 0.74, combat: 0.8 };

const TINT_BY_NODE: Record<string, BackdropTint> = {
  'place.copper-kettle': 'hearth',
  'interior.kettle-cellar': 'cellar',
  'place.brightanvil': 'forge',
  'place.mossglass': 'alchemy',
  'locale.emberford': 'town',
  'locale.ashen-fields': 'ash',
};

const STARTER_MAP = createStarterMap();

/** Node id chain from current → root (unknown id → empty). */
export function locationChain(
  locationId: string | null | undefined,
  graph: MapGraph = STARTER_MAP,
): string[] {
  const out: string[] = [];
  let cur: string | null = locationId ?? graph.startNodeId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const node = getMapNode(graph, cur);
    if (!node) break;
    out.push(node.id);
    cur = node.parentId;
  }
  return out;
}

function tintFor(chain: string[]): BackdropTint {
  for (const id of chain) {
    const t = TINT_BY_NODE[id];
    if (t) return t;
  }
  return 'default';
}

export function speakerFor(state: Pick<CampaignState, 'combat' | 'shop'>): BackdropSpeaker {
  const foe = state.combat.inCombat ? state.combat.foe : null;
  if (foe) return { kind: 'foe', id: foe.id, name: foe.name };
  if (state.shop.activeMerchantId) return { kind: 'merchant', id: state.shop.activeMerchantId };
  return { kind: 'narrator' };
}

export function resolveBackdrop(
  state: Pick<CampaignState, 'combat' | 'shop' | 'locationId'>,
  opts: { art?: Record<string, BackdropArtId>; graph?: MapGraph } = {},
): ResolvedBackdrop {
  const art = opts.art ?? BACKDROP_ART;
  const speaker = speakerFor(state);
  const mood: BackdropMood =
    speaker.kind === 'foe' ? 'combat' : speaker.kind === 'merchant' ? 'shop' : 'calm';
  const chain = locationChain(state.locationId, opts.graph);
  const tint = tintFor(chain);
  const missing: string[] = [];
  const base = { speaker, mood, tint, scrimOpacity: SCRIM[mood] };

  if (speaker.kind !== 'narrator') {
    const key = `${speaker.kind}:${speaker.id}`;
    if (art[key]) return { ...base, art: art[key]!, sourceKey: key, source: 'speaker', missingKeys: missing };
    missing.push(key);
  }
  for (const id of chain) {
    const key = `location:${id}`;
    if (art[key]) return { ...base, art: art[key]!, sourceKey: key, source: 'location', missingKeys: missing };
    missing.push(key);
  }
  return { ...base, art: null, sourceKey: 'placeholder', source: 'placeholder', missingKeys: missing };
}

/**
 * Every location / speaker key that has no art of its own today
 * (they still render via fallback). Hand this to Artist.
 */
export function backdropKeysNeedingArt(
  extraSpeakerKeys: string[],
  opts: { art?: Record<string, BackdropArtId>; graph?: MapGraph } = {},
): string[] {
  const art = opts.art ?? BACKDROP_ART;
  const graph = opts.graph ?? STARTER_MAP;
  const keys = [
    ...Object.keys(graph.nodes).map((id) => `location:${id}`),
    ...extraSpeakerKeys,
  ];
  return keys.filter((k) => !art[k]);
}
