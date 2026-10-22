import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ABILITY_SCORE_CAP,
  POINTS_PER_LEVEL,
  QUEST_COMPLETE_XP,
  applyCampaignPatch,
  applyProgressionAction,
  armorClassWithGear,
  campaignToState,
  createCampaign,
  createCharacter,
  deriveStats,
  parseCampaign,
  patchesFromSceneBeat,
  progressionSummary,
  serializeCampaign,
  xpForLevel,
  type CampaignSave,
} from './index';

function hero(abilities = {}): CampaignSave {
  const pc = createCharacter({ id: 'pc', name: 'Asha', abilities: { constitution: 12, ...abilities } });
  return createCampaign({ id: 'prog', party: [pc] });
}
const st = (c: CampaignSave) => campaignToState(c);

describe('P-INT-03 XP thresholds', () => {
  it('table: L1 0, L2 100, L3 300, L4 600, L5 1000', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(xpForLevel), [0, 100, 300, 600, 1000]);
  });

  it('grantXp accumulates; negatives ignored; no auto level', () => {
    let c = hero();
    c = applyCampaignPatch(c, { grantXp: 60 });
    c = applyCampaignPatch(c, { grantXp: -500 });
    c = applyCampaignPatch(c, { grantXp: 40 });
    assert.equal(st(c).progression.xp, 100);
    assert.equal(st(c).character!.level, 1);
    assert.equal(progressionSummary(st(c)).canLevelUp, true);
  });

  it('QA-01 P1-5: typed "complete the quest" pays nothing; scripted completion pays once', () => {
    let c = hero();
    const patch = patchesFromSceneBeat({ playerAction: 'complete the quest', quests: st(c).quests });
    c = applyCampaignPatch(c, patch);
    assert.equal(st(c).progression.xp, 0);
    assert.equal(st(c).quests[0]!.status, 'active');
    c = applyCampaignPatch(c, { completeQuestId: st(c).quests[0]!.id });
    assert.equal(st(c).progression.xp, QUEST_COMPLETE_XP);
    // Re-completing an already-done quest grants nothing.
    c = applyCampaignPatch(c, { completeQuestId: st(c).quests[0]!.id });
    assert.equal(st(c).progression.xp, QUEST_COMPLETE_XP);
  });
});

