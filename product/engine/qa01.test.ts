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
