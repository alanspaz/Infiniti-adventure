import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  applyPackClassDefaults,
  createCampaign,
  createCharacter,
  createEmptyParty,
  getPackClass,
  isClassAllowed,
  listPlaystylePacks,
  loadPlaystylePack,
  packTracksSupplies,
  packTracksWounds,
  packUsesHeroicInspiration,
  resetPlaystylePackRegistry,
  tryLoadPlaystylePack,
  BUILTIN_PACK_IDS,
} from './index';

describe('playstyle packs', () => {
  beforeEach(() => {
    resetPlaystylePackRegistry();
  });

  it('lists built-in hearthlight and ash-ledger', () => {
    const packs = listPlaystylePacks();
    assert.deepEqual(
      packs.map((p) => p.id).sort(),
      [...BUILTIN_PACK_IDS].sort(),
    );
    assert.ok(BUILTIN_PACK_IDS.includes('hearthlight'));
    assert.ok(BUILTIN_PACK_IDS.includes('ash-ledger'));
  });

  it('loads packs by id', () => {
    const h = loadPlaystylePack('hearthlight');
    assert.equal(h.displayName, 'Hearthlight');
    assert.equal(h.resources.crunch, 'medium');
    assert.equal(h.resources.heroicInspiration, true);
    assert.equal(h.resources.trackSupplies, false);
    assert.match(h.tone.summary, /warm/i);
    assert.ok(h.tone.imageStyle.length > 0);
    assert.ok(h.contentStubs.openingBeat.length > 0);
    assert.ok(h.contentStubs.continueBeat.length > 0);
    assert.ok(h.contentStubs.customBeatFallback.length > 0);

    const a = loadPlaystylePack('ash-ledger');
    assert.equal(a.displayName, 'Ash Ledger');
    assert.equal(a.resources.trackSupplies, true);
    assert.equal(a.resources.trackWounds, true);
    assert.equal(a.resources.heroicInspiration, false);
    assert.equal(a.resources.restHarshness, 'harsh');
    assert.match(a.tone.summary, /grit/i);
  });

  it('tryLoad returns null for unknown or empty', () => {
    assert.equal(tryLoadPlaystylePack('nope'), null);
    assert.equal(tryLoadPlaystylePack(null), null);
    assert.equal(tryLoadPlaystylePack(''), null);
  });

  it('loadPlaystylePack throws on unknown', () => {
    assert.throws(() => loadPlaystylePack('missing-pack'), /Unknown/);
  });

  it('looks up classes by id and name', () => {
    const h = loadPlaystylePack('hearthlight');
    const byId = getPackClass(h, 'warden');
    assert.equal(byId?.name, 'Warden');
    assert.equal(byId?.hitDie, 10);
    const byName = getPackClass(h, 'hearth-mage');
    assert.equal(byName?.name, 'Hearth-Mage');
    const byDisplay = getPackClass(h, 'Pathfinder');
    assert.equal(byDisplay?.id, 'pathfinder');
    assert.equal(getPackClass(h, 'wizard'), undefined);
  });

  it('isClassAllowed respects allowCustomClasses', () => {
    const h = loadPlaystylePack('hearthlight');
    assert.equal(isClassAllowed(h, 'Warden'), true);
    assert.equal(isClassAllowed(h, 'Custom Scout'), true);
  });

  it('applyPackClassDefaults sets className and hitDie', () => {
    const pack = loadPlaystylePack('ash-ledger');
    const sheet = createCharacter({ id: 'c1', name: 'Rue', className: 'Adventurer' });
    const applied = applyPackClassDefaults(sheet, pack, 'scrounger');
    assert.equal(applied.className, 'Scrounger');
    assert.equal(applied.hitDie, 8);
    assert.equal(sheet.className, 'Adventurer'); // original unchanged
  });

  it('applyPackClassDefaults no-ops for unknown when custom allowed', () => {
    const pack = loadPlaystylePack('hearthlight');
    const sheet = createCharacter({
      id: 'c1',
      name: 'Custom',
      className: 'Street Sage',
      hitDie: 6,
    });
    const applied = applyPackClassDefaults(sheet, pack, 'Street Sage');
    assert.equal(applied.className, 'Street Sage');
    assert.equal(applied.hitDie, 6);
  });

  it('resource hooks differ by pack', () => {
    const h = loadPlaystylePack('hearthlight');
    const a = loadPlaystylePack('ash-ledger');
    assert.equal(packTracksSupplies(h), false);
    assert.equal(packTracksSupplies(a), true);
    assert.equal(packTracksWounds(h), false);
    assert.equal(packTracksWounds(a), true);
    assert.equal(packUsesHeroicInspiration(h), true);
    assert.equal(packUsesHeroicInspiration(a), false);
  });

  it('campaign with pack id and empty party is valid', () => {
    const party = createEmptyParty();
    assert.equal(party.length, 0);
    const camp = createCampaign({
      id: 'p1',
      title: 'Ember Road',
      playstylePackId: 'hearthlight',
      party,
    });
    assert.equal(camp.party.length, 0);
    assert.equal(camp.playstylePackId, 'hearthlight');
    const loaded = tryLoadPlaystylePack(camp.playstylePackId);
    assert.equal(loaded?.id, 'hearthlight');
  });

  it('each pack has a non-empty class list', () => {
    for (const id of BUILTIN_PACK_IDS) {
      const p = loadPlaystylePack(id);
      assert.ok(p.classes.length >= 1);
      for (const c of p.classes) {
        assert.ok(c.id.length > 0);
        assert.ok(c.name.length > 0);
        assert.ok([4, 6, 8, 10, 12].includes(c.hitDie));
      }
    }
  });
});
