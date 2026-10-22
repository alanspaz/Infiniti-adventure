import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SAVE_SCHEMA_VERSION,
  ITEM_ORIGIN,
  applyCampaignPatch,
  applyCombatTurn,
  applyItemAction,
  applyTrade,
  campaignToState,
  createCampaign,
  createCampaignFromIdentity,
  createCharacter,
  createSeededRng,
  createStarterMap,
  enterCombatPatch,
  parseCampaign,
  patchesFromSceneBeat,
  resolveSceneBeat,
  routePlayerInput,
  selectCharacterTab,
  selectCompanionsTab,
  selectGearTab,
  selectMapTab,
  selectQuestTab,
  serializeCampaign,
  spawnFoe,
  starterKitPatch,
  storySoFar,
  STARTER_QUEST,
  type CampaignSave,
  type Rng,
} from './index';

const st = (c: CampaignSave) => campaignToState(c);
function dice(...rolls: [number, number][]): Rng {
  const q = [...rolls];
  return () => {
    const next = q.shift();
    if (!next) throw new Error('scripted rng exhausted');
    return (next[0] - 1) / next[1] + 1e-9;
  };
}

function hero(loc = 'interior.kettle-common', quests = [STARTER_QUEST]): CampaignSave {
  const pc = createCharacter({ id: 'pc', name: 'Brannoch', abilities: { strength: 14, dexterity: 12 } });
  let c = createCampaign({ id: 'tabs', party: [pc], world: { quests }, session: { locationId: loc, turn: 1 } });
  c = applyCampaignPatch(c, starterKitPatch(st(c))!);
  return c;
}

describe('TABS-01 seeding: new campaign', () => {
  it('identity start records the Common Room chain, Hollis, and what he mentions', () => {
    const c = createCampaignFromIdentity(
      { name: 'Brannoch', className: 'Warden', originMode: 'backstory', playstylePackId: 'hearthlight' },
      { rng: createSeededRng(3) },
    );
    assert.equal(selectCharacterTab(st(c))!.packName.length > 0, true);
    const map = selectMapTab(st(c));
    assert.deepEqual(
      map.chain.map((l) => l.level),
      ['Region', 'Town', 'Building', 'Floor', 'Room'],
    );
    assert.equal(map.hereName, 'Common Room');
    assert.ok(map.visited.some((p) => p.id === 'interior.kettle-common' && p.here));
    assert.ok(map.known.some((p) => p.id === 'place.brightanvil' && p.learnedFrom === 'Hollis'));
    assert.ok(map.exits.some((e) => /cellar/i.test(e.label)));
    const comp = selectCompanionsTab(st(c));
    assert.equal(comp.npcs[0]?.name, 'Hollis');
    assert.equal(comp.npcs[0]?.lastSeenName, 'Common Room');
    assert.equal(comp.slotsUsed, 0);
    assert.equal(comp.slotsTotal, 3);
    const q = selectQuestTab(st(c)).active[0]!;
    assert.equal(q.giver, 'Hollis');
    assert.deepEqual(q.rewards, ['100 XP']);
    assert.ok(q.journal.some((j) => j.kind === 'given' && /Hollis/.test(j.text)));
    assert.ok(q.nextLead);
  });
});

