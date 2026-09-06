import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createCampaign,
  createCharacter,
  createSeededRng,
  createStarterMap,
  createNarratorProvider,
  RemoteNarratorProvider,
} from './index';
import {
  detectSuggestedCheck,
  detectTravelSuggestion,
  resolveOpeningBeat,
  resolveSceneBeat,
} from './scene';

describe('scene adventure loop', () => {
  it('detectSuggestedCheck maps climb → strength and persuade → charisma', () => {
    const climb = detectSuggestedCheck('I climb the wall');
    assert.ok(climb);
    assert.equal(climb!.ability, 'strength');
    assert.equal(climb!.label, 'athletics');

    const social = detectSuggestedCheck('persuade the innkeeper');
    assert.ok(social);
    assert.equal(social!.ability, 'charisma');

    assert.equal(detectSuggestedCheck('sit by the fire and wait'), null);
  });

  it('detectTravelSuggestion matches exit label and place name', () => {
    const map = createStarterMap();
    const from = 'interior.kettle-common';
    const byLabel = detectTravelSuggestion(
      'I take the cellar stairs',
      map,
      from,
    );
    assert.ok(byLabel);
    assert.equal(byLabel!.toNodeId, 'interior.kettle-cellar');

    const byName = detectTravelSuggestion(
      'return toward The Copper Kettle',
      map,
      from,
    );
    assert.ok(byName);
    assert.equal(byName!.toNodeId, 'place.copper-kettle');
  });

  it('resolveOpeningBeat works offline with stub and empty party', async () => {
    const camp = createCampaign({
      id: 'scene-open',
      playstylePackId: 'hearthlight',
      session: { locationId: 'interior.kettle-common', turn: 0 },
    });
    assert.equal(camp.party.length, 0);
    const beat = await resolveOpeningBeat(camp, {
      verbosity: 'standard',
      rng: createSeededRng(1),
    });
    assert.equal(beat.narrator.offline, true);
    assert.ok(beat.prose.length > 10);
    assert.equal(beat.campaign.session.turn, 1);
    assert.ok(beat.campaign.session.logSummary.includes('opening'));
    assert.equal(beat.check, null);
    assert.doesNotMatch(beat.prose, /NSFW|explicit/i);
  });

  it('resolveSceneBeat runs check heuristic and advances turn', async () => {
    const pc = createCharacter({
      id: 'pc1',
      name: 'Rook',
      className: 'Warden',
      abilities: {
        strength: 16,
        dexterity: 12,
        constitution: 14,
        intelligence: 10,
        wisdom: 13,
        charisma: 8,
      },
    });
    const camp = createCampaign({
      id: 'scene-check',
      playstylePackId: 'hearthlight',
      party: [pc],
      session: { locationId: 'interior.kettle-common', turn: 1 },
    });
    const beat = await resolveSceneBeat({
      campaign: camp,
      playerAction: 'I search the common room for clues',
      verbosity: 'short',
      rng: createSeededRng(42),
    });
    assert.ok(beat.check);
    assert.equal(beat.check!.suggestion.ability, 'wisdom');
    assert.equal(beat.campaign.session.turn, 2);
    // Prose stays narrator-only; check line is structured for UI cards.
    assert.doesNotMatch(beat.prose, /\[[^\]]*DC/i);
    assert.doesNotMatch(beat.prose, /You make your way/i);
    assert.match(beat.check!.line, /perception|wisdom|DC/i);
    assert.ok(beat.campaign.session.logSummary.length > 0);
  });

  it('resolveSceneBeat applies travel when action matches exit', async () => {
    const camp = createCampaign({
      id: 'scene-travel',
      session: { locationId: 'interior.kettle-common', turn: 2 },
    });
    const beat = await resolveSceneBeat({
      campaign: camp,
      playerAction: 'I take the cellar stairs',
      forceCheck: null,
      rng: createSeededRng(3),
    });
    assert.ok(beat.travel);
    assert.equal(beat.travel!.toNodeId, 'interior.kettle-cellar');
    assert.equal(beat.campaign.session.locationId, 'interior.kettle-cellar');
    assert.ok(beat.where);
    assert.match(beat.where!.path, /Cellar|Copper|Ember/i);
    assert.doesNotMatch(beat.prose, /You make your way/i);
  });

  it('showMe returns stub still placeholder offline', async () => {
    const camp = createCampaign({
      id: 'scene-still',
      session: { locationId: 'interior.kettle-common', turn: 1 },
    });
    const beat = await resolveSceneBeat({
      campaign: camp,
      beat: 'continue',
      showMe: true,
    });
    assert.ok(beat.still);
    assert.equal(beat.still!.offline, true);
    assert.equal(beat.still!.placeholder, true);
    assert.ok(beat.still!.cacheKey.startsWith('ia.still.'));
  });

  it('empty party check uses modifier 0 and does not spawn companions', async () => {
    const camp = createCampaign({
      id: 'scene-empty',
      party: [],
      session: { locationId: 'interior.kettle-common', turn: 1 },
    });
    const beat = await resolveSceneBeat({
      campaign: camp,
      playerAction: 'I try to climb the rafters',
      rng: createSeededRng(9),
    });
    assert.equal(beat.campaign.party.length, 0);
    assert.ok(beat.check);
    assert.equal(beat.check!.result.modifier, 0);
  });

  it('remote without config does not block stub path in resolveSceneBeat', async () => {
    const camp = createCampaign({ id: 'scene-stub-path' });
    const stub = createNarratorProvider('stub');
    const beat = await resolveSceneBeat({
      campaign: camp,
      narrator: stub,
      beat: 'opening',
    });
    assert.equal(beat.narrator.offline, true);

    const remote = new RemoteNarratorProvider();
    await assert.rejects(
      () =>
        resolveSceneBeat({
          campaign: camp,
          narrator: remote,
          beat: 'opening',
        }),
      /not configured/i,
    );
  });
});