describe('P-INT-03 level-up', () => {
  it('rejects without enough XP (no state change)', () => {
    const c = hero();
    const r = applyProgressionAction(c, { kind: 'level-up' });
    assert.equal(r.result.ok, false);
    assert.match(r.result.message, /Not enough XP: 0\/100/);
    assert.equal(r.campaign, c);
  });

  it('levels once per press, grants points, raises max HP and heals the delta', () => {
    let c = hero();
    c = applyCampaignPatch(c, { grantXp: 350 }); // enough for L3
    c = applyCampaignPatch(c, { combat: { hp: 5 } });
    const before = st(c);
    const oldMax = deriveStats(before.character!).maxHitPoints;
    const r = applyProgressionAction(c, { kind: 'level-up' }, 1);
    c = r.campaign;
    const s = st(c);
    assert.equal(s.character!.level, 2);
    assert.equal(s.party[0]!.level, 2);
    const newMax = deriveStats(s.character!).maxHitPoints;
    assert.ok(newMax > oldMax);
    assert.equal(s.combat.maxHp, newMax);
    assert.equal(s.combat.hp, 5 + (newMax - oldMax));
    assert.equal(s.progression.unspentPoints, POINTS_PER_LEVEL);
    assert.equal(s.progression.xp, 350); // XP is lifetime, not spent
    assert.equal(s.storyBeats.at(-1)?.playerLine, 'Level up');
    // NARR-04: one message (no parenthetical duplicate); the numbers are on the mechanics line.
    assert.match(s.storyBeats.at(-1)!.mechanicsLine ?? '', /Level 2/);
    assert.doesNotMatch(s.storyBeats.at(-1)!.prose, /\d|\(/);
    // Second press: L3 at 300 → ok; third: needs 600 → reject.
    c = applyProgressionAction(c, { kind: 'level-up' }).campaign;
    assert.equal(st(c).character!.level, 3);
    const r3 = applyProgressionAction(c, { kind: 'level-up' });
    assert.equal(r3.result.ok, false);
    assert.equal(r3.campaign, c);
  });

  it('rejects mid-combat', () => {
    let c = hero();
    c = applyCampaignPatch(c, { grantXp: 100, combat: { inCombat: true } });
    const r = applyProgressionAction(c, { kind: 'level-up' });
    assert.equal(r.result.ok, false);
    assert.equal(r.campaign, c);
  });
});

describe('P-INT-03 ability point spend', () => {
  function leveled(abilities = {}) {
    let c = hero(abilities);
    c = applyCampaignPatch(c, { grantXp: 100 });
    return applyProgressionAction(c, { kind: 'level-up' }).campaign;
  }

  it('rejects with no points', () => {
    const c = hero();
    const r = applyProgressionAction(c, { kind: 'spend-point', ability: 'strength' });
    assert.equal(r.result.ok, false);
    assert.match(r.result.message, /No ability points/);
    assert.equal(r.campaign, c);
  });

  it('spends points one at a time, then rejects when out', () => {
    let c = leveled();
    c = applyProgressionAction(c, { kind: 'spend-point', ability: 'strength' }).campaign;
    c = applyProgressionAction(c, { kind: 'spend-point', ability: 'strength' }).campaign;
    assert.equal(st(c).character!.abilities.strength, 12);
    assert.equal(st(c).progression.unspentPoints, 0);
    const r = applyProgressionAction(c, { kind: 'spend-point', ability: 'wisdom' });
    assert.equal(r.result.ok, false);
    assert.equal(st(r.campaign).character!.abilities.wisdom, 10);
  });

  it('rejects at the ability cap', () => {
    const c = leveled({ charisma: ABILITY_SCORE_CAP });
    const r = applyProgressionAction(c, { kind: 'spend-point', ability: 'charisma' });
    assert.equal(r.result.ok, false);
    assert.match(r.result.message, /cap/);
    assert.equal(r.campaign, c);
  });

  it('derived stays consistent: DEX → AC, CON → max HP + combat HP', () => {
    let c = leveled({ dexterity: 13, constitution: 13 });
    const acBefore = armorClassWithGear(13, st(c).inventory);
    c = applyProgressionAction(c, { kind: 'spend-point', ability: 'dexterity' }).campaign; // 14
    const s1 = st(c);
    assert.equal(armorClassWithGear(s1.character!.abilities.dexterity, s1.inventory), acBefore + 1);
    assert.equal(deriveStats(s1.character!).armorClass, acBefore + 1);
    const maxBefore = s1.combat.maxHp!;
    const hpBefore = s1.combat.hp!;
    c = applyProgressionAction(c, { kind: 'spend-point', ability: 'constitution' }).campaign; // 14
    const s2 = st(c);
    const derivedMax = deriveStats(s2.character!).maxHitPoints;
    assert.equal(s2.combat.maxHp, derivedMax);
    assert.equal(derivedMax - maxBefore, 2); // +1 CON mod × level 2
    assert.equal(s2.combat.hp, hpBefore + 2);
  });
});

describe('P-INT-03 save/load', () => {
  it('round-trips xp, points, level, abilities, HP', () => {
    let c = hero();
    c = applyCampaignPatch(c, { grantXp: 120 });
    c = applyProgressionAction(c, { kind: 'level-up' }).campaign;
    c = applyProgressionAction(c, { kind: 'spend-point', ability: 'wisdom' }).campaign;
    const back = st(parseCampaign(serializeCampaign(c)));
    const a = st(c);
    assert.deepEqual(back.progression, { xp: 120, unspentPoints: 1, rewardedQuestIds: [] });
    assert.equal(back.character!.level, 2);
    assert.equal(back.character!.abilities.wisdom, 11);
    assert.equal(back.combat.maxHp, a.combat.maxHp);
    assert.equal(back.combat.hp, a.combat.hp);
  });

  it('older saves without progression load as 0 XP / 0 points', () => {
    const c = hero();
    const raw = JSON.parse(serializeCampaign(c));
    delete raw.world.progression;
    const back = st(parseCampaign(JSON.stringify(raw)));
    assert.deepEqual(back.progression, { xp: 0, unspentPoints: 0, rewardedQuestIds: [] });
  });
});
