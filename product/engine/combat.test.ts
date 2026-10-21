import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RECOVERY_LOCATION_ID,
  applyCampaignPatch,
  applyCombatIntent,
  applyCombatTurn,
  applyItemAction,
  campaignToState,
  createCampaign,
  createCharacter,
  enterCombatPatch,
  isCombatActive,
  parseCampaign,
  playerArmorClass,
  resolveCombatTurn,
  serializeCampaign,
  spawnFoe,
  starterKitPatch,
  weaponProfile,
  type CampaignSave,
  type FoeState,
  type Rng,
} from './index';

/** Scripted RNG: returns faces for d20/dN in order (face → (face-1)/sides float). */
function dice(...rolls: [number, number][]): Rng {
  const q = [...rolls];
  return () => {
    const next = q.shift();
    if (!next) throw new Error('scripted rng exhausted');
    const [face, sides] = next;
    return (face - 1) / sides + 1e-9;
  };
}

function fightCampaign(opts: { foe?: Partial<FoeState>; hp?: number; kit?: boolean; gold?: number } = {}): CampaignSave {
  const pc = createCharacter({
    id: 'pc',
    name: 'Asha',
    abilities: { strength: 14, dexterity: 12, constitution: 12, intelligence: 16 },
  });
  let c = createCampaign({
    id: 'combat',
    party: [pc],
    world: { quests: [] },
    session: { locationId: 'locale.ashen-fields' },
  });
  if (opts.kit !== false) c = applyCampaignPatch(c, starterKitPatch(campaignToState(c))!);
  if (opts.gold) c = applyCampaignPatch(c, { grantGold: opts.gold });
  const start = enterCombatPatch(undefined, 'Combat begins', 'locale.ashen-fields', 0);
  const foe = { ...start.combat!.foe!, ...(opts.foe ?? {}) } as FoeState;
  c = applyCampaignPatch(c, { combat: { ...start.combat, foe, foeHp: foe.hp, foeMaxHp: foe.maxHp } });
  if (opts.hp !== undefined) c = applyCampaignPatch(c, { combat: { hp: opts.hp } });
  return c;
}
const st = (c: CampaignSave) => campaignToState(c);

describe('COMBAT-02 attack rolls (seeded dice)', () => {
  it('weapon profile: shortsword is finesse (max STR/DEX) + prof, unarmed fallback', () => {
    let c = fightCampaign();
    assert.deepEqual(
      { toHit: weaponProfile(st(c)).toHit, dmg: weaponProfile(st(c)).damage },
      { toHit: 2 + 2, dmg: '1' },
    );
    c = applyItemAction(c, { kind: 'equip', itemId: 'starter-shortsword' }).campaign;
    const p = weaponProfile(st(c));
    assert.equal(p.damage, '1d6');
    assert.equal(p.toHit, 4);
    assert.equal(p.damageMod, 2);
  });

  it('hit: d20 14 +4 = 18 vs AC 12, 1d6(5)+2 = 7 dmg; then foe misses', () => {
    let c = fightCampaign();
    c = applyItemAction(c, { kind: 'equip', itemId: 'starter-shortsword' }).campaign;
    const foeHp = st(c).combat.foe!.hp; // ash wolf 9
    const r = applyCombatTurn(c, 'attack', { rng: dice([14, 20], [5, 6], [2, 20]) });
    const s = st(r.campaign);
    assert.equal(r.result.outcome, 'continue');
    assert.equal(s.combat.foe!.hp, foeHp - 7);
    assert.equal(s.combat.foeHp, foeHp - 7);
    assert.match(r.result.rollLine!, /🎲 14\+4=18 vs AC 12 — hit, 7 dmg/);
    assert.match(r.result.rollLine!, /Ash wolf 🎲 2\+3=5 vs AC \d+ — miss/);
    assert.equal(s.storyBeats.at(-1)?.checkLine, r.result.rollLine);
    assert.equal(s.combat.round, 1);
  });

  it('miss and natural 1 deal nothing', () => {
    const c = fightCampaign();
    const r = applyCombatTurn(c, 'attack', { rng: dice([5, 20], [2, 20]) });
    assert.match(r.result.rollLine!, /— miss/);
    assert.equal(st(r.campaign).combat.foe!.hp, 9);
    const f = applyCombatTurn(c, 'attack', { rng: dice([1, 20], [2, 20]) });
    assert.match(f.result.rollLine!, /fumble/);
  });

  it('crit on natural 20 doubles weapon dice', () => {
    let c = fightCampaign({ foe: { hp: 30, maxHp: 30 } });
    c = applyItemAction(c, { kind: 'equip', itemId: 'starter-shortsword' }).campaign;
    const r = applyCombatTurn(c, 'attack', { rng: dice([20, 20], [6, 6], [6, 6], [2, 20]) });
    assert.match(r.result.rollLine!, /CRIT, 14 dmg/);
    assert.equal(st(r.campaign).combat.foe!.hp, 16);
  });

  it('cast uses best mental stat (INT 16 → +3) + prof, 1d10', () => {
    const c = fightCampaign({ foe: { hp: 30, maxHp: 30 } });
    const r = applyCombatTurn(c, 'cast', { rng: dice([10, 20], [7, 10], [2, 20]) });
    assert.match(r.result.rollLine!, /🎲 10\+5=15 vs AC 12 — hit, 7 dmg/);
  });
});

