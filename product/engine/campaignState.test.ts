import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  STARTER_QUEST,
  applyCampaignPatch,
  campaignToState,
  combatActionPatch,
  createCampaign,
  createCharacter,
  createEmptyWorld,
  parseCampaign,
  partitionQuests,
  patchesFromSceneBeat,
  safeInventory,
  safeQuestList,
  serializeCampaign,
  withParty,
} from './index';

describe('CampaignState world slice', () => {
  it('createCampaign seeds starter quest + empty inventory', () => {
    const c = createCampaign({ id: 'w1' });
    assert.ok(c.world);
    assert.equal(c.world!.inventory.gold, 0);
    assert.equal(c.world!.inventory.items.length, 0);
    assert.equal(c.world!.quests.length, 1);
    assert.equal(c.world!.quests[0]?.id, STARTER_QUEST.id);
    assert.equal(c.world!.quests[0]?.status, 'active');
    assert.equal(c.world!.combat.mode, 'idle');
  });

  it('explicit empty quests stay empty (no forced starter)', () => {
    const c = createCampaign({ id: 'w1b', world: { quests: [] } });
    assert.equal(c.world!.quests.length, 0);
  });

  it('round-trips world through serialize/parse', () => {
    let c = createCampaign({ id: 'w2', title: 'World', world: { quests: [] } });
    c = applyCampaignPatch(c, {
      grantGold: 12,
      addItem: { id: 'lantern', name: 'Lantern', qty: 1, kind: 'gear' },
      acceptQuest: {
        id: 'q1',
        title: 'Find the gate',
        summary: 'Ask around town',
      },
      combat: { inCombat: true, mode: 'attack', hp: 8, maxHp: 10, lastAction: 'Attack' },
    });
    const back = parseCampaign(serializeCampaign(c));
    assert.equal(back.world!.inventory.gold, 12);
    assert.equal(back.world!.inventory.items[0]?.name, 'Lantern');
    assert.equal(back.world!.quests[0]?.title, 'Find the gate');
    assert.equal(back.world!.quests[0]?.status, 'active');
    assert.equal(back.world!.combat.hp, 8);
    assert.equal(back.world!.combat.mode, 'attack');
  });

  it('older saves without world still parse (empty quests, not starter)', () => {
    const c = createCampaign({ id: 'old', world: { quests: [] } });
    const raw = JSON.parse(serializeCampaign(c)) as Record<string, unknown>;
    delete raw.world;
    const back = parseCampaign(JSON.stringify(raw));
    assert.ok(back.world);
    assert.equal(back.world!.inventory.gold, 0);
    assert.equal(back.world!.quests.length, 0);
  });
});

describe('Q-01 quest patches + empty render safety', () => {
  it('accept / update / complete / fail quests', () => {
    let c = createCampaign({ id: 'q', world: { quests: [] } });
    c = applyCampaignPatch(c, {
      acceptQuest: {
        id: 'q-baker',
        title: 'Rescue the baker',
        summary: 'Find who took the ovens.',
      },
    });
    assert.equal(campaignToState(c).quests[0]?.status, 'active');

    c = applyCampaignPatch(c, {
      updateQuest: {
        id: 'q-baker',
        progressNotes: 'Spoke to the miller.',
      },
    });
    assert.equal(
      campaignToState(c).quests[0]?.progressNotes,
      'Spoke to the miller.',
    );

    c = applyCampaignPatch(c, { completeQuestId: 'q-baker' });
    assert.equal(campaignToState(c).quests[0]?.status, 'done');

    c = applyCampaignPatch(c, {
      acceptQuest: { id: 'q-fail', title: 'Lost cause' },
    });
    c = applyCampaignPatch(c, { failQuestId: 'q-fail' });
    const failed = campaignToState(c).quests.find((q) => q.id === 'q-fail');
    assert.equal(failed?.status, 'failed');
  });

  it('legacy complete status normalizes to done', () => {
    const c = createCampaign({
      id: 'legacy',
      world: {
        quests: [
          {
            id: 'old',
            title: 'Old quest',
            // @ts-expect-error legacy wire format
            status: 'complete',
          },
        ],
      },
    });
    assert.equal(campaignToState(c).quests[0]?.status, 'done');
  });

  it('partitionQuests / safeQuestList never throw on empty or garbage', () => {
    assert.deepEqual(safeQuestList(undefined), []);
    assert.deepEqual(safeQuestList(null), []);
    assert.deepEqual(safeQuestList([]), []);
    // @ts-expect-error intentional garbage
    assert.deepEqual(safeQuestList('nope'), []);
    // @ts-expect-error intentional garbage
    assert.deepEqual(safeQuestList([null, undefined, { id: 'a', title: 'A' }]), [
      { id: 'a', title: 'A', status: 'active' },
    ]);

    const parts = partitionQuests([
      { id: '1', title: 'A', status: 'active' },
      { id: '2', title: 'B', status: 'done' },
      { id: '3', title: 'C', status: 'failed' },
    ]);
    assert.equal(parts.active.length, 1);
    assert.equal(parts.done.length, 1);
    assert.equal(parts.failed.length, 1);
    assert.deepEqual(partitionQuests(undefined), {
      active: [],
      done: [],
      failed: [],
    });
  });
});

