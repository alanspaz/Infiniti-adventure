import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  ACTIVE_CAMPAIGN_KEY,
  MemoryPersistStore,
  createCampaign,
  loadCampaign,
  saveCampaign,
} from '../../engine';
import {
  AsyncPersistStore,
  __resetAppPersistMemoryForTests,
  __setAsyncStorageForTests,
  getAppPersistStore,
} from './appPersistStore';
import {
  clearActiveCampaign,
  getActiveCampaignId,
  loadActiveCampaign,
  persistCampaign,
  setActiveCampaignId,
} from './campaignPersistence';

describe('AsyncPersistStore memory fallback', () => {
  beforeEach(() => {
    __resetAppPersistMemoryForTests();
  });

  it('round-trips get/set/remove via memory when AsyncStorage absent', async () => {
    const store = new AsyncPersistStore();
    assert.equal(await store.get('k'), null);
    await store.set('k', 'v');
    assert.equal(await store.get('k'), 'v');
    await store.remove('k');
    assert.equal(await store.get('k'), null);
  });

  it('works with engine saveCampaign / loadCampaign; empty party preserved', async () => {
    const store = getAppPersistStore();
    const camp = createCampaign({ id: 'async-1', title: 'Async Path' });
    assert.equal(camp.party.length, 0);
    await saveCampaign(store, camp);
    const loaded = await loadCampaign(store, 'async-1');
    assert.ok(loaded);
    assert.equal(loaded!.party.length, 0);
    assert.equal(loaded!.title, 'Async Path');
  });
});

describe('AsyncPersistStore with injected kv backend', () => {
  beforeEach(() => {
    __resetAppPersistMemoryForTests();
  });

  it('uses injected AsyncStorage-like backend', async () => {
    const map = new Map<string, string>();
    __setAsyncStorageForTests({
      getItem: async (key) => (map.has(key) ? map.get(key)! : null),
      setItem: async (key, value) => {
        map.set(key, value);
      },
      removeItem: async (key) => {
        map.delete(key);
      },
    });
    const store = getAppPersistStore();
    await store.set('ia.save.x', '{"ok":true}');
    assert.equal(map.get('ia.save.x'), '{"ok":true}');
    assert.equal(await store.get('ia.save.x'), '{"ok":true}');
    await store.remove('ia.save.x');
    assert.equal(map.has('ia.save.x'), false);
  });
});

describe('campaignPersistence active campaign', () => {
  beforeEach(() => {
    __resetAppPersistMemoryForTests();
  });

  it('persistCampaign sets active id and loadActiveCampaign restores', async () => {
    const store = new MemoryPersistStore();
    const camp = createCampaign({
      id: 'cont-1',
      title: 'Continue Me',
      playstylePackId: 'hearthlight',
    });
    const saved = await persistCampaign(camp, store);
    assert.equal(await getActiveCampaignId(store), 'cont-1');
    assert.equal(saved.id, 'cont-1');
    const active = await loadActiveCampaign(store);
    assert.ok(active);
    assert.equal(active!.title, 'Continue Me');
    assert.equal(active!.party.length, 0);
  });

  it('setActiveCampaignId null clears pointer; clearActiveCampaign deletes blob', async () => {
    const store = new MemoryPersistStore();
    const camp = createCampaign({ id: 'del-1', title: 'Gone' });
    await persistCampaign(camp, store);
    await setActiveCampaignId(null, store);
    assert.equal(await getActiveCampaignId(store), null);
    assert.ok(await loadCampaign(store, 'del-1'));

    await persistCampaign(camp, store);
    await clearActiveCampaign(store);
    assert.equal(await getActiveCampaignId(store), null);
    assert.equal(await loadCampaign(store, 'del-1'), null);
    assert.equal(await store.get(ACTIVE_CAMPAIGN_KEY), null);
  });
});