describe('TABS-01 selectors update live', () => {
  it('travel (Tale path) visits the place, then learns from who is there', async () => {
    let c = hero('interior.kettle-common');
    const beat = await resolveSceneBeat({
      campaign: c,
      playerAction: 'I take the cellar stairs',
      forceCheck: null,
      rng: createSeededRng(3),
    });
    c = applyCampaignPatch(beat.campaign, patchesFromSceneBeat({ travelToId: beat.travel?.toNodeId ?? null })[0] ?? {});
    let map = selectMapTab(st(c));
    assert.equal(map.hereName, 'Inn Cellar');
    assert.equal(map.chain.at(-2)?.name, 'Below stairs');
    const cellar = map.visited.find((p) => p.id === 'interior.kettle-cellar')!;
    assert.equal(cellar.visits, 1);
    assert.match(cellar.notes[0]!, /casks of cider/);
    // Engine travel to the smithy: Dagna is met and the vale road becomes known.
    c = applyCampaignPatch(c, { locationId: 'interior.smith-forge' });
    map = selectMapTab(st(c));
    assert.ok(map.visited.some((p) => p.id === 'place.brightanvil'));
    assert.ok(!map.known.some((p) => p.id === 'place.brightanvil'), 'known → visited');
    assert.ok(map.known.some((p) => p.id === 'region.embervale' || p.id === 'locale.ashen-fields'));
    const npcs = selectCompanionsTab(st(c)).npcs.map((n) => n.name);
    assert.deepEqual(npcs.slice(0, 2), ['Dagna Brightanvil', 'Hollis']);
  });

  it('quest beats: arrival completes First steps → journal done, story line, rewards', () => {
    let c = hero('interior.kettle-common');
    c = applyCampaignPatch(c, { updateQuest: { id: 'quest-first-steps', progressNotes: 'Hollis says to try the market.' } });
    let q = selectQuestTab(st(c)).active[0]!;
    assert.equal(q.nextLead, 'Hollis says to try the market.');
    c = applyCampaignPatch(c, { locationId: 'locale.emberford' });
    const tab = selectQuestTab(st(c));
    assert.equal(tab.active.length, 0);
    q = tab.done[0]!;
    assert.ok(q.journal.some((j) => j.kind === 'done' && /Emberford/.test(j.text)));
    assert.ok(q.journal.every((j) => !/\d/.test(j.text)), 'journal text has no digits');
    assert.equal(q.nextLead, null);
    assert.match(storySoFar(st(c)), /“First steps”/);
    assert.equal(storySoFar(st(c)), storySoFar(st(c)), 'stable across renders');
    // Narrator-stub accept → journal "given" entry from the Tale.
    c = applyCampaignPatch(c, { acceptQuest: { id: 'quest-stub', title: 'Lost cat', summary: 'Find the miller’s cat.' } });
    const stub = selectQuestTab(st(c)).active.find((e) => e.quest.id === 'quest-stub')!;
    assert.ok(stub.journal.some((j) => j.kind === 'given'));
    assert.ok(stub.journal.some((j) => j.kind === 'known' && /miller/.test(j.text)));
  });

  it('combat victory: deed, loot origin, place note, story line', () => {
    let c = hero('region.embervale', []);
    const start = enterCombatPatch(undefined, 'Combat begins', 'region.embervale', 0);
    const foe = { ...spawnFoe('region.embervale'), hp: 1 }; // road bandit → dagger
    c = applyCampaignPatch(c, { combat: { ...start.combat, foe, foeHp: 1, foeMaxHp: foe.maxHp } });
    assert.ok(selectCharacterTab(st(c))!.conditions.some((x) => /In combat with road bandit/.test(x)));
    const r = applyCombatTurn(c, 'attack', { rng: dice([15, 20]) });
    assert.equal(r.result.outcome, 'victory');
    const s = st(r.campaign);
    const dagger = selectGearTab(s).pack.find((i) => i.id === 'dagger')!;
    assert.match(dagger.origin.line, /Taken from a road bandit in Embervale/);
    assert.ok(selectMapTab(s).visited.find((p) => p.id === 'region.embervale')!.notes.some((n) => /a road bandit/.test(n)));
    assert.match(storySoFar(s), /road bandit in Embervale/);
    assert.equal(selectCharacterTab(s)!.conditions.some((x) => /In combat/.test(x)), false);
  });

  it('trade: bought item shows seller + place; keeper relationship note; sale noted', () => {
    let c = hero('interior.smith-forge', []);
    c = applyCampaignPatch(c, { grantGold: 50 });
    const stock = st(c);
    const { campaign, result } = applyTrade(c, { kind: 'buy', merchantId: 'merchant.brightanvil', itemId: 'dagger' });
    assert.equal(result.ok, true, result.message);
    let s = st(campaign);
    const d = selectGearTab(s).pack.find((i) => i.id === 'dagger')!;
    assert.match(d.origin.line, /Bought from Dagna/);
    assert.match(selectCompanionsTab(s).npcs.find((n) => n.id === 'npc.dagna')!.relationship, /Sold you the dagger/);
    const sold = applyTrade(campaign, { kind: 'sell', merchantId: 'merchant.brightanvil', itemId: 'dagger' });
    assert.equal(sold.result.ok, true, sold.result.message);
    s = st(sold.campaign);
    assert.match(selectCompanionsTab(s).npcs.find((n) => n.id === 'npc.dagna')!.relationship, /dagger/);
    assert.equal(stock.inventory.gold, 50);
  });

  it('starter kit origin, inspect lore, AC breakdown matches the sheet', () => {
    let c = hero('interior.kettle-common', []);
    let s = st(c);
    const armor = s.inventory.items.find((i) => i.id === 'starter-leather-armor')!;
    assert.match(selectGearTab(s).pack.concat(selectGearTab(s).equipped).find((i) => i.id === armor.id)!.origin.line, /starting kit/);
    c = applyItemAction(c, { kind: 'equip', itemId: armor.id }).campaign;
    c = applyItemAction(c, { kind: 'inspect', itemId: armor.id }).campaign;
    s = st(c);
    const worn = selectGearTab(s).equipped.find((i) => i.id === armor.id)!;
    assert.match(worn.origin.lore ?? '', /AC 11/);
    const ch = selectCharacterTab(s)!;
    assert.equal(ch.ac.baseLabel, armor.name);
    assert.equal(ch.ac.total, ch.ac.base + ch.ac.dex + ch.ac.shield);
    assert.equal(ch.ac.dex, 1);
    assert.match(ch.storySoFar, /Hollis/);
    assert.doesNotMatch(ch.storySoFar, /\d/);
  });

  it('long rest at the Kettle adds a Hollis note; XP bar tracks grants', () => {
    let c = hero('interior.kettle-common', []);
    c = applyCampaignPatch(c, { grantGold: 10, grantXp: 50 });
    const ch = selectCharacterTab(st(c))!;
    assert.equal(ch.xp.xp, 50);
    assert.equal(ch.xp.next, 100);
    assert.equal(ch.xp.toNext, 50);
    assert.equal(ch.xp.pct, 0.5);
    const r = routePlayerInput(c, 'long rest', { map: createStarterMap() })!;
    const hollis = selectCompanionsTab(st(r.campaign)).npcs.find((n) => n.id === 'npc.hollis')!;
    assert.match(hollis.relationship, /upstairs/);
  });

  it('party slots: 3 for a party of 4, escorts free, pets ½', () => {
    const pc = createCharacter({ id: 'pc', name: 'A' });
    const pet = { ...createCharacter({ id: 'p', name: 'Dog' }), partyRole: 'pet' as const };
    const esc = { ...createCharacter({ id: 'e', name: 'Merchant' }), partyRole: 'escort' as const };
    const mate = createCharacter({ id: 'm', name: 'Mate' });
    const c = createCampaign({ id: 'slots', party: [pc, pet, esc, mate], world: { quests: [] } });
    const t = selectCompanionsTab(st(c));
    assert.equal(t.slotsUsed, 1.5);
    assert.equal(t.slotsTotal, 3);
  });
});

