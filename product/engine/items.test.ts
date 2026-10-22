import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  STARTER_KIT,
  STARTER_KIT_FLAG,
  applyCampaignPatch,
  applyItemAction,
  armorClassWithGear,
  campaignToState,
  createCampaign,
  createCharacter,
  equippedLoadout,
  itemTraits,
  parseCampaign,
  resolveItemAction,
  serializeCampaign,
  starterKitPatch,
  type CampaignSave,
} from './index';

function kitCampaign(): CampaignSave {
  const hero = createCharacter({ id: 'pc', name: 'Asha' });
  let c = createCampaign({ id: 'items-1', party: [hero], world: { quests: [] } });
  const patch = starterKitPatch(campaignToState(c));
  assert.ok(patch);
  c = applyCampaignPatch(c, patch!);
  return c;
}

const ids = (c: CampaignSave) => campaignToState(c).inventory.items.map((i) => i.id);
const item = (c: CampaignSave, id: string) =>
  campaignToState(c).inventory.items.find((i) => i.id === id);

describe('P-INT-01 starter kit', () => {
  it('unpacks once (flag-guarded)', () => {
    const c = kitCampaign();
    assert.deepEqual(ids(c), STARTER_KIT.map((i) => i.id));
    assert.equal(campaignToState(c).flags[STARTER_KIT_FLAG], true);
    assert.equal(starterKitPatch(campaignToState(c)), null);
  });
});

describe('P-INT-01 inspect', () => {
  it('changes no play state; records lore once (TABS-01), then is a no-op', () => {
    const c = kitCampaign();
    const { campaign, result } = applyItemAction(c, {
      kind: 'inspect',
      itemId: 'starter-leather-armor',
    });
    assert.equal(result.ok, true);
    assert.equal(result.patch, null);
    assert.equal(result.narration, null);
    assert.match(result.message, /AC 11/);
    // Only the chronicle's item lore changed — no beat, turn, items or gold.
    assert.deepEqual(campaign.session, c.session);
    assert.deepEqual(campaign.world!.inventory, c.world!.inventory);
    assert.deepEqual(campaign.world!.combat, c.world!.combat);
    assert.equal(campaignToState(campaign).chronicle.items['starter-leather-armor']?.lore, result.message);
    // Second inspect: already recorded → same object back.
    const again = applyItemAction(campaign, { kind: 'inspect', itemId: 'starter-leather-armor' });
    assert.equal(again.campaign, campaign);
  });
});

describe('P-INT-01 use', () => {
  it('healing potion consumes one and heals, narrates in Tale', () => {
    let c = kitCampaign();
    const max = campaignToState(c).combat.maxHp!;
    c = applyCampaignPatch(c, { combat: { hp: max - 3 } });
    const beatsBefore = campaignToState(c).storyBeats.length;
    const { campaign, result } = applyItemAction(
      c,
      { kind: 'use', itemId: 'starter-healing-potion' },
      1000,
    );
    assert.equal(result.ok, true);
    const s = campaignToState(campaign);
    assert.equal(s.combat.hp, max); // capped at max (+3 of 4)
    assert.equal(item(campaign, 'starter-healing-potion')?.qty, 1);
    assert.equal(s.storyBeats.length, beatsBefore + 1);
    const beat = s.storyBeats[s.storyBeats.length - 1]!;
    assert.match(beat.mechanicsLine ?? '', /\+3 HP/);
    assert.doesNotMatch(beat.prose, /\d/);
    assert.equal(beat.playerLine, 'Use Healing potion');
  });

  it('last potion removes the stack', () => {
    let c = kitCampaign();
    c = applyCampaignPatch(c, { combat: { hp: 1 } });
    c = applyItemAction(c, { kind: 'use', itemId: 'starter-healing-potion' }).campaign;
    c = applyItemAction(c, { kind: 'use', itemId: 'starter-healing-potion' }).campaign;
    assert.equal(item(c, 'starter-healing-potion'), undefined);
    assert.equal(
      campaignToState(c).combat.hp,
      Math.min(campaignToState(c).combat.maxHp!, 9),
    );
  });

  it('refuses at full HP without consuming', () => {
    const c = kitCampaign();
    const { campaign, result } = applyItemAction(c, {
      kind: 'use',
      itemId: 'starter-healing-potion',
    });
    assert.equal(result.ok, false);
    assert.equal(campaign, c);
    assert.match(result.message, /full health/);
  });

  it('item with no use says so honestly and changes nothing', () => {
    const c = kitCampaign();
    const { campaign, result } = applyItemAction(c, { kind: 'use', itemId: 'starter-torch' });
    assert.equal(result.ok, false);
    // NARR-04: Tale copy for routed input (no digits); the panel keeps the plain message.
    assert.doesNotMatch(result.narration ?? '', /\d/);
    assert.equal(campaign, c);
    assert.match(result.message, /no use/);
  });
});

