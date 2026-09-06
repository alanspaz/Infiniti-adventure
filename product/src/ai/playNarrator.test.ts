import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createPlayNarrator,
  narrateSceneForPlay,
} from './index';

describe('createPlayNarrator remote wiring', () => {
  it('falls back to stub when remote missing key or URL', () => {
    const a = createPlayNarrator({ providerKind: 'remote', apiKey: '', baseUrl: '' });
    assert.equal(a.provider.kind, 'stub');
    assert.match(a.fallbackNote ?? '', /not configured/i);

    const b = createPlayNarrator({
      providerKind: 'remote',
      apiKey: 'k',
      baseUrl: '',
    });
    assert.equal(b.provider.kind, 'stub');

    const c = createPlayNarrator({
      providerKind: 'remote',
      apiKey: '',
      baseUrl: 'https://example.test/v1',
    });
    assert.equal(c.provider.kind, 'stub');
  });

  it('enables remote with base URL + key and mock fetch', async () => {
    const calls: { url: string; auth?: string | null }[] = [];
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = init?.headers as Record<string, string> | undefined;
      calls.push({ url, auth: headers?.authorization ?? null });
      return {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          created: 1,
          model: 'mock-model',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Remote prose from mock.' },
              finish_reason: 'stop',
            },
          ],
        }),
      } as Response;
    };

    const { provider, fallbackNote } = createPlayNarrator(
      {
        providerKind: 'remote',
        apiKey: 'test-key',
        baseUrl: 'https://example.test/v1/',
        model: 'mock-model',
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    assert.equal(provider.kind, 'remote');
    assert.equal(fallbackNote, null);

    const result = await provider.narrateScene({ beat: 'opening', partyNames: [] });
    assert.equal(result.source, 'remote');
    assert.match(result.prose, /Remote prose/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, 'https://example.test/v1/chat/completions');
    assert.equal(calls[0]!.auth, 'Bearer test-key');
  });

  it('narrateSceneForPlay falls back to stub on remote HTTP failure', async () => {
    const fetchImpl = async () => {
      throw new Error('network down');
    };
    const result = await narrateSceneForPlay(
      {
        providerKind: 'remote',
        apiKey: 'k',
        baseUrl: 'https://example.test/v1',
      },
      { beat: 'opening', partyNames: [] },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    assert.equal(result.providerKind, 'stub');
    assert.equal(result.offline, true);
    assert.match(result.fallbackNote ?? '', /failed|stub/i);
  });

  it('on-device uses reserved stub fallback note', () => {
    const play = createPlayNarrator({ providerKind: 'on-device' });
    assert.equal(play.provider.kind, 'stub');
    assert.match(play.fallbackNote ?? '', /reserved|on-device/i);
  });
});