describe('TABS-01 save migration v1 → v2', () => {
  it('defaults the chronicle from what a v1 save holds; round-trips at v2', () => {
    const c = hero('place.mossglass');
    const v1 = JSON.parse(serializeCampaign(c));
    v1.schemaVersion = 1;
    delete v1.world.chronicle;
    const migrated = parseCampaign(JSON.stringify(v1));
    assert.equal(migrated.schemaVersion, SAVE_SCHEMA_VERSION);
    assert.equal(SAVE_SCHEMA_VERSION, 2);
    const s = st(migrated);
    assert.ok(s.chronicle.places['place.mossglass']?.status === 'visited');
    assert.ok(s.chronicle.places['locale.emberford']?.status === 'visited');
    assert.ok(s.chronicle.npcs['npc.fennick']);
    assert.equal(selectGearTab(s).pack[0]!.origin.line, ITEM_ORIGIN.carried);
    assert.ok(selectQuestTab(s).active[0]!.journal.length > 0);
    assert.deepEqual(s.chronicle.deeds, []);
    // v1 with no world at all still loads.
    const bare = JSON.parse(serializeCampaign(c));
    bare.schemaVersion = 1;
    delete bare.world;
    assert.ok(st(parseCampaign(JSON.stringify(bare))).chronicle);
    // v2 round-trip keeps the chronicle as-is.
    const again = parseCampaign(serializeCampaign(migrated));
    assert.deepEqual(again.world!.chronicle, migrated.world!.chronicle);
    // Unknown versions are still rejected.
    v1.schemaVersion = 99;
    assert.throws(() => parseCampaign(JSON.stringify(v1)), /schemaVersion/);
  });

  it('junk chronicle data normalizes instead of crashing', () => {
    const c = hero();
    const raw = JSON.parse(serializeCampaign(c));
    raw.world.chronicle = { npcs: { x: 5, y: { name: 'Y', notes: [1, 'ok'] } }, places: 'no', questJournal: [{}], deeds: null };
    const s = st(parseCampaign(JSON.stringify(raw)));
    assert.equal(s.chronicle.npcs.y?.name, 'Y');
    assert.deepEqual(s.chronicle.npcs.y?.notes, ['ok']);
    assert.deepEqual(s.chronicle.places, {});
  });
});