describe('COMBAT-02 enemy turn + stances', () => {
  it('foe hits the player for its damage dice', () => {
    const c = fightCampaign({ hp: 8 });
    const r = applyCombatTurn(c, 'attack', { rng: dice([2, 20], [15, 20], [4, 6]) });
    // Ash wolf 1d6+1 → 5
    assert.equal(st(r.campaign).combat.hp, 3);
    assert.match(r.result.rollLine!, /Ash wolf 🎲 15\+3=18 .* hit, 5 dmg/);
  });

  it('defend adds +2 AC for the foe turn; dodge imposes disadvantage', () => {
    const c = fightCampaign({ hp: 8 });
    const base = playerArmorClass(st(c), 'none');
    // Foe rolls exactly base-3 → total = base → hit normally, miss when defending.
    const face = base - 3;
    const def = applyCombatTurn(c, 'defend', { rng: dice([face, 20]) });
    assert.match(def.result.rollLine!, new RegExp(`vs AC ${base + 2} — miss`));
    assert.equal(st(def.campaign).combat.hp, 8);
    assert.equal(st(def.campaign).combat.tempAcBonus, 2);
    assert.equal(st(def.campaign).combat.stance, 'defend');

    const dodge = applyCombatTurn(c, 'dodge', { rng: dice([18, 20], [3, 20]) });
    assert.match(dodge.result.rollLine!, /\(18,3\)→3\+3=6/);
    assert.equal(st(dodge.campaign).combat.hp, 8);
    // Stance clears on the next non-stance action.
    const after = applyCombatTurn(def.campaign, 'attack', { rng: dice([2, 20], [2, 20]) });
    assert.equal(st(after.campaign).combat.stance, 'none');
    assert.equal(st(after.campaign).combat.tempAcBonus, 0);
  });
});

describe('COMBAT-02 Use Item goes through P-INT-01 logic', () => {
  it('consumes a real healing potion, then the foe acts', () => {
    const c = fightCampaign({ hp: 3 });
    const r = applyCombatTurn(c, 'use-item', { rng: dice([2, 20]) });
    const s = st(r.campaign);
    assert.equal(r.result.ok, true);
    assert.equal(s.combat.hp, 7);
    assert.equal(s.inventory.items.find((i) => i.id === 'starter-healing-potion')?.qty, 1);
  });

  it('refuses (no turn, no change) with no healing item; rail logs honestly', () => {
    const c = fightCampaign({ hp: 3, kit: false });
    const r = resolveCombatTurn(st(c), 'use-item', dice());
    assert.equal(r.ok, false);
    assert.match(r.message, /Nothing usable/);
    const logged = applyCombatTurn(c, 'use-item', { rng: dice(), logRejection: true });
    const s = st(logged.campaign);
    assert.equal(s.combat.hp, 3);
    assert.equal(s.combat.round, 0);
    assert.match(s.storyBeats.at(-1)!.prose, /Nothing usable/);
  });

  it('refuses at full HP without consuming', () => {
    const c = fightCampaign();
    const r = resolveCombatTurn(st(c), 'use-item', dice());
    assert.equal(r.ok, false);
    assert.match(r.message, /full health/);
  });
});

describe('COMBAT-02 victory rewards', () => {
  it('grants XP, gold, loot into inventory; rail hides', () => {
    let c = fightCampaign({ foe: { hp: 1 }, gold: 3 });
    c = applyCampaignPatch(c, {
      combat: {
        foe: { ...spawnFoe('region.embervale'), hp: 1 }, // road bandit: 75xp, 8g, dagger
      },
    });
    const r = applyCombatTurn(c, 'attack', { rng: dice([15, 20]) });
    const s = st(r.campaign);
    assert.equal(r.result.outcome, 'victory');
    assert.equal(isCombatActive(s.combat), false);
    assert.equal(s.combat.foe, null);
    assert.equal(s.progression.xp, 75);
    assert.equal(s.inventory.gold, 11);
    assert.equal(s.inventory.items.find((i) => i.id === 'dagger')?.qty, 1);
    assert.match(s.storyBeats.at(-1)!.prose, /75 XP, 8 gold, Dagger/);
    // Rail actions after the fight do nothing.
    const stray = resolveCombatTurn(s, 'attack', dice());
    assert.equal(stray.ok, false);
  });
});

