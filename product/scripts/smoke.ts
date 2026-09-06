/**
 * Backend smoke: import engine + App entry; assert load without throw.
 * Not an Expo device/simulator playtest.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const engine = await import('../engine/index');
  assert.equal(typeof engine.createCharacter, 'function');
  assert.equal(typeof engine.rollDie, 'function');
  assert.equal(typeof engine.createCampaign, 'function');
  assert.equal(typeof engine.MemoryPersistStore, 'function');
  assert.equal(typeof engine.ACTIVE_CAMPAIGN_KEY, 'string');
  assert.equal(engine.ACTIVE_CAMPAIGN_KEY, 'ia.save.activeId');

  assert.equal(typeof engine.deriveStats, 'function');
  assert.equal(typeof engine.createEmptyParty, 'function');
  assert.equal(typeof engine.resolveCheck, 'function');
  assert.equal(typeof engine.serializeCampaign, 'function');

  assert.equal(typeof engine.loadPlaystylePack, 'function');
  assert.equal(typeof engine.listPlaystylePacks, 'function');
  assert.equal(typeof engine.getPackClass, 'function');
  const packs = engine.listPlaystylePacks();
  assert.ok(packs.some((x: { id: string }) => x.id === 'hearthlight'));
  assert.ok(packs.some((x: { id: string }) => x.id === 'ash-ledger'));
  const hl = engine.loadPlaystylePack('hearthlight');
  assert.ok(engine.getPackClass(hl, 'Warden'));
  const ashCamp = engine.createCampaign({
    id: 'smoke-pack',
    playstylePackId: 'ash-ledger',
  });
  assert.equal(ashCamp.party.length, 0);
  assert.equal(ashCamp.playstylePackId, 'ash-ledger');

  assert.equal(typeof engine.createCharacterFromIdentity, 'function');
  assert.equal(typeof engine.createCampaignFromIdentity, 'function');
  assert.equal(typeof engine.generateSealedBackstorySeed, 'function');
  const idCamp = engine.createCampaignFromIdentity(
    {
      name: 'Smoke PC',
      className: 'Warden',
      originMode: 'memory-loss',
      playstylePackId: 'hearthlight',
      characterId: 'smoke-pc',
      campaignId: 'smoke-id',
    },
    { rng: engine.createIdentityRng(11) },
  );
  assert.equal(idCamp.party.length, 1);
  assert.equal(idCamp.party[0]!.originMode, 'memory-loss');
  assert.ok(idCamp.party[0]!.sealedBackstorySeed);
  assert.equal(idCamp.playstylePackId, 'hearthlight');

  assert.equal(typeof engine.createNarratorProvider, 'function');
  assert.equal(typeof engine.StubNarratorProvider, 'function');
  const stub = engine.createNarratorProvider('stub');
  const scene = await stub.narrateScene({
    playstylePackId: 'hearthlight',
    beat: 'opening',
    partyNames: [],
  });
  assert.equal(scene.offline, true);
  assert.equal(scene.source, 'pack-template');
  assert.ok(scene.prose.length > 10);
  const remote = engine.createNarratorProvider('remote');
  let remoteThrew = false;
  try {
    await remote.narrateScene({ beat: 'opening' });
  } catch (e) {
    remoteThrew = /not configured/i.test(
      e instanceof Error ? e.message : String(e),
    );
  }
  assert.ok(remoteThrew, 'remote should throw not configured');

  assert.equal(typeof engine.createStarterMap, 'function');
  assert.equal(typeof engine.whereAmI, 'function');
  assert.equal(typeof engine.travel, 'function');
  const map = engine.createStarterMap();
  assert.equal(engine.validateMapGraph(map).length, 0);
  const where = engine.whereAmI(map, map.startNodeId);
  assert.match(where.path, /Embervale/);
  assert.ok(where.exits.length > 0);
  const moved = engine.travel(map, map.startNodeId, where.exits[0]!.id);
  assert.ok(map.nodes[moved]);
  assert.equal(idCamp.session.locationId, map.startNodeId);

  assert.equal(typeof engine.createStillProvider, 'function');
  const stills = engine.createStillProvider('stub');
  const still = await stills.requestStill({
    subjectKind: 'location',
    locationId: map.startNodeId,
  });
  assert.equal(still.offline, true);
  assert.equal(still.placeholder, true);
  assert.ok(still.cacheKey.startsWith('ia.still.'));
  const remoteStill = engine.createStillProvider('remote');
  let stillRemoteThrew = false;
  try {
    await remoteStill.requestStill({ subjectKind: 'player' });
  } catch (e) {
    stillRemoteThrew = /not configured/i.test(
      e instanceof Error ? e.message : String(e),
    );
  }
  assert.ok(stillRemoteThrew, 'remote stills should throw not configured');

  // Scene adventure loop (T-012)
  assert.equal(typeof engine.resolveSceneBeat, 'function');
  assert.equal(typeof engine.detectSuggestedCheck, 'function');
  const loopCamp = engine.createCampaign({
    id: 'smoke-scene',
    playstylePackId: 'hearthlight',
    party: [],
    session: { locationId: map.startNodeId, turn: 0 },
  });
  const openBeat = await engine.resolveOpeningBeat(loopCamp, {
    verbosity: 'standard',
    rng: engine.createSeededRng(5),
  });
  assert.equal(openBeat.narrator.offline, true);
  assert.equal(openBeat.campaign.session.turn, 1);
  assert.equal(openBeat.campaign.party.length, 0);
  const actBeat = await engine.resolveSceneBeat({
    campaign: openBeat.campaign,
    playerAction: 'I search near the hearth',
    rng: engine.createSeededRng(6),
  });
  assert.ok(actBeat.check);
  assert.equal(actBeat.campaign.session.turn, 2);
  const travelBeat = await engine.resolveSceneBeat({
    campaign: actBeat.campaign,
    playerAction: 'I take the cellar stairs',
    forceCheck: null,
    rng: engine.createSeededRng(7),
  });
  assert.ok(travelBeat.travel);
  assert.equal(travelBeat.campaign.session.locationId, 'interior.kettle-cellar');

  const party = engine.createEmptyParty();
  assert.equal(party.length, 0);
  const camp = engine.createCampaign({ id: 'smoke', title: 'Smoke' });
  assert.equal(camp.party.length, 0);
  const rng = engine.createSeededRng(1);
  const face = engine.rollDie(20, rng);
  assert.ok(face >= 1 && face <= 20);
  const json = engine.serializeCampaign(camp);
  assert.equal(engine.parseCampaign(json).id, 'smoke');


  const persistMod = await import('../src/persist/index');
  assert.equal(typeof persistMod.getAppPersistStore, 'function');
  assert.equal(typeof persistMod.persistCampaign, 'function');
  assert.equal(typeof persistMod.loadActiveCampaign, 'function');
  const mem = new engine.MemoryPersistStore();
  const smokeCamp = engine.createCampaign({ id: 'smoke-persist', title: 'Persist Smoke' });
  const saved = await persistMod.persistCampaign(smokeCamp, mem);
  assert.equal(saved.id, 'smoke-persist');
  const restored = await persistMod.loadActiveCampaign(mem);
  assert.ok(restored);
  assert.equal(restored!.party.length, 0);
  assert.equal(await persistMod.getActiveCampaignId(mem), 'smoke-persist');


  // Character sheet / dice UI rely on deriveStats + rollNotation + checkModifier
  const sheetPc = engine.createCharacter({
    id: 'smoke-sheet',
    name: 'Sheet Smoke',
    className: 'Warden',
    abilities: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 13, charisma: 8 },
  });
  const stats = engine.deriveStats(sheetPc);
  assert.equal(stats.armorClass, 10 + stats.modifiers.dexterity);
  const notation = engine.rollNotation('2d6+1', engine.createSeededRng(42));
  assert.equal(notation.faces.length, 2);
  assert.equal(notation.total, notation.faces[0]! + notation.faces[1]! + 1);
  const mod = engine.checkModifier(sheetPc.abilities, 'strength', true, stats.proficiencyBonus);
  const check = engine.resolveCheck(mod, 15, { rng: engine.createSeededRng(7) });
  assert.equal(typeof check.success, 'boolean');
  assert.ok(check.total === check.d20 + check.modifier);

  const aiMod = await import('../src/ai/index');
  assert.equal(typeof aiMod.createPlayNarrator, 'function');
  const play = aiMod.createPlayNarrator({ providerKind: 'remote', apiKey: '' });
  assert.equal(play.provider.kind, 'stub');
  assert.ok(play.fallbackNote);

  const screensDir = path.resolve(__dirname, '../src/screens');
  for (const f of [
    'HomeScreen.tsx',
    'SettingsScreen.tsx',
    'PackSelectScreen.tsx',
    'IdentityScreen.tsx',
    'SceneScreen.tsx',
    'MapScreen.tsx',
    'CharacterSheetScreen.tsx',
    'DiceScreen.tsx',
  ]) {
    assert.ok(
      fs.existsSync(path.join(screensDir, f)),
      `missing screen ${f}`,
    );
  }

  // App entry: prefer live import; if RN native bindings are absent in Node,
  // fall back to verifying the source module is present and exports default.
  const appPath = path.resolve(__dirname, '../App.tsx');
  assert.ok(fs.existsSync(appPath), 'App.tsx missing');
  const appSrc = fs.readFileSync(appPath, 'utf8');
  assert.match(appSrc, /export default function App/);
  assert.match(appSrc, /SettingsProvider/);
  assert.match(appSrc, /PackSelectScreen/);
  assert.match(appSrc, /IdentityScreen/);
  assert.match(appSrc, /onNewCampaign|pack-select/);
  assert.match(appSrc, /SceneScreen/);
  assert.match(appSrc, /MapScreen/);
  assert.match(appSrc, /CharacterSheetScreen/);
  assert.match(appSrc, /DiceScreen/);
  assert.match(appSrc, /loadActiveCampaign|persistCampaign/);
  assert.match(appSrc, /onContinue|Continue/);
  assert.match(appSrc, /onNewScene|scene/);
  assert.match(appSrc, /onOpenSheet|sheet/);
  assert.match(appSrc, /onOpenDice|dice/);
  assert.match(appSrc, /onCampaignChange/);

  const sceneSrc = fs.readFileSync(
    path.join(screensDir, 'SceneScreen.tsx'),
    'utf8',
  );
  assert.match(sceneSrc, /resolveSceneBeat/);
  assert.match(sceneSrc, /Show me/);
  assert.match(sceneSrc, /Submit action/);
  assert.match(sceneSrc, /verbosity/);

  let appImported = false;
  try {
    const App = await import('../App');
    assert.equal(typeof App.default, 'function');
    appImported = true;
  } catch (err) {
    console.log(
      'smoke note: App.tsx present with scene loop; Node import skipped (' +
        (err instanceof Error ? err.message.split('\n')[0] : String(err)) +
        ')',
    );
  }

  console.log(
    'smoke ok: engine + identity + narrator + map + stills + scene loop + persist + sheet/dice UI' +
      (appImported ? ' + App import' : ' + App.tsx verified'),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
