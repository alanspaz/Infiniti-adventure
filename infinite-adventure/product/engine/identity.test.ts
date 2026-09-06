import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createStarterMap } from './map';
import {
  createCampaignFromIdentity,
  createCharacterFromIdentity,
  createIdentityRng,
  generateSealedBackstorySeed,
} from './identity';
import { resetPlaystylePackRegistry } from './pack';

describe('identity', () => {
  it('generates opaque sealed backstory seeds', () => {
    const rng = createIdentityRng(42);
    const a = generateSealedBackstorySeed(rng);
    const b = generateSealedBackstorySeed(rng);
    assert.match(a, /^ia\.seal\.[a-z0-9]{24}$/);
    assert.match(b, /^ia\.seal\.[a-z0-9]{24}$/);
    assert.notEqual(a, b);
  });

  it('creates character with pack class hitDie and no sealed seed for backstory', () => {
    resetPlaystylePackRegistry();
    const sheet = createCharacterFromIdentity(
      {
        name: ' Mira ',
        description: 'A quiet pathfinder.',
        className: 'Pathfinder',
        age: 28,
        originMode: 'backstory',
        playstylePackId: 'hearthlight',
        characterId: 'pc-1',
      },
      { rng: createIdentityRng(1) },
    );
    assert.equal(sheet.name, 'Mira');
    assert.equal(sheet.className, 'Pathfinder');
    assert.equal(sheet.hitDie, 8);
    assert.equal(sheet.age, 28);
    assert.equal(sheet.originMode, 'backstory');
    assert.equal(sheet.sealedBackstorySeed, null);
  });

  it('memory-loss still has name/class/age and generates sealed seed', () => {
    resetPlaystylePackRegistry();
    const sheet = createCharacterFromIdentity(
      {
        name: 'Ash',
        description: 'I do not remember.',
        className: 'Scrounger',
        age: 34,
        originMode: 'memory-loss',
        playstylePackId: 'ash-ledger',
        characterId: 'pc-ml',
      },
      { rng: createIdentityRng(99) },
    );
    assert.equal(sheet.name, 'Ash');
    assert.equal(sheet.className, 'Scrounger');
    assert.equal(sheet.age, 34);
    assert.equal(sheet.originMode, 'memory-loss');
    assert.ok(sheet.sealedBackstorySeed);
    assert.match(sheet.sealedBackstorySeed!, /^ia\.seal\./);
  });

  it('allows custom class when pack permits', () => {
    resetPlaystylePackRegistry();
    const sheet = createCharacterFromIdentity({
      name: 'Custom',
      className: 'Sky Knight',
      originMode: 'backstory',
      playstylePackId: 'hearthlight',
      characterId: 'pc-c',
    });
    assert.equal(sheet.className, 'Sky Knight');
    assert.equal(sheet.hitDie, 8);
  });

  it('createCampaignFromIdentity attaches sole PC and never companions', () => {
    resetPlaystylePackRegistry();
    const camp = createCampaignFromIdentity(
      {
        name: 'Solo',
        className: 'Warden',
        originMode: 'backstory',
        playstylePackId: 'hearthlight',
        characterId: 'pc-s',
        campaignId: 'camp-s',
      },
      { rng: createIdentityRng(3), nowIso: '2026-09-05T12:00:00.000Z' },
    );
    assert.equal(camp.id, 'camp-s');
    assert.equal(camp.playstylePackId, 'hearthlight');
    assert.equal(camp.party.length, 1);
    assert.equal(camp.party[0]!.name, 'Solo');
    assert.equal(camp.party[0]!.className, 'Warden');
    assert.equal(camp.party[0]!.hitDie, 10);
    assert.equal(camp.session.locationId, createStarterMap().startNodeId);
  });

  it('includeCharacter false keeps empty party with pack id', () => {
    resetPlaystylePackRegistry();
    const camp = createCampaignFromIdentity(
      {
        name: 'Later',
        className: 'Warden',
        originMode: 'backstory',
        playstylePackId: 'ash-ledger',
        campaignId: 'camp-empty',
      },
      { includeCharacter: false, rng: createIdentityRng(7) },
    );
    assert.equal(camp.party.length, 0);
    assert.equal(camp.playstylePackId, 'ash-ledger');
  });

  it('rejects empty name', () => {
    resetPlaystylePackRegistry();
    assert.throws(
      () =>
        createCharacterFromIdentity({
          name: '   ',
          className: 'Warden',
          originMode: 'backstory',
          playstylePackId: 'hearthlight',
        }),
      /Name is required/,
    );
  });
});