describe('COMBAT-02 defeat recovery', () => {
  it('knocked out → wake at the Kettle hearth, half HP, half gold lost, never negative', () => {
    const c = fightCampaign({ hp: 2, gold: 7 });
    const r = applyCombatTurn(c, 'attack', { rng: dice([2, 20], [15, 20], [6, 6]) });
    const s = st(r.campaign);
    assert.equal(r.result.outcome, 'defeat');
    assert.equal(s.combat.inCombat, false);
    assert.equal(s.locationId, RECOVERY_LOCATION_ID);
    assert.equal(s.combat.hp, Math.floor(s.combat.maxHp! / 2));
    assert.equal(s.inventory.gold, 4);
    assert.match(s.storyBeats.at(-1)!.prose, /Copper Kettle/);
    // Zero gold: no spend, still fine.
    const broke = applyCombatTurn(fightCampaign({ hp: 1 }), 'attack', {
      rng: dice([2, 20], [15, 20], [6, 6]),
    });
    assert.equal(st(broke.campaign).inventory.gold, 0);
  });
});

describe('COMBAT-02 flee', () => {
  it('escape on DEX check ≥ 10; caught → foe acts', () => {
    const c = fightCampaign({ hp: 8 });
    const ok = applyCombatTurn(c, 'flee', { rng: dice([12, 20]) });
    assert.equal(ok.result.outcome, 'fled');
    assert.equal(st(ok.campaign).combat.inCombat, false);
    const no = applyCombatTurn(c, 'flee', { rng: dice([3, 20], [2, 20]) });
    assert.equal(no.result.outcome, 'continue');
    assert.equal(st(no.campaign).combat.inCombat, true);
  });
});

describe('COMBAT-02 Tale intents', () => {
  function townCampaign(loc: string) {
    const pc = createCharacter({ id: 'pc', name: 'Asha' });
    return createCampaign({ id: 'tale', party: [pc], world: { quests: [] }, session: { locationId: loc } });
  }

  it('"look for trouble" in the Ashen Fields starts a fight (rail shows)', () => {
    const r = applyCombatIntent(townCampaign('locale.ashen-fields'), 'I look for trouble', { rng: dice([1, 2]) });
    assert.ok(r);
    const s = st(r!.campaign);
    assert.equal(isCombatActive(s.combat), true);
    assert.ok(s.combat.foe);
    assert.match(s.storyBeats.at(-1)!.prose, /squares up/);
  });

  it('"look for trouble" in the Common Room is refused honestly', () => {
    const r = applyCombatIntent(townCampaign('interior.kettle-common'), 'look for trouble', { rng: dice() });
    assert.ok(r);
    assert.equal(st(r!.campaign).combat.inCombat, false);
    assert.match(st(r!.campaign).storyBeats.at(-1)!.prose, /Ashen Fields/);
  });

  it('attack verb starts and strikes in one beat; mid-fight text maps to actions', () => {
    let c = townCampaign('interior.kettle-cellar');
    const r = applyCombatIntent(c, 'I attack the rat', { rng: dice([1, 2], [15, 20], [1, 1], [2, 20]) });
    c = r!.campaign;
    assert.equal(st(c).combat.foe?.name, 'Giant cellar rat');
    assert.match(st(c).storyBeats.at(-1)!.checkLine ?? '', /🎲 15/);
    const d = applyCombatIntent(c, 'I raise my guard and block', { rng: dice([2, 20]) });
    assert.equal(st(d!.campaign).combat.stance, 'defend');
    assert.equal(applyCombatIntent(c, 'I look around the cellar', { rng: dice() }), null);
  });

  it('idioms are not fights', () => {
    assert.equal(applyCombatIntent(townCampaign('locale.ashen-fields'), 'strike a deal with the farmer'), null);
    assert.equal(applyCombatIntent(townCampaign('interior.kettle-common'), 'sit by the fire'), null);
  });
});

describe('COMBAT-02 save/load mid-fight', () => {
  it('foe, HP, stance, round survive serialize → parse and the fight continues', () => {
    let c = fightCampaign({ hp: 8 });
    c = applyCombatTurn(c, 'defend', { rng: dice([2, 20]) }).campaign;
    c = applyCombatTurn(c, 'attack', { rng: dice([15, 20], [2, 20]) }).campaign;
    c = applyCombatTurn(c, 'defend', { rng: dice([2, 20]) }).campaign;
    const back = parseCampaign(serializeCampaign(c));
    assert.deepEqual(st(back).combat, st(c).combat);
    assert.equal(st(back).combat.round, 3);
    assert.equal(st(back).combat.stance, 'defend');
    const next = applyCombatTurn(back, 'attack', { rng: dice([15, 20], [2, 20]) });
    assert.equal(next.result.ok, true);
  });
});
