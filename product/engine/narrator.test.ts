import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OnDeviceNarratorProvider,
  RemoteNarratorProvider,
  StubNarratorProvider,
  createNarratorProvider,
} from './narrator';
import { resetPlaystylePackRegistry } from './pack';

describe('narrator provider', () => {
  it('stub narrateScene uses hearthlight pack openingBeat offline', async () => {
    resetPlaystylePackRegistry();
    const provider = createNarratorProvider('stub');
    assert.equal(provider.kind, 'stub');
    const result = await provider.narrateScene({
      playstylePackId: 'hearthlight',
      beat: 'opening',
      partyNames: [],
      verbosity: 'standard',
    });
    assert.equal(result.offline, true);
    assert.equal(result.providerKind, 'stub');
    assert.equal(result.source, 'pack-template');
    assert.match(result.prose, /woodsmoke|hearth/i);
    // Opening already implies solitude — aloneClause omitted to avoid doubling.
    assert.doesNotMatch(result.prose, /walk alone/i);
  });

  it('stub narrateScene uses ash-ledger pack template', async () => {
    resetPlaystylePackRegistry();
    const provider = new StubNarratorProvider();
    const result = await provider.narrateScene({
      playstylePackId: 'ash-ledger',
      beat: 'opening',
      partyNames: ['Rook'],
    });
    assert.equal(result.source, 'pack-template');
    assert.match(result.prose, /ledger/i);
    assert.match(result.prose, /Rook/);
  });

  it('stub falls back to canned prose without pack', async () => {
    const provider = createNarratorProvider('stub');
    const result = await provider.narrateScene({
      beat: 'continue',
      partyNames: [],
    });
    assert.equal(result.source, 'canned');
    assert.equal(result.offline, true);
    assert.ok(result.prose.length > 20);
  });

  it('stub createChatCompletion returns OpenAI-like shape', async () => {
    const provider = createNarratorProvider('stub');
    const res = await provider.createChatCompletion({
      messages: [
        { role: 'system', content: 'Narrate briefly.' },
        { role: 'user', content: 'Look around the room.' },
      ],
    });
    assert.equal(res.object, 'chat.completion');
    assert.equal(res.choices.length, 1);
    assert.equal(res.choices[0]!.message.role, 'assistant');
    assert.ok(res.choices[0]!.message.content.length > 0);
    assert.equal(typeof res.id, 'string');
    assert.equal(typeof res.created, 'number');
  });

  it('verbosity short shortens prose', async () => {
    resetPlaystylePackRegistry();
    const provider = createNarratorProvider('stub');
    const lush = await provider.narrateScene({
      playstylePackId: 'hearthlight',
      beat: 'opening',
      verbosity: 'lush',
    });
    const short = await provider.narrateScene({
      playstylePackId: 'hearthlight',
      beat: 'opening',
      verbosity: 'short',
    });
    assert.ok(lush.prose.length > short.prose.length);
    assert.match(lush.prose, /Soft detail/i);
  });

  it('empty party remains valid (no companion injection)', async () => {
    const provider = createNarratorProvider('stub');
    const result = await provider.narrateScene({
      beat: 'opening',
      partyNames: [],
    });
    assert.doesNotMatch(result.prose, /companion was added|auto-spawn/i);
    assert.match(result.prose, /alone|threshold/i);
  });


  it('stub player prose omits raw turn markers and location ids', async () => {
    const provider = createNarratorProvider('stub');
    const result = await provider.narrateScene({
      beat: 'continue',
      partyNames: [],
      locationId: 'emberford-gate',
      turn: 3,
      logSummary: 'T1: opening beat | T2: continue beat',
    });
    assert.doesNotMatch(result.prose, /T\d+:\s*opening beat/i);
    assert.doesNotMatch(result.prose, /Recently:/i);
    assert.doesNotMatch(result.prose, /Place mark:/i);
    assert.doesNotMatch(result.prose, /Turn\s+3/i);
    assert.doesNotMatch(result.prose, /emberford-gate/);
  });

  it('remote throws clear not configured without base URL / key', async () => {
    const provider = createNarratorProvider('remote');
    assert.equal(provider.kind, 'remote');
    await assert.rejects(
      () => provider.narrateScene({ beat: 'opening' }),
      /not configured/i,
    );
    await assert.rejects(
      () =>
        provider.createChatCompletion({
          messages: [{ role: 'user', content: 'hi' }],
        }),
      /not configured/i,
    );
  });

  it('remote configured still does not call network (transport pending)', async () => {
    const provider = new RemoteNarratorProvider({
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'test-key',
    });
    await assert.rejects(
      () => provider.narrateScene({ beat: 'opening' }),
      /not implemented|transport pending/i,
    );
  });

  it('on-device is reserved stub', async () => {
    const provider = createNarratorProvider('on-device');
    assert.equal(provider.kind, 'on-device');
    assert.ok(provider instanceof OnDeviceNarratorProvider);
    await assert.rejects(
      () => provider.narrateScene({ beat: 'opening' }),
      /reserved|not available/i,
    );
  });

  it('stub continue uses pack continueBeat', async () => {
    resetPlaystylePackRegistry();
    const provider = createNarratorProvider('stub');
    const result = await provider.narrateScene({
      playstylePackId: 'hearthlight',
      beat: 'continue',
      partyNames: [],
    });
    assert.equal(result.source, 'pack-template');
    assert.match(result.prose, /Embers settle/i);
    assert.match(result.prose, /walk alone/i);
  });

  it('stub custom does not echo raw playerAction', async () => {
    resetPlaystylePackRegistry();
    const provider = createNarratorProvider('stub');
    const result = await provider.narrateScene({
      playstylePackId: 'ash-ledger',
      beat: 'custom',
      playerAction: 'I climb the black spire of Neverwinter',
      partyNames: [],
    });
    assert.equal(result.source, 'pack-template');
    assert.doesNotMatch(result.prose, /You intended/i);
    assert.doesNotMatch(result.prose, /Neverwinter|climb the black spire/i);
    assert.match(result.prose, /press the moment|Scarce mercies/i);
    assert.doesNotMatch(result.prose, /NSFW|explicit/i);
  });

  it('checkHint appears in stub prose', async () => {
    const provider = createNarratorProvider('stub');
    const result = await provider.narrateScene({
      beat: 'custom',
      playerAction: 'search the desk',
      checkHint: 'Check perception (wisdom) → success',
    });
    assert.match(result.prose, /perception|success/i);
  });

  it('remote enableHttp uses injected fetch when configured', async () => {
    const fetchImpl = async () =>
      ({
        ok: true,
        json: async () => ({
          id: 'chatcmpl-test',
          object: 'chat.completion',
          created: 1,
          model: 'test',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'A quiet hall awaits.' },
              finish_reason: 'stop',
            },
          ],
        }),
      }) as Response;
    const provider = new RemoteNarratorProvider({
      baseUrl: 'https://example.test/v1',
      apiKey: 'k',
      enableHttp: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await provider.narrateScene({ beat: 'opening' });
    assert.equal(result.source, 'remote');
    assert.equal(result.offline, false);
    assert.match(result.prose, /quiet hall/i);
  });

});