describe('P-INT-01 equip', () => {
  it('toggles equipped and updates AC from armor', () => {
    let c = kitCampaign();
    const dex = campaignToState(c).character!.abilities.dexterity;
    const dexMod = Math.floor((dex - 10) / 2);
    assert.equal(armorClassWithGear(dex, campaignToState(c).inventory), 10 + dexMod);
    const r1 = applyItemAction(c, { kind: 'equip', itemId: 'starter-leather-armor' });
    c = r1.campaign;
    assert.equal(r1.result.ok, true);
    assert.ok(r1.result.narration);
    assert.equal(item(c, 'starter-leather-armor')?.equipped, true);
    assert.equal(armorClassWithGear(dex, campaignToState(c).inventory), 11 + dexMod);
    assert.equal(equippedLoadout(campaignToState(c).inventory).armor?.id, 'starter-leather-armor');
    c = applyItemAction(c, { kind: 'equip', itemId: 'starter-leather-armor' }).campaign;
    assert.equal(item(c, 'starter-leather-armor')?.equipped, undefined);
    assert.equal(armorClassWithGear(dex, campaignToState(c).inventory), 10 + dexMod);
  });

  it('one item per slot: equipping a second weapon swaps the first', () => {
    let c = kitCampaign();
    c = applyCampaignPatch(c, { addItem: { id: 'dagger', name: 'Dagger', qty: 1, kind: 'gear' } });
    assert.equal(itemTraits(item(c, 'dagger')!).slot, 'weapon');
    c = applyItemAction(c, { kind: 'equip', itemId: 'starter-shortsword' }).campaign;
    const r = applyItemAction(c, { kind: 'equip', itemId: 'dagger' });
    c = r.campaign;
    assert.match(r.result.message, /replaced Shortsword/);
    assert.equal(item(c, 'dagger')?.equipped, true);
    assert.equal(item(c, 'starter-shortsword')?.equipped, undefined);
  });

  it('rejects equipping non-gear', () => {
    const c = kitCampaign();
    const { campaign, result } = applyItemAction(c, { kind: 'equip', itemId: 'starter-torch' });
    assert.equal(result.ok, false);
    assert.equal(campaign, c);
  });
});

describe('P-INT-01 move', () => {
  it('reorders without narration; clamps at edges', () => {
    let c = kitCampaign();
    const r = applyItemAction(c, { kind: 'move', itemId: 'starter-torch', delta: -1 });
    c = r.campaign;
    assert.equal(r.result.narration, null);
    assert.deepEqual(ids(c), [
      'starter-shortsword',
      'starter-leather-armor',
      'starter-torch',
      'starter-healing-potion',
    ]);
    assert.equal(campaignToState(c).storyBeats.length, 0);
    const top = applyItemAction(c, { kind: 'move', itemId: 'starter-shortsword', delta: -1 });
    assert.equal(top.result.ok, false);
    assert.equal(top.campaign, c);
  });
});

describe('P-INT-01 drop', () => {
  it('removes the stack and narrates', () => {
    let c = kitCampaign();
    const r = applyItemAction(c, { kind: 'drop', itemId: 'starter-healing-potion' });
    c = r.campaign;
    assert.equal(item(c, 'starter-healing-potion'), undefined);
    assert.equal(campaignToState(c).storyBeats.length, 1);
    assert.match(r.result.playerLine ?? '', /Drop 2× Healing potion/);
  });

  it('refuses dropping quest items', () => {
    let c = kitCampaign();
    c = applyCampaignPatch(c, { addItem: { id: 'seal', name: 'Mayor’s seal', qty: 1, kind: 'quest' } });
    const r = applyItemAction(c, { kind: 'drop', itemId: 'seal' });
    assert.equal(r.result.ok, false);
    assert.ok(item(r.campaign, 'seal'));
  });

  it('gold untouched by item actions', () => {
    let c = kitCampaign();
    c = applyCampaignPatch(c, { grantGold: 7 });
    c = applyItemAction(c, { kind: 'drop', itemId: 'starter-torch' }).campaign;
    assert.equal(campaignToState(c).inventory.gold, 7);
  });
});

describe('P-INT-01 save/load round-trip', () => {
  it('keeps equipped/effect/order/beats/HP through serialize → parse', () => {
    let c = kitCampaign();
    c = applyCampaignPatch(c, { combat: { hp: 2 } });
    c = applyItemAction(c, { kind: 'equip', itemId: 'starter-leather-armor' }).campaign;
    c = applyItemAction(c, { kind: 'use', itemId: 'starter-healing-potion' }).campaign;
    c = applyItemAction(c, { kind: 'move', itemId: 'starter-torch', delta: -3 }).campaign;
    const back = parseCampaign(serializeCampaign(c));
    const a = campaignToState(c);
    const b = campaignToState(back);
    assert.deepEqual(b.inventory, a.inventory);
    assert.equal(b.inventory.items[0]!.id, 'starter-torch');
    assert.equal(b.inventory.items.find((i) => i.id === 'starter-leather-armor')?.equipped, true);
    assert.deepEqual(
      b.inventory.items.find((i) => i.id === 'starter-healing-potion')?.effect,
      { type: 'heal', amount: 4 },
    );
    assert.equal(b.combat.hp, 6);
    assert.equal(b.storyBeats.length, 2);
    assert.equal(b.flags[STARTER_KIT_FLAG], true);
  });

  it('resolveItemAction on missing id is an honest reject', () => {
    const r = resolveItemAction(campaignToState(kitCampaign()), { kind: 'use', itemId: 'nope' });
    assert.equal(r.ok, false);
    assert.equal(r.patch, null);
  });
});
