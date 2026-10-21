/** QA-02 regression tests (live Expo web playthrough polish). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCampaignPatch,
  applyCombatTurn,
  applyTrade,
  bareItemName,
  campaignToState,
  createCampaign,
  createCampaignFromIdentity,
  createCharacter,
  createSeededRng,
  createStarterMap,
  isSpellcasterClass,
  MAX_CHARACTER_NAME,
  parseCampaign,
  routePlayerInput,
  serializeCampaign,
  shopRows,
  starterKitPatch,
  trimName,
  type CampaignSave,
} from './index';

const map = createStarterMap();
const st = (c: CampaignSave) => campaignToState(c);

function hero(className: string, name = 'Tess'): CampaignSave {
  return createCampaignFromIdentity(
    { name, className, originMode: 'backstory', playstylePackId: 'hearthlight' },
    { rng: createSeededRng(3) },
  );
}
function fight(c: CampaignSave): CampaignSave {
  const r = routePlayerInput(applyCampaignPatch(c, { locationId: 'locale.ashen-fields' }), 'look for trouble', { map, now: 1 })!;
  assert.equal(st(r.campaign).combat.inCombat, true);
  return r.campaign;
}

describe('QA-02 #2 long character names', () => {
  it('a 24+ char name survives create → save → load', () => {
    const name = 'Brannoch Emberhart-Vale'; // 23
    const long = `${name} II`; // 26
    assert.ok(long.length >= 24 && MAX_CHARACTER_NAME >= 24);
    const c = parseCampaign(serializeCampaign(hero('Warden', long)));
    assert.equal(st(c).character!.name, long);
    assert.equal(st(hero('Warden', 'Brannoch')).character!.name, 'Brannoch');
  });
  it('trimName collapses whitespace and caps at MAX_CHARACTER_NAME', () => {
    assert.equal(trimName('  Brannoch   of  Ash '), 'Brannoch of Ash');
    assert.equal(trimName('x'.repeat(60)).length, MAX_CHARACTER_NAME);
  });
});

describe('QA-02 #4 Flee from the rail', () => {
  it('rail flee uses the existing DEX vs DC 10 roll', () => {
    const c = fight(hero('Warden'));
    const ok = applyCombatTurn(c, 'flee', { rng: () => 0.99, now: 2 });
    assert.equal(ok.result.ok, true);
    assert.equal(st(ok.campaign).combat.inCombat, false);
    assert.match(st(ok.campaign).storyBeats.at(-1)!.checkLine!, /Flee 🎲 20.*vs DC 10 — escaped/);
    const caught = applyCombatTurn(c, 'flee', { rng: () => 0, now: 2 });
    assert.equal(st(caught.campaign).combat.inCombat, true);
    assert.match(st(caught.campaign).storyBeats.at(-1)!.checkLine!, /Flee 🎲 1.*caught/);
  });
  it('combat opener mentions Flee', () => {
    assert.match(st(fight(hero('Warden'))).storyBeats.at(-1)!.prose, /or Flee\./);
  });
});

describe('QA-02 #5 Cast for non-casters', () => {
  it('classifies classes', () => {
    for (const k of ['Mage', 'Wizard', 'Cleric', 'Hedge Witch', 'Bard']) assert.equal(isSpellcasterClass(k), true, k);
    for (const k of ['Warden', 'Fighter', 'Rogue', 'Ranger']) assert.equal(isSpellcasterClass(k), false, k);
  });
  it('explains the feeble spark for a Warden; damage is unchanged', () => {
    const w = applyCombatTurn(fight(hero('Warden')), 'cast', { rng: () => 0.99, now: 2 });
    const m = applyCombatTurn(fight(hero('Mage')), 'cast', { rng: () => 0.99, now: 2 });
    assert.match(st(w.campaign).storyBeats.at(-1)!.prose, /no spellcaster/);
    assert.doesNotMatch(st(m.campaign).storyBeats.at(-1)!.prose, /no spellcaster/);
    const dmg = (c: CampaignSave) => / (\d+) dmg/.exec(st(c).storyBeats.at(-1)!.checkLine!)?.[1];
    assert.ok(dmg(w.campaign));
    assert.equal(dmg(w.campaign), dmg(m.campaign));
  });
});

const SMITH = 'merchant.brightanvil';
function shopCamp(gold = 0): CampaignSave {
  const pc = createCharacter({ id: 'pc', name: 'Asha' });
  let c = createCampaign({ id: 'shop', party: [pc], world: { quests: [] }, session: { locationId: 'place.brightanvil' } });
  c = applyCampaignPatch(c, starterKitPatch(st(c))!);
  return gold ? applyCampaignPatch(c, { grantGold: gold }) : c;
}
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('QA-02 #6 shop rows stay put', () => {
  it('buying the last unit keeps the row (qty 0, disabled) in place', () => {
    const c0 = shopCamp(15);
    const r0 = shopRows(st(c0), SMITH);
    const c1 = applyTrade(c0, { kind: 'buy', merchantId: SMITH, itemId: 'shortsword' }).campaign;
    const r1 = shopRows(st(c1), SMITH, r0.memory);
    assert.deepEqual(ids(r1.merchant), ids(r0.merchant));
    const sword = r1.merchant.find((r) => r.id === 'shortsword')!;
    assert.equal(sword.qty, 0);
    assert.equal(sword.disabled, true);
    assert.equal(sword.tag, 'sold out');
    // Player column: the stacked sword stays in its original slot.
    assert.deepEqual(ids(r1.player).slice(0, r0.player.length), ids(r0.player));
  });
  it('selling the last unit keeps the player row (qty 0, disabled) in place', () => {
    let c = shopCamp();
    let rows = shopRows(st(c), SMITH);
    const before = ids(rows.player);
    const id = 'starter-healing-potion';
    const n = rows.player.find((r) => r.id === id)!.qty;
    for (let i = 0; i < n; i++) {
      c = applyTrade(c, { kind: 'sell', merchantId: SMITH, itemId: id }).campaign;
      rows = shopRows(st(c), SMITH, rows.memory);
      assert.deepEqual(ids(rows.player), before);
    }
    const row = rows.player.find((r) => r.id === id)!;
    assert.equal(row.qty, 0);
    assert.equal(row.disabled, true);
    assert.equal(row.tag, 'sold');
  });
});

describe('QA-02 #7 leading articles stripped from item replies', () => {
  it('bareItemName', () => {
    assert.equal(bareItemName('a potion'), 'potion');
    assert.equal(bareItemName('the "Old Map"'), 'Old Map');
    assert.equal(bareItemName('my  some dragon'), 'dragon');
    assert.equal(bareItemName('an apple'), 'apple');
    assert.equal(bareItemName('Theodric’s ring'), 'Theodric’s ring');
  });
  it('use / buy replies read naturally', () => {
    const c = hero('Warden');
    const use = routePlayerInput(c, 'drink a dragon tonic', { map, now: 1 });
    if (use) assert.doesNotMatch(use.message, /any a /);
    const shop = applyCampaignPatch(shopCamp(), {});
    const buy = routePlayerInput(shop, 'buy a dragon', { map, now: 1 })!;
    assert.match(buy.message, /no dragon for sale/);
    const sell = routePlayerInput(shop, 'sell the dragon', { map, now: 1 })!;
    assert.match(sell.message, /You don't have any dragon to sell/);
  });
});
