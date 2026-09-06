import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { MemoryPersistStore } from '../../engine/persist';
import {
  __resetAppPersistMemoryForTests,
} from './appPersistStore';
import {
  createAppStillProvider,
  loadStillGallery,
  saveStillResult,
} from './stillCache';

describe('app stillCache', () => {
  beforeEach(() => {
    __resetAppPersistMemoryForTests();
  });

  it('createAppStillProvider caches stub results via memory store', async () => {
    const mem = new MemoryPersistStore();
    const provider = createAppStillProvider(mem, 'stub');
    const a = await provider.requestStill({
      subjectKind: 'location',
      locationId: 'interior.kettle-common',
    });
    assert.equal(a.placeholder, true);
    const b = await provider.requestStill({
      subjectKind: 'location',
      locationId: 'interior.kettle-common',
    });
    assert.match(b.message, /\(cached\)/);
    const gallery = await loadStillGallery(mem);
    assert.equal(gallery.length, 1);
  });

  it('remote without config falls back to cached stub', async () => {
    const mem = new MemoryPersistStore();
    const provider = createAppStillProvider(mem, 'remote', {});
    const result = await provider.requestStill({ subjectKind: 'player' });
    assert.equal(result.offline, true);
    assert.equal(result.placeholder, true);
  });

  it('saveStillResult then gallery lists entry', async () => {
    const mem = new MemoryPersistStore();
    const provider = createAppStillProvider(mem);
    const result = await provider.requestStill({
      subjectKind: 'npc',
      subjectId: 'innkeeper',
    });
    // already written by CachingStillProvider; re-save is idempotent for index
    await saveStillResult(result, mem);
    const gallery = await loadStillGallery(mem);
    assert.ok(gallery.some((e) => e.cacheKey === result.cacheKey));
  });
});
