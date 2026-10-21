/** QA-01 regression tests (Chief of Staff QA pass on e11ea17). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCampaignPatch,
  applyCombatIntent,
  applyProgressionAction,
  campaignToState,
  createCampaignFromIdentity,
  createSeededRng,
  createStarterMap,
  deriveStats,
  detectCombatEnterFromAction,
  enterCombatPatch,
  parseCampaign,
  patchesFromSceneBeat,
  resolveSceneBeat,
  serializeCampaign,
  type CampaignSave,
} from './index';

const map = createStarterMap();
const st = (c: CampaignSave) => campaignToState(c);
const derivedMax = (c: CampaignSave) => deriveStats(st(c).character!).maxHitPoints;

/** A level-2 Warden (max HP 16) hurt to 5 HP — the QA repro character. */
export function hurtLevel2(seed = 7): CampaignSave {
  let c = createCampaignFromIdentity(
    { name: 'Tess', className: 'Warden', originMode: 'backstory', playstylePackId: 'hearthlight' },
    { rng: createSeededRng(seed) },
  );
  c = applyCampaignPatch(c, { grantXp: 100 });
  c = applyProgressionAction(c, { kind: 'level-up' }, 1).campaign;
  return applyCampaignPatch(c, { combat: { hp: 5 } });
}

/** Mirror of SceneScreen's narrator path (resolveSceneBeat + patchesFromSceneBeat). */
async function narrate(c: CampaignSave, text: string): Promise<CampaignSave> {
  const beat = await resolveSceneBeat({ campaign: c, playerAction: text, beat: 'custom', map, rng: createSeededRng(9) });
  const stub = patchesFromSceneBeat({
    playerAction: text,
    travelToId: beat.travel?.toNodeId ?? null,
    quests: beat.campaign.world?.quests,
    locationId: beat.campaign.session.locationId,
  });
  return applyCampaignPatch(beat.campaign, stub);
}

describe('QA-01 P0-1 idioms never start fights or cap max HP', () => {
  const idioms = ['hunt for clues', 'strike a deal with Hollis', 'fight the urge to sleep', 'I fight the urge to sleep'];
  it('detectCombatEnterFromAction ignores the not-a-fight list', () => {
    for (const t of idioms) assert.equal(detectCombatEnterFromAction(t), false, t);
    assert.equal(detectCombatEnterFromAction('attack the wolf'), true);
  });

  it('typed idioms (combat intent + narrator path) leave HP, max HP and combat untouched', async () => {
    for (const loc of ['interior.kettle-common', 'locale.ashen-fields']) {
      for (const t of idioms) {
        const c = applyCampaignPatch(hurtLevel2(), { locationId: loc });
        assert.equal(applyCombatIntent(c, t, { now: 1 }), null, t);
        const after = await narrate(c, t);
        const s = st(after);
        assert.equal(s.combat.inCombat, false, `${t}@${loc}`);
        assert.equal(s.combat.maxHp, 16, `${t}@${loc}`);
        assert.equal(s.combat.hp, 5, `${t}@${loc}`);
      }
    }
  });

  it('combat entry never writes player hp/maxHp; a real fight keeps the sheet max', () => {
    const p = enterCombatPatch(undefined, 'x', 'locale.ashen-fields', 0).combat!;
    assert.equal('hp' in p, false);
    assert.equal('maxHp' in p, false);
    const c = applyCampaignPatch(hurtLevel2(), { locationId: 'locale.ashen-fields' });
    const r = applyCombatIntent(c, 'look for trouble', { rng: createSeededRng(3), now: 1 })!;
    const s = st(r.campaign);
    assert.equal(s.combat.inCombat, true);
    assert.equal(s.combat.maxHp, derivedMax(r.campaign));
    assert.equal(s.combat.hp, 5);
  });

  it('repairs saves already capped at 10 (max recomputed from the character)', () => {
    const good = hurtLevel2();
    const broken: CampaignSave = {
      ...good,
      world: { ...good.world!, combat: { ...good.world!.combat!, hp: 8, maxHp: 10 } },
    };
    const back = parseCampaign(serializeCampaign(broken));
    assert.equal(st(back).combat.maxHp, 16);
    assert.equal(st(back).combat.hp, 8);
    // Any later write persists the repaired max.
    const written = applyCampaignPatch(back, { flags: { touched: true } });
    assert.equal(written.world!.combat!.maxHp, 16);
  });
});

