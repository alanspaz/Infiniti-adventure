import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  StubStillProvider,
  createStillProvider,
  stillCacheKey,
} from './stills';

describe('stills provider', () => {
  it('stub returns offline placeholder with cache key', async () => {
    const provider = createStillProvider('stub');
    assert.equal(provider.kind, 'stub');
    const result = await provider.requestStill({
      subjectKind: 'location',
      locationId: 'interior.kettle-common',
      playstylePackId: 'hearthlight',
    });
    assert.equal(result.offline, true);
    assert.equal(result.placeholder, true);
    assert.equal(result.uri, null);
    assert.equal(result.subjectKind, 'location');
    assert.match(result.cacheKey, /^ia\.still\.location\./);
    assert.match(result.message, /placeholder/i);
  });

  it('cache keys are stable for same request', () => {
    const req = {
      subjectKind: 'described' as const,
      prompt: 'Show me the warm inn hearth',
      locationId: 'interior.kettle-common',
    };
    assert.equal(stillCacheKey(req), stillCacheKey(req));
    assert.match(stillCacheKey(req), /described/);
  });

  it('allows empty party / missing subject ids', async () => {
    const provider = new StubStillProvider();
    const result = await provider.requestStill({ subjectKind: 'player' });
    assert.equal(result.placeholder, true);
    assert.match(result.cacheKey, /anon/);
  });

  it('remote throws not configured', async () => {
    const remote = createStillProvider('remote');
    await assert.rejects(
      () => remote.requestStill({ subjectKind: 'npc', subjectId: 'barkeeper' }),
      /not configured/i,
    );
  });

  it('on-device throws reserved', async () => {
    const local = createStillProvider('on-device');
    await assert.rejects(
      () => local.requestStill({ subjectKind: 'item', subjectId: 'lantern' }),
      /reserved|not available/i,
    );
  });

  it('injury stub stays non-NSFW placeholder copy', async () => {
    const provider = createStillProvider('stub');
    const result = await provider.requestStill({
      subjectKind: 'injury',
      prompt: 'bruised forearm from a fall',
    });
    assert.equal(result.offline, true);
    assert.doesNotMatch(result.message, /nsfw|explicit/i);
  });
});
