import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BACKDROP_ART,
  FOES_BY_LOCATION,
  MERCHANTS,
  backdropKeysNeedingArt,
  createEmptyCombat,
  locationChain,
  resolveBackdrop,
  spawnFoe,
  type CombatState,
  type ShopState,
} from './index';

const calm = (locationId: string | null, extra: { combat?: Partial<CombatState>; shop?: ShopState } = {}) => ({
  locationId,
  combat: { ...createEmptyCombat(), ...(extra.combat ?? {}) },
  shop: extra.shop ?? { activeMerchantId: null, atLocationId: null },
});

describe('BG-01 location chain fallbacks', () => {
  it('room with own entry on parent: Common Room → Copper Kettle hearth art', () => {
    const r = resolveBackdrop(calm('interior.kettle-common'));
    assert.equal(r.art, 'art.hearth');
    assert.equal(r.source, 'location');
    assert.equal(r.sourceKey, 'location:place.copper-kettle');
    assert.deepEqual(r.missingKeys, ['location:interior.kettle-common']);
    assert.equal(r.mood, 'calm');
    assert.equal(r.tint, 'hearth');
  });

  it('child → parent → region: forge floor falls back to the Embervale vista', () => {
    assert.deepEqual(locationChain('interior.smith-forge'), [
      'interior.smith-forge',
      'place.brightanvil',
      'locale.emberford',
      'region.embervale',
    ]);
    const r = resolveBackdrop(calm('interior.smith-forge'));
    assert.equal(r.art, 'art.vista');
    assert.equal(r.sourceKey, 'location:region.embervale');
    assert.equal(r.tint, 'forge');
  });

  it('null location uses the map start node (Common Room)', () => {
    assert.equal(resolveBackdrop(calm(null)).art, 'art.hearth');
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

  it('combat foe with art beats shop and location', () => {
    const r = resolveBackdrop(
      calm('interior.kettle-common', {
        combat: { inCombat: true, foe },
        shop: { activeMerchantId: 'merchant.kettle', atLocationId: 'interior.kettle-common' },
      }),
      { art: { ...BACKDROP_ART, [`foe:${foe.id}`]: 'art.vista', 'merchant:merchant.kettle': 'art.hearth' } },
    );
    assert.equal(r.source, 'speaker');
    assert.equal(r.sourceKey, `foe:${foe.id}`);
    assert.equal(r.mood, 'combat');
  });

  it('shop merchant with art beats location', () => {
    const r = resolveBackdrop(
      calm('locale.ashen-fields', {
        shop: { activeMerchantId: 'merchant.kettle', atLocationId: 'locale.ashen-fields' },
      }),
      { art: { ...BACKDROP_ART, 'merchant:merchant.kettle': 'art.hearth' } },
    );
    assert.equal(r.sourceKey, 'merchant:merchant.kettle');
    assert.equal(r.mood, 'shop');
  });

  it('speaker without art falls through to location but keeps its mood + heavier scrim', () => {
    const fight = resolveBackdrop(calm('locale.ashen-fields', { combat: { inCombat: true, foe } }));
    assert.equal(fight.source, 'location');
    assert.equal(fight.art, 'art.vista');
    assert.equal(fight.mood, 'combat');
    assert.equal(fight.missingKeys[0], `foe:${foe.id}`);
    const quiet = resolveBackdrop(calm('locale.ashen-fields'));
    assert.ok(fight.scrimOpacity > quiet.scrimOpacity);

    const shop = resolveBackdrop(
      calm('interior.smith-forge', {
        shop: { activeMerchantId: 'merchant.brightanvil', atLocationId: 'interior.smith-forge' },
      }),
    );
    assert.equal(shop.mood, 'shop');
    assert.equal(shop.missingKeys[0], 'merchant:merchant.brightanvil');
  });

  it('combat flag without a foe is not a combat speaker; foe left over out of combat is ignored', () => {
    const r = resolveBackdrop(calm('interior.kettle-common', { combat: { inCombat: false, foe } }));
    assert.equal(r.speaker.kind, 'narrator');
    assert.equal(r.mood, 'calm');
  });
});

describe('BG-01 art-needed list', () => {
  it('lists every node, merchant and foe without art', () => {
    const foeIds = [...new Set(Object.values(FOES_BY_LOCATION).flat().map((f) => f.id)), 'foe.ruffian'];
    const list = backdropKeysNeedingArt([
      ...MERCHANTS.map((m) => `merchant:${m.id}`),
      ...foeIds.map((id) => `foe:${id}`),
    ]);
    assert.ok(list.includes('location:interior.kettle-cellar'));
    assert.ok(list.includes('merchant:merchant.kettle'));
    assert.ok(list.includes('foe:foe.ash-wolf'));
    assert.ok(!list.includes('location:place.copper-kettle'));
    assert.ok(!list.includes('location:region.embervale'));
  });
});