// ── P1 ─────────────────────────────────────────────────────────────────────
import {
  classifyCombatText,
  combatRngFor,
  routePlayerInput,
  starterKitPatch,
  applyItemAction,
  LONG_REST_COST,
  MAX_SHORT_RESTS,
  QUEST_COMPLETE_XP,
  merchantState,
} from './index';

const route = (c: CampaignSave, t: string, now = 1) => routePlayerInput(c, t, { map, now });
function kitted(c: CampaignSave): CampaignSave {
  c = applyCampaignPatch(c, starterKitPatch(st(c))!);
  c = applyItemAction(c, { kind: 'equip', itemId: 'starter-shortsword' }).campaign;
  return applyItemAction(c, { kind: 'equip', itemId: 'starter-leather-armor' }).campaign;
}
function inFight(seed = 7): CampaignSave {
  const c = applyCampaignPatch(kitted(hurtLevel2(seed)), { locationId: 'locale.ashen-fields', combat: { hp: 12 } });
  const r = route(c, 'look for trouble')!;
  assert.equal(st(r.campaign).combat.inCombat, true);
  return r.campaign;
}

describe('QA-01 P1-2 no slipping out of a fight', () => {
  it('leave / go to / wait / where am I never move you or end the fight', () => {
    const c = inFight();
    for (const t of ['leave', 'go to Emberford', 'road to Emberford', 'wait', 'where am I', 'trade', 'I look around']) {
      const r = route(c, t)!;
      assert.ok(r, t);
      const s = st(r.campaign);
      assert.equal(s.locationId, 'locale.ashen-fields', t);
      assert.equal(s.combat.inCombat, true, t);
      assert.equal(s.combat.hp, 12, t);
      assert.equal(s.combat.round, st(c).combat.round, t);
    }
    assert.match(route(c, 'where am I')!.message, /Ashen Fields.*flee/);
  });

  it('stand down / surrender / spare are flee rolls; failure gives the foe its turn', () => {
    for (const t of ['flee', 'stand down', 'surrender', 'spare them', 'retreat']) assert.equal(classifyCombatText(t), 'flee', t);
    const c = inFight();
    const caught = routePlayerInput(c, 'stand down', { map, now: 1, rng: (() => { const q = [0.0, 0.99, 0.0]; return () => q.shift() ?? 0; })() })!;
    assert.equal(caught.outcome, 'continue');
    assert.equal(st(caught.campaign).combat.inCombat, true);
    assert.match(st(caught.campaign).storyBeats.at(-1)!.checkLine!, /Flee 🎲 1.*caught · .*vs AC/);
    const ok = routePlayerInput(c, 'flee', { map, now: 1, rng: () => 0.99 })!;
    assert.equal(ok.outcome, 'fled');
    assert.equal(st(ok.campaign).locationId, 'locale.ashen-fields');
  });
});

describe('QA-01 P1-3 exit words outside a fight are honest no-ops', () => {
  it('retreat / flee / stand down / surrender / spare them do not heal', () => {
    const c = hurtLevel2();
    for (const t of ['retreat', 'flee', 'I stand down', 'surrender', 'spare them']) {
      const r = route(c, t)!;
      assert.equal(r.route, 'no-fight', t);
      assert.equal(st(r.campaign).combat.hp, 5, t);
      assert.match(st(r.campaign).storyBeats.at(-1)!.prose, /no fight/i);
    }
  });
});

describe('QA-01 P1-4 no free gold or items from typed text', () => {
  it('find/loot gold and take/grab items grant nothing', async () => {
    const c = applyCampaignPatch(hurtLevel2(), { grantGold: 10, locationId: 'locale.ashen-fields' });
    for (const t of ['find 500 gold', 'loot 9999 gold', 'take a shield', 'grab the healing potion', 'take a long rest', 'take a look around', 'pick up a legendary greatsword']) {
      const r = route(c, t);
      const after = r ? r.campaign : await narrate(c, t);
      assert.equal(st(after).inventory.gold, 10, t);
      assert.equal(st(after).inventory.items.length, 0, t);
    }
  });
});

