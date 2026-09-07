import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FLAG_HEARTH_FED_ONCE,
  FLAG_HEARTH_FUEL,
  FLAG_HEARTH_NEGLECT,
  FLAG_LAST_WAIT_TICK,
  HEARTH_FUEL_MAX,
  isFuelAction,
  isWaitAction,
  tickWorldAmbient,
} from './ambient';
import { createCampaign } from './save';
import { createNarratorProvider } from './narrator';
import { createStarterMap } from './map';
import { resolveSceneBeat } from './scene';

describe('ambient world-tick (NARR-02b)', () => {
  it('detects wait and fuel actions', () => {
    assert.equal(isWaitAction('I wait by the fire'), true);
    assert.equal(isWaitAction('press the moment'), true);
    assert.equal(isWaitAction('I sit by the hearth'), true);
    assert.equal(isWaitAction('I attack the goblin'), false);
    assert.equal(isFuelAction('I add wood to the fire'), true);
    assert.equal(isFuelAction('stoke the hearth'), true);
    assert.equal(isFuelAction('I wait'), false);
  });

  it('successive hearth waits progress fuel and prose', () => {
    let flags: Record<string, string | number | boolean> = {
      [FLAG_HEARTH_FUEL]: HEARTH_FUEL_MAX,
    };
    const lines: string[] = [];
    const fuels: number[] = [];

    for (let i = 0; i < 4; i += 1) {
      const r = tickWorldAmbient({
        flags,
        locationId: 'interior.kettle-common',
        playerAction: i === 0 ? 'I sit by the fire and wait' : 'I wait',
      });
      flags = { ...flags, ...r.flagPatch };
      lines.push(r.hint.prose ?? '');
      fuels.push(r.hint.hearthFuel ?? -1);
      assert.equal(r.hint.isWait, true);
      assert.equal(r.hint.kind, 'hearth');
    }

    assert.deepEqual(fuels, [3, 2, 1, 0]);
    assert.match(lines[0]!, /flicker/i);
    assert.match(lines[1]!, /weaker/i);
    assert.match(lines[2]!, /almost out/i);
    assert.match(lines[3]!, /goes out|dead hearth|ash/i);
    // No identical canned line across the arc
    assert.equal(new Set(lines).size, lines.length);
    assert.equal(flags[FLAG_HEARTH_FUEL], 0);
    assert.equal(flags[FLAG_LAST_WAIT_TICK], 4);
  });

  it('feeding the fire boosts fuel after neglect', () => {
    let flags: Record<string, string | number | boolean> = {
      [FLAG_HEARTH_FUEL]: 1,
      [FLAG_LAST_WAIT_TICK]: 2,
    };
    const weak = tickWorldAmbient({
      flags,
      locationId: 'interior.kettle-common',
      playerAction: 'wait',
    });
    flags = { ...flags, ...weak.flagPatch };
    assert.equal(flags[FLAG_HEARTH_FUEL], 0);

    const fed = tickWorldAmbient({
      flags,
      locationId: 'interior.kettle-common',
      playerAction: 'I add wood to the fire',
    });
    assert.equal(fed.hint.isFuel, true);
    assert.ok((fed.hint.hearthFuel ?? 0) >= 2);
    assert.match(fed.hint.prose ?? '', /feed|hearth|fire|coals/i);
    flags = { ...flags, ...fed.flagPatch };
    assert.equal(flags[FLAG_HEARTH_NEGLECT], 0);
  });

  it('reload-shaped flags preserve fuel/tick across tickWorldAmbient calls', () => {
    const saved = {
      [FLAG_HEARTH_FUEL]: 2,
      [FLAG_LAST_WAIT_TICK]: 5,
      [FLAG_HEARTH_NEGLECT]: 0,
    };
    const r = tickWorldAmbient({
      flags: saved,
      locationId: 'interior.kettle-common',
      playerAction: 'I wait',
    });
    assert.equal(r.hint.hearthFuel, 1);
    assert.equal(r.flagPatch[FLAG_LAST_WAIT_TICK], 6);
    assert.match(r.hint.prose ?? '', /almost out/i);
  });

  it('non-hearth waits still advance lastWaitTick with varied lines', () => {
    let flags: Record<string, string | number | boolean> = {};
    const a = tickWorldAmbient({
      flags,
      locationId: 'interior.kettle-cellar',
      playerAction: 'I wait',
    });
    flags = { ...flags, ...a.flagPatch };
    const b = tickWorldAmbient({
      flags,
      locationId: 'interior.kettle-cellar',
      playerAction: 'pass time',
    });
    assert.equal(a.hint.kind, 'generic');
    assert.equal(b.flagPatch[FLAG_LAST_WAIT_TICK], 2);
    assert.notEqual(a.hint.prose, b.hint.prose);
  });

  it('resolveSceneBeat persists hearth fuel on campaign flags (offline stub)', async () => {
    const map = createStarterMap();
    let camp = createCampaign({
      id: 'ambient-fire-arc',
      playstylePackId: 'hearthlight',
      session: { locationId: 'interior.kettle-common', turn: 1 },
      flags: { [FLAG_HEARTH_FUEL]: HEARTH_FUEL_MAX },
    });
    const narrator = createNarratorProvider('stub');
    const seen: string[] = [];

    for (const action of [
      'I sit by the fire and wait',
      'I wait',
      'I wait again',
      'wait',
    ]) {
      const beat = await resolveSceneBeat({
        campaign: camp,
        playerAction: action,
        beat: 'custom',
        map,
        narrator,
        skipTravel: true,
        forceCheck: null,
      });
      camp = beat.campaign;
      seen.push(beat.prose);
    }

    assert.equal(camp.flags[FLAG_HEARTH_FUEL], 0);
    assert.equal(camp.flags[FLAG_LAST_WAIT_TICK], 4);
    assert.match(seen[0]!, /flicker/i);
    assert.match(seen[1]!, /weaker/i);
    assert.match(seen[2]!, /almost out/i);
    assert.ok(seen.every((p) => p.trim().length > 10));
    assert.equal(new Set(seen).size, seen.length);

    // Simulate reload: new beat from saved flags continues from fuel 0
    const afterReload = await resolveSceneBeat({
      campaign: camp,
      playerAction: 'I wait',
      beat: 'custom',
      map,
      narrator,
      skipTravel: true,
      forceCheck: null,
    });
    assert.match(afterReload.prose, /ash|out|dead hearth|cold/i);
    assert.ok(
      typeof afterReload.campaign.flags[FLAG_LAST_WAIT_TICK] === 'number' &&
        (afterReload.campaign.flags[FLAG_LAST_WAIT_TICK] as number) >= 5,
    );
  });

  it('NPC feed branch can restart hearth once while already out', () => {
    // Extinguish first; a later wait on dead coals may draw an NPC feed once.
    const flags = {
      [FLAG_HEARTH_FUEL]: 0,
      [FLAG_LAST_WAIT_TICK]: 1, // nextTick = 2 (even) → feed
      [FLAG_HEARTH_NEGLECT]: 1,
    };
    const r = tickWorldAmbient({
      flags,
      locationId: 'interior.kettle-common',
      playerAction: 'I wait',
    });
    assert.equal(r.flagPatch[FLAG_HEARTH_FED_ONCE], true);
    assert.equal(r.hint.hearthFuel, 3);
    assert.match(r.hint.prose ?? '', /stranger|scrap of wood|Flames catch/i);
  });
});
