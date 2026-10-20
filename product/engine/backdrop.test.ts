import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BACKDROP_ART,
  BACKDROP_ART_IDS,
  FALLBACK_FOE,
  FOES_BY_LOCATION,
  MERCHANTS,
  backdropKeysNeedingArt,
  createEmptyCombat,
  createStarterMap,
  locationChain,
  resolveBackdrop,
  spawnFoe,
  type BackdropArtId,
  type CombatState,
  type ShopState,
} from './index';

const calm = (locationId: string | null, extra: { combat?: Partial<CombatState>; shop?: ShopState } = {}) => ({
  locationId,
  combat: { ...createEmptyCombat(), ...(extra.combat ?? {}) },
  shop: extra.shop ?? { activeMerchantId: null, atLocationId: null },
});

/** The original two-art table — exercises hierarchy fallbacks independent of delivery. */
const SPARSE: Record<string, BackdropArtId> = {
  'location:place.copper-kettle': 'art.hearth',
  'location:region.embervale': 'art.vista',
};

const ALL_FOE_IDS = [
  ...new Set([...Object.values(FOES_BY_LOCATION).flat().map((f) => f.id), FALLBACK_FOE.id]),
];
const SPEAKER_KEYS = [
  ...MERCHANTS.map((m) => `merchant:${m.id}`),
  ...ALL_FOE_IDS.map((id) => `foe:${id}`),
];

describe('BG-01 delivered art table', () => {
  it('every map node, merchant and foe has its own art (missing list empty)', () => {
    assert.deepEqual(backdropKeysNeedingArt(SPEAKER_KEYS), []);
  });

  it('every mapped art id is a known id; every id is used', () => {
    const used = new Set(Object.values(BACKDROP_ART));
    for (const id of used) assert.ok((BACKDROP_ART_IDS as readonly string[]).includes(id), id);
    for (const id of BACKDROP_ART_IDS) assert.ok(used.has(id), `unused ${id}`);
  });

  it('every location resolves to its own art', () => {
    for (const id of Object.keys(createStarterMap().nodes)) {
      const r = resolveBackdrop(calm(id));
      assert.equal(r.sourceKey, `location:${id}`, id);
      assert.deepEqual(r.missingKeys, []);
    }
  });

  it('room keys: Common Room / cellar now use their own art, not the hearth', () => {
    assert.equal(resolveBackdrop(calm('interior.kettle-common')).art, 'art.kettle-common');
    assert.equal(resolveBackdrop(calm('interior.kettle-cellar')).art, 'art.kettle-cellar');
    assert.equal(resolveBackdrop(calm('place.copper-kettle')).art, 'art.hearth');
  });
});

describe('BG-01 location chain fallbacks (sparse table)', () => {
  it('child room → parent art', () => {
    const r = resolveBackdrop(calm('interior.kettle-common'), { art: SPARSE });
    assert.equal(r.art, 'art.hearth');
    assert.equal(r.sourceKey, 'location:place.copper-kettle');
    assert.deepEqual(r.missingKeys, ['location:interior.kettle-common']);
    assert.equal(r.tint, 'hearth');
  });

  it('child → parent → region', () => {
    assert.deepEqual(locationChain('interior.smith-forge'), [
      'interior.smith-forge',
      'place.brightanvil',
      'locale.emberford',
      'region.embervale',
    ]);
    const r = resolveBackdrop(calm('interior.smith-forge'), { art: SPARSE });
    assert.equal(r.art, 'art.vista');
    assert.equal(r.sourceKey, 'location:region.embervale');
    assert.equal(r.tint, 'forge');
  });

  it('null location uses the map start node (Common Room)', () => {
    assert.equal(resolveBackdrop(calm(null)).art, 'art.kettle-common');
  });

  it('unknown location → themed placeholder (never blank)', () => {
    const r = resolveBackdrop(calm('nowhere.void'));
    assert.equal(r.art, null);
    assert.equal(r.source, 'placeholder');
    assert.equal(r.tint, 'default');
  });

  it('no art anywhere in chain → placeholder tinted by region', () => {
    const r = resolveBackdrop(calm('locale.ashen-fields'), { art: {} });
    assert.equal(r.source, 'placeholder');
    assert.equal(r.tint, 'ash');
    assert.deepEqual(r.missingKeys, ['location:locale.ashen-fields', 'location:region.embervale']);
  });
});

describe('BG-01 speaker override precedence', () => {
  const foe = spawnFoe('locale.ashen-fields');
  const kettleShop: ShopState = { activeMerchantId: 'merchant.kettle', atLocationId: 'interior.kettle-common' };

  it('combat foe beats shop and location', () => {
    const r = resolveBackdrop(calm('interior.kettle-common', { combat: { inCombat: true, foe }, shop: kettleShop }));
    assert.equal(r.source, 'speaker');
    assert.equal(r.sourceKey, `foe:${foe.id}`);
    assert.equal(r.art, `art.foe.${foe.id.slice(4)}`);
    assert.equal(r.mood, 'combat');
  });

  it('every foe and merchant resolves to its own speaker art', () => {
    for (const id of ALL_FOE_IDS) {
      const f = { ...spawnFoe(null), id };
      assert.equal(resolveBackdrop(calm('locale.emberford', { combat: { inCombat: true, foe: f } })).sourceKey, `foe:${id}`);
    }
    for (const m of MERCHANTS) {
      const r = resolveBackdrop(calm(m.locationIds[0]!, { shop: { activeMerchantId: m.id, atLocationId: m.locationIds[0]! } }));
      assert.equal(r.sourceKey, `merchant:${m.id}`);
      assert.equal(r.mood, 'shop');
    }
  });

  it('shop merchant beats location', () => {
    const r = resolveBackdrop(calm('interior.kettle-common', { shop: kettleShop }));
    assert.equal(r.art, 'art.merchant.hollis');
  });

  it('speaker without art falls through to location but keeps mood + heavier scrim', () => {
    const fight = resolveBackdrop(calm('locale.ashen-fields', { combat: { inCombat: true, foe } }), { art: SPARSE });
    assert.equal(fight.source, 'location');
    assert.equal(fight.art, 'art.vista');
    assert.equal(fight.mood, 'combat');
    assert.equal(fight.missingKeys[0], `foe:${foe.id}`);
    assert.ok(fight.scrimOpacity > resolveBackdrop(calm('locale.ashen-fields')).scrimOpacity);
  });

  it('a leftover foe out of combat is ignored (narrator)', () => {
    const r = resolveBackdrop(calm('interior.kettle-common', { combat: { inCombat: false, foe } }));
    assert.equal(r.speaker.kind, 'narrator');
    assert.equal(r.mood, 'calm');
  });
});