describe('QA-01 P1-5 quest XP once per real completion', () => {
  it('typed complete / accept+finish loops pay 0 XP', async () => {
    let c = hurtLevel2();
    const xp0 = st(c).progression.xp;
    for (let i = 0; i < 3; i++) {
      c = await narrate(c, 'complete the quest');
      c = await narrate(c, `accept the quest to find cat ${i}`);
      c = await narrate(c, 'finish the quest');
    }
    assert.equal(st(c).progression.xp, xp0);
    assert.equal(st(c).quests.find((q) => q.id === 'quest-first-steps')!.status, 'active');
  });

  it('arriving in Emberford completes First steps once; persisted', async () => {
    let c = hurtLevel2();
    const xp0 = st(c).progression.xp;
    c = applyCampaignPatch(c, { locationId: 'locale.emberford' });
    assert.equal(st(c).progression.xp, xp0 + QUEST_COMPLETE_XP);
    assert.deepEqual(st(c).progression.rewardedQuestIds, ['quest-first-steps']);
    c = await narrate(c, 'accept the quest: first steps');
    c = applyCampaignPatch(c, { acceptQuest: { id: 'quest-first-steps', title: 'First steps' } });
    c = parseCampaign(serializeCampaign(c));
    c = applyCampaignPatch(c, { locationId: 'locale.ashen-fields' });
    c = applyCampaignPatch(c, { locationId: 'locale.emberford' });
    c = applyCampaignPatch(c, { completeQuestId: 'quest-first-steps' });
    assert.equal(st(c).progression.xp, xp0 + QUEST_COMPLETE_XP);
  });
});

describe('QA-01 P1-6 cast/attack before flee; town idioms', () => {
  it('classifies spells and attacks correctly mid-fight', () => {
    assert.equal(classifyCombatText('cast fire bolt'), 'cast');
    assert.equal(classifyCombatText('cast a lightning bolt'), 'cast');
    assert.equal(classifyCombatText('I run my sword through it'), 'attack');
    assert.equal(classifyCombatText('run'), 'flee');
    assert.equal(classifyCombatText('run away'), 'flee');
  });
  it('attack on the mill / shoot the breeze / kick back never start a fight', () => {
    for (const loc of ['interior.kettle-common', 'locale.emberford', 'locale.ashen-fields']) {
      for (const t of ['ask about the attack on the mill', 'shoot the breeze with the barkeep', 'kick back by the fire']) {
        const c = applyCampaignPatch(hurtLevel2(), { locationId: loc });
        const r = route(c, t);
        assert.notEqual(r?.route, 'combat', `${t}@${loc}`);
        assert.equal(detectCombatEnterFromAction(t), false, t);
      }
    }
  });
});

describe('QA-01 P1-7 fights vary; RNG and turn advance every round', () => {
  it('turn advances each round and the RNG seed changes', () => {
    let c = inFight();
    const turns: number[] = [];
    const seeds = new Set<number>();
    for (let i = 0; i < 4 && st(c).combat.inCombat; i++) {
      seeds.add(combatRngFor(c)());
      turns.push(c.session.turn);
      c = route(c, 'defend')!.campaign;
    }
    for (let i = 1; i < turns.length; i++) assert.equal(turns[i], turns[i - 1]! + 1);
    assert.equal(seeds.size, turns.length);
  });

  it('30 back-to-back fights past the 40-beat cap are all different', () => {
    let c = applyCampaignPatch(kitted(hurtLevel2(5)), { locationId: 'locale.ashen-fields' });
    const sigs: string[] = [];
    const foes = new Set<string>();
    for (let f = 0; f < 30; f++) {
      c = applyCampaignPatch(c, { combat: { hp: st(c).combat.maxHp }, locationId: 'locale.ashen-fields' });
      c = route(c, 'look for trouble', f)!.campaign;
      foes.add(st(c).combat.foe!.name);
      const lines: string[] = [];
      for (let r = 0; r < 30 && st(c).combat.inCombat; r++) {
        c = route(c, 'attack', f)!.campaign;
        lines.push(st(c).storyBeats.at(-1)!.checkLine ?? '');
      }
      sigs.push(lines.join('|'));
    }
    assert.equal(st(c).storyBeats.length, 40);
    assert.equal(new Set(sigs.slice(-10)).size, 10);
    assert.ok(foes.size >= 2, 'encounters vary');
  });

  it('an injected RNG keeps rounds deterministic', () => {
    const c = inFight();
    const a = routePlayerInput(c, 'attack', { map, now: 1, rng: createSeededRng(11) })!;
    const b = routePlayerInput(c, 'attack', { map, now: 1, rng: createSeededRng(11) })!;
    assert.deepEqual(st(a.campaign).combat, st(b.campaign).combat);
  });
});