describe('I-01 inventory gold + items', () => {
  it('grant/spend gold; reject spend that would go negative; clamp persist', () => {
    let c = createCampaign({ id: 'gold', world: { quests: [] } });

    // Direct write clamp (safety net)
    c = applyCampaignPatch(c, { inventory: { gold: -1, items: [] } });
    assert.equal(campaignToState(c).inventory.gold, 0);

    c = applyCampaignPatch(c, { grantGold: 10 });
    assert.equal(campaignToState(c).inventory.gold, 10);

    // Reject overspend — gold unchanged
    c = applyCampaignPatch(c, { spendGold: 50 });
    assert.equal(campaignToState(c).inventory.gold, 10);

    // Negative addGold uses same reject policy
    c = applyCampaignPatch(c, { addGold: -50 });
    assert.equal(campaignToState(c).inventory.gold, 10);

    c = applyCampaignPatch(c, { spendGold: 4 });
    assert.equal(campaignToState(c).inventory.gold, 6);

    c = applyCampaignPatch(c, { grantGold: -3 }); // treated as 0 grant
    assert.equal(campaignToState(c).inventory.gold, 6);
  });

  it('add/remove items and safeInventory', () => {
    let c = createCampaign({ id: 'items', world: { quests: [] } });
    c = applyCampaignPatch(c, {
      addItem: { id: 'key', name: 'Rusty key', qty: 1, kind: 'quest' },
    });
    c = applyCampaignPatch(c, {
      addItem: { id: 'key', name: 'Rusty key', qty: 2, kind: 'quest' },
    });
    assert.equal(campaignToState(c).inventory.items[0]?.qty, 3);

    c = applyCampaignPatch(c, { removeItemId: 'key' });
    assert.equal(campaignToState(c).inventory.items.length, 0);

    assert.deepEqual(safeInventory(undefined), { gold: 0, items: [] });
    assert.equal(safeInventory({ gold: -9, items: [] }).gold, 0);
  });
});

describe('campaignToState / story stubs', () => {
  it('exposes character companions location storyBeats from one state', () => {
    const hero = createCharacter({ id: 'pc', name: 'Asha' });
    let c = createCampaign({
      id: 's1',
      party: [hero],
      session: { locationId: 'embervale-gate' },
      world: { quests: [] },
    });
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

  it('patchesFromSceneBeat stubs travel item gold quest accept/complete', () => {
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
    assert.equal(gold.grantGold, 5);

    const spend = patchesFromSceneBeat({ playerAction: 'pay 2 gold' });
    assert.equal(spend.spendGold, 2);

    const quest = patchesFromSceneBeat({
      playerAction: 'accept the quest to rescue the baker',
    });
    assert.match(quest.acceptQuest?.title ?? '', /rescue/i);

    const complete = patchesFromSceneBeat({
      playerAction: 'complete the quest',
      quests: [{ id: 'q1', title: 'T', status: 'active' }],
    });
    assert.equal(complete.completeQuestId, 'q1');
  });

  it('combatActionPatch writes mode and HP', () => {
    const c = createCampaign({
      id: 'fight',
      party: [createCharacter({ id: 'pc', name: 'Asha' })],
      world: { quests: [] },
    });
    const state = campaignToState(c);
    const patch = combatActionPatch('defend', state.combat);
    const next = campaignToState(applyCampaignPatch(c, patch));
    assert.equal(next.combat.mode, 'defend');
    assert.equal(next.combat.lastAction, 'Defend');
    assert.ok((next.combat.hp ?? 0) >= (state.combat.hp ?? 0));
  });

  it('empty party remains valid', () => {
    const c = withParty(createCampaign({ id: 'solo', world: { quests: [] } }), []);
    const state = campaignToState(c);
    assert.equal(state.character, null);
    assert.equal(state.companions.length, 0);
  });

  it('createEmptyWorld defaults', () => {
    const w = createEmptyWorld();
    assert.deepEqual(w.inventory, { gold: 0, items: [] });
    assert.equal(w.quests.length, 0);
    assert.equal(w.combat.mode, 'idle');
  });
});
