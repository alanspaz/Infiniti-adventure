import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCampaignPatch,
  campaignToState,
  combatActionPatch,
  createCampaign,
  createCharacter,
  createEmptyWorld,
  parseCampaign,
  patchesFromSceneBeat,
  serializeCampaign,
  withParty,
} from './index';

describe('CampaignState world slice', () => {
  it('createCampaign includes empty world', () => {
    const c = createCampaign({ id: 'w1' });
    assert.ok(c.world);
    assert.equal(c.world!.inventory.gold, 0);
    assert.equal(c.world!.quests.length, 0);
    assert.equal(c.world!.combat.mode, 'idle');
  });

  it('round-trips world through serialize/parse', () => {
    let c = createCampaign({ id: 'w2', title: 'World' });
    c = applyCampaignPatch(c, {
      addGold: 12,
      addItem: { id: 'lantern', name: 'Lantern', qty: 1, kind: 'gear' },
      upsertQuest: {
        id: 'q1',
        title: 'Find the gate',
        status: 'active',
        summary: 'Ask around town',
      },
      combat: { inCombat: true, mode: 'attack', hp: 8, maxHp: 10, lastAction: 'Attack' },
    });
    const back = parseCampaign(serializeCampaign(c));
    assert.equal(back.world!.inventory.gold, 12);
    assert.equal(back.world!.inventory.items[0]?.name, 'Lantern');
    assert.equal(back.world!.quests[0]?.title, 'Find the gate');
    assert.equal(back.world!.combat.hp, 8);
    assert.equal(back.world!.combat.mode, 'attack');
  });

  it('older saves without world still parse', () => {
    const c = createCampaign({ id: 'old' });
    const raw = JSON.parse(serializeCampaign(c)) as Record<string, unknown>;
    delete raw.world;
    const back = parseCampaign(JSON.stringify(raw));
    assert.ok(back.world);
    assert.equal(back.world!.inventory.gold, 0);
  });
});

describe('campaignToState / patches', () => {
  it('exposes character companions location storyBeats from one state', () => {
    const hero = createCharacter({ id: 'pc', name: 'Asha' });
    let c = createCampaign({ id: 's1', party: [hero], session: { locationId: 'embervale-gate' } });
    c = applyCampaignPatch(c, {
      storyBeats: [
        {
          id: 'b1',
          prose: 'Hello',
          checkLine: null,
          stillCacheKey: null,
          placeLine: 'At the gate.',
          playerLine: null,
        },
      ],
      storyMeta: { beatCount: 1, lastPlaceLine: 'At the gate.', lastCheckLine: null },
    });
    const state = campaignToState(c);
    assert.equal(state.character?.name, 'Asha');
    assert.equal(state.companions.length, 0);
    assert.equal(state.locationId, 'embervale-gate');
    assert.equal(state.storyBeats.length, 1);
    assert.ok(state.combat.maxHp !== null);
    assert.ok(state.combat.hp !== null);
  });

  it('patchesFromSceneBeat stubs travel item gold quest', () => {
    const p = patchesFromSceneBeat({
      playerAction: 'take the rusty key',
      travelToId: 'inn',
      checkLine: 'perception ok',
      checkSuccess: true,
      placeLine: 'At the inn.',
      storyBeats: [],
    });
    assert.equal(p.locationId, 'inn');
    assert.equal(p.addItem?.name, 'rusty key');
    assert.equal(p.storyMeta?.lastPlaceLine, 'At the inn.');

    const gold = patchesFromSceneBeat({ playerAction: 'find 5 gold' });
    assert.equal(gold.addGold, 5);

    const quest = patchesFromSceneBeat({
      playerAction: 'accept the quest to rescue the baker',
    });
    assert.equal(quest.upsertQuest?.status, 'active');
    assert.match(quest.upsertQuest?.title ?? '', /rescue/i);
  });

  it('combatActionPatch writes mode and HP', () => {
    const c = createCampaign({
      id: 'fight',
      party: [createCharacter({ id: 'pc', name: 'Asha' })],
    });
    const state = campaignToState(c);
    const patch = combatActionPatch('defend', state.combat);
    const next = campaignToState(applyCampaignPatch(c, patch));
    assert.equal(next.combat.mode, 'defend');
    assert.equal(next.combat.lastAction, 'Defend');
    assert.ok((next.combat.hp ?? 0) >= (state.combat.hp ?? 0));
  });


  it('gold never goes negative (Base44 anti-pattern)', () => {
    let c = createCampaign({ id: 'gold' });
    c = applyCampaignPatch(c, { inventory: { gold: -1, items: [] } });
    assert.equal(campaignToState(c).inventory.gold, 0);
    c = applyCampaignPatch(c, { addGold: -50 });
    assert.equal(campaignToState(c).inventory.gold, 0);
    c = applyCampaignPatch(c, { addGold: 3 });
    assert.equal(campaignToState(c).inventory.gold, 3);
  });

    it('empty party remains valid', () => {
    const c = withParty(createCampaign({ id: 'solo' }), []);
    const state = campaignToState(c);
    assert.equal(state.character, null);
    assert.equal(state.companions.length, 0);
  });

  it('createEmptyWorld defaults', () => {
    const w = createEmptyWorld();
    assert.deepEqual(w.inventory, { gold: 0, items: [] });
    assert.equal(w.combat.mode, 'idle');
  });
});
