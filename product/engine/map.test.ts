import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PATH_SEPARATOR,
  STARTER_MAP_ID,
  buildMapPath,
  createStarterMap,
  formatMapPath,
  listExits,
  placeCampaignAtMapStart,
  setCampaignLocation,
  travel,
  travelByLabel,
  travelCampaign,
  validateMapGraph,
  whereAmI,
} from './map';
import { createCampaign } from './save';

describe('starter map', () => {
  it('validates hierarchy and start node', () => {
    const graph = createStarterMap();
    assert.equal(graph.id, STARTER_MAP_ID);
    assert.equal(validateMapGraph(graph).length, 0);
    assert.ok(graph.nodes[graph.startNodeId]);
    assert.equal(graph.nodes[graph.startNodeId]!.kind, 'interior');
  });

  it('has region → locale → place → interior chain for common room', () => {
    const graph = createStarterMap();
    const parts = buildMapPath(graph, 'interior.kettle-common');
    assert.deepEqual(
      parts.map((p) => p.kind),
      ['region', 'locale', 'place', 'interior'],
    );
    assert.equal(
      formatMapPath(parts),
      [
        'Embervale',
        'Emberford',
        'The Copper Kettle',
        'Common Room',
      ].join(PATH_SEPARATOR),
    );
  });
});

describe('whereAmI', () => {
  it('returns path, description, exits, and on-device line', () => {
    const graph = createStarterMap();
    const here = whereAmI(graph, 'interior.kettle-common');
    assert.equal(here.nodeId, 'interior.kettle-common');
    assert.equal(here.name, 'Common Room');
    assert.match(here.description, /hearth|benches/i);
    assert.match(here.path, /Embervale/);
    assert.match(here.path, /Common Room/);
    assert.ok(here.exits.length >= 2);
    assert.ok(here.exits.some((e) => e.toNodeId === 'place.copper-kettle'));
    assert.match(here.line, /You are at Common Room/);
    assert.match(here.line, /Exits:/);
  });

  it('throws on unknown location', () => {
    const graph = createStarterMap();
    assert.throws(() => whereAmI(graph, 'nope'), /Unknown map node/);
  });
});

describe('navigation', () => {
  it('lists exits with destination names', () => {
    const graph = createStarterMap();
    const exits = listExits(graph, 'locale.emberford');
    assert.ok(exits.some((e) => e.toName === 'The Copper Kettle'));
    assert.ok(exits.some((e) => /Ashen Fields/i.test(e.toName)));
  });

  it('travels by exit id', () => {
    const graph = createStarterMap();
    const to = travel(graph, 'interior.kettle-common', 'to-cellar');
    assert.equal(to, 'interior.kettle-cellar');
    const back = travel(graph, to, 'to-common');
    assert.equal(back, 'interior.kettle-common');
  });

  it('travels by label case-insensitively', () => {
    const graph = createStarterMap();
    const to = travelByLabel(
      graph,
      'interior.kettle-common',
      'CELLAR STAIRS',
    );
    assert.equal(to, 'interior.kettle-cellar');
  });

  it('rejects invalid exits', () => {
    const graph = createStarterMap();
    assert.throws(
      () => travel(graph, 'interior.kettle-common', 'fly'),
      /No exit/,
    );
    assert.throws(
      () => travelByLabel(graph, 'interior.kettle-common', 'teleport'),
      /No exit labeled/,
    );
  });
});

describe('campaign integration', () => {
  it('sets location and travels without changing empty party', () => {
    const graph = createStarterMap();
    let camp = createCampaign({ id: 'map-camp', title: 'Map Test' });
    assert.equal(camp.party.length, 0);
    assert.equal(camp.session.locationId, null);

    camp = placeCampaignAtMapStart(camp, graph);
    assert.equal(camp.session.locationId, graph.startNodeId);
    assert.equal(camp.party.length, 0);

    const here = whereAmI(graph, camp.session.locationId!);
    assert.equal(here.kind, 'interior');

    camp = travelCampaign(camp, graph, 'to-cellar');
    assert.equal(camp.session.locationId, 'interior.kettle-cellar');
    assert.equal(camp.party.length, 0);

    camp = setCampaignLocation(camp, 'locale.ashen-fields');
    assert.equal(camp.session.locationId, 'locale.ashen-fields');
    const fields = whereAmI(graph, camp.session.locationId!);
    assert.equal(fields.pathParts.length, 2);
    assert.equal(fields.pathParts[0]!.kind, 'region');
    assert.equal(fields.pathParts[1]!.kind, 'locale');
  });

  it('travelCampaign requires a current location', () => {
    const graph = createStarterMap();
    const camp = createCampaign({ id: 'no-loc' });
    assert.throws(() => travelCampaign(camp, graph, 'to-cellar'), /no locationId/i);
  });
});