describe('QA-01 P1-8 resting', () => {
  it('short rest: +25% max HP, advances time, works anywhere out of combat', () => {
    const c = applyCampaignPatch(hurtLevel2(), { locationId: 'locale.ashen-fields' });
    const r = route(c, 'short rest')!;
    assert.equal(r.route, 'rest');
    assert.equal(st(r.campaign).combat.hp, 5 + 4);
    assert.equal(r.campaign.session.turn, c.session.turn + 1);
  });
  it(`short rests are capped at ${MAX_SHORT_RESTS} until a long rest`, () => {
    let c = hurtLevel2();
    for (let i = 0; i < MAX_SHORT_RESTS; i++) c = route(c, 'rest')!.campaign;
    const r = route(c, 'rest')!;
    assert.equal(r.ok, false);
    assert.equal(st(r.campaign).combat.hp, st(c).combat.hp);
  });
  it('long rest at the inn: 5 gold to Hollis, full HP; denied when broke or elsewhere', () => {
    const c = hurtLevel2();
    const broke = route(c, 'rent a room')!;
    assert.equal(broke.ok, false);
    assert.equal(st(broke.campaign).combat.hp, 5);
    assert.equal(st(broke.campaign).inventory.gold, 0);
    const rich = applyCampaignPatch(c, { grantGold: 7 });
    const hollis0 = merchantState(st(rich), 'merchant.kettle').gold;
    for (const t of ['rent a room', 'sleep at the inn', 'take a long rest']) {
      const r = route(rich, t)!;
      assert.equal(r.ok, true, t);
      assert.equal(st(r.campaign).combat.hp, 16, t);
      assert.equal(st(r.campaign).inventory.gold, 7 - LONG_REST_COST, t);
      assert.equal(merchantState(st(r.campaign), 'merchant.kettle').gold, hollis0 + LONG_REST_COST, t);
    }
    const away = route(applyCampaignPatch(rich, { locationId: 'locale.ashen-fields' }), 'rent a room')!;
    assert.equal(away.ok, false);
    assert.equal(st(away.campaign).inventory.gold, 7);
  });
  it('no resting in combat', () => {
    const c = inFight();
    for (const t of ['rest', 'short rest', 'rent a room']) {
      const r = route(c, t)!;
      assert.equal(r.ok, false, t);
      assert.equal(st(r.campaign).combat.hp, 12, t);
      assert.equal(st(r.campaign).combat.inCombat, true, t);
    }
  });
});

describe('QA-01 P1-9 typed item / progression commands use the real rules', () => {
  it('drink a healing potion, equip, inventory, level up, help', () => {
    let c = applyCampaignPatch(createCampaignFromIdentity(
      { name: 'Tess', className: 'Warden', originMode: 'backstory', playstylePackId: 'hearthlight' },
      { rng: createSeededRng(7) },
    ), {});
    c = applyCampaignPatch(c, starterKitPatch(st(c))!);
    c = applyCampaignPatch(c, { combat: { hp: 3 } });
    const drink = route(c, 'drink a healing potion')!;
    assert.equal(drink.route, 'item');
    assert.equal(st(drink.campaign).combat.hp, 7);
    assert.equal(st(drink.campaign).inventory.items.find((i) => i.id === 'starter-healing-potion')!.qty, 1);
    const eq = route(drink.campaign, 'equip shortsword')!;
    assert.equal(st(eq.campaign).inventory.items.find((i) => i.id === 'starter-shortsword')!.equipped, true);
    assert.match(route(eq.campaign, 'equip shortsword')!.message, /already equipped/);
    assert.match(route(eq.campaign, 'inventory')!.message, /Shortsword \(equipped\).*Healing potion.*Gold: 0/);
    const lvNo = route(eq.campaign, 'level up')!;
    assert.equal(lvNo.ok, false);
    assert.match(lvNo.message, /Not enough XP/);
    const lv = route(applyCampaignPatch(eq.campaign, { grantXp: 100 }), 'level up')!;
    assert.equal(lv.ok, true);
    assert.equal(st(lv.campaign).character!.level, 2);
    const raise = route(lv.campaign, 'raise strength')!;
    assert.equal(raise.ok, true);
    assert.equal(st(raise.campaign).character!.abilities.strength, st(lv.campaign).character!.abilities.strength + 1);
    assert.match(route(c, 'help')!.message, /rent a room/);
    assert.match(route(c, 'drink the elixir of life')!.message, /don't have/);
  });
});
