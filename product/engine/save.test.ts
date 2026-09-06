import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MemoryPersistStore,
  SAVE_SCHEMA_VERSION,
  addCharacter,
  createCampaign,
  createCharacter,
  createEmptyParty,
  createEmptySession,
  deleteCampaign,
  loadCampaign,
  parseCampaign,
  saveCampaign,
  serializeCampaign,
  setFlag,
  withParty,
  withSession,
} from './index';

describe('createCampaign', () => {
  it('allows empty party and null pack', () => {
    const c = createCampaign({ id: 'camp-1', title: 'Road North' });
    assert.equal(c.schemaVersion, SAVE_SCHEMA_VERSION);
    assert.equal(c.party.length, 0);
    assert.equal(c.playstylePackId, null);
    assert.equal(c.session.turn, 0);
    assert.equal(c.session.locationId, null);
  });

  it('does not auto-spawn companions', () => {
    const party = createEmptyParty();
    const c = createCampaign({ id: 'c2', party });
    assert.equal(c.party.length, 0);
  });
});

describe('serialize / parse', () => {
  it('round-trips with a character in party', () => {
    const hero = createCharacter({
      id: 'solo',
      name: 'Wanderer',
      originMode: 'memory-loss',
      sealedBackstorySeed: 'fog',
    });
    const camp = createCampaign({
      id: 'camp-3',
      title: 'Ash Path',
      playstylePackId: 'ash-ledger',
      party: addCharacter(createEmptyParty(), hero),
      session: { turn: 4, locationId: 'gate', logSummary: 'arrived', rngSeed: 9 },
      flags: { met_guard: true, toll: 2 },
    });
    const json = serializeCampaign(camp);
    const back = parseCampaign(json);
    assert.deepEqual(back.party, camp.party);
    assert.equal(back.playstylePackId, 'ash-ledger');
    assert.equal(back.session.turn, 4);
    assert.equal(back.flags.met_guard, true);
    assert.equal(back.flags.toll, 2);
  });

  it('round-trips empty party', () => {
    const camp = createCampaign({ id: 'empty', title: 'Solo start' });
    const back = parseCampaign(serializeCampaign(camp));
    assert.equal(back.party.length, 0);
  });

  it('rejects unknown schemaVersion', () => {
    const camp = createCampaign({ id: 'x', title: 'X' });
    const bad = { ...camp, schemaVersion: 99 };
    assert.throws(() => parseCampaign(JSON.stringify(bad)));
  });
});

describe('session helpers', () => {
  it('withSession and setFlag update immutably', () => {
    const base = createCampaign({ id: 's1' });
    const next = withSession(base, { turn: 1, logSummary: 'left town' });
    assert.equal(base.session.turn, 0);
    assert.equal(next.session.turn, 1);
    assert.equal(next.session.logSummary, 'left town');
    const flagged = setFlag(next, 'door_open', true);
    assert.equal(flagged.flags.door_open, true);
    assert.equal(next.flags.door_open, undefined);
  });

  it('createEmptySession defaults', () => {
    const s = createEmptySession();
    assert.deepEqual(s, {
      turn: 0,
      locationId: null,
      logSummary: '',
      rngSeed: null,
    });
  });
});

describe('MemoryPersistStore save/load', () => {
  it('persists and loads campaigns; empty party preserved', async () => {
    const store = new MemoryPersistStore();
    const camp = createCampaign({ id: 'p1', title: 'Persist me' });
    await saveCampaign(store, camp);
    const loaded = await loadCampaign(store, 'p1');
    assert.ok(loaded);
    assert.equal(loaded!.id, 'p1');
    assert.equal(loaded!.party.length, 0);

    const withHero = withParty(
      loaded!,
      addCharacter(
        createEmptyParty(),
        createCharacter({ id: 'h', name: 'H' }),
      ),
    );
    await saveCampaign(store, withHero);
    const again = await loadCampaign(store, 'p1');
    assert.equal(again!.party.length, 1);
    assert.equal(again!.party[0].name, 'H');

    await deleteCampaign(store, 'p1');
    assert.equal(await loadCampaign(store, 'p1'), null);
  });
  it('round-trips optional storyBeats on session', () => {
    const base = createCampaign({
      id: 'story-log',
      session: {
        turn: 2,
        logSummary: 'T2: look around',
        storyBeats: [
          {
            id: 'b1',
            prose: 'The hearth glows.',
            checkLine: null,
            stillCacheKey: null,
          },
        ],
      },
    });
    assert.equal(base.session.storyBeats?.length, 1);
    const again = parseCampaign(serializeCampaign(base));
    assert.equal(again.session.storyBeats?.[0]?.prose, 'The hearth glows.');
  });

});
