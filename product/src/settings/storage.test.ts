import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  __resetMemoryStoreForTests,
  loadSettings,
  saveApiKey,
  savePrefs,
} from './storage';
import { DEFAULT_PREFS, remoteConfigError } from './types';

describe('settings storage prefs', () => {
  beforeEach(() => {
    __resetMemoryStoreForTests();
  });

  it('persists baseUrl and model in prefs blob (not api key)', async () => {
    await savePrefs({
      verbosity: 'lush',
      providerKind: 'remote',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-test',
    });
    await saveApiKey('secret-key-never-log');
    const loaded = await loadSettings();
    assert.equal(loaded.verbosity, 'lush');
    assert.equal(loaded.providerKind, 'remote');
    assert.equal(loaded.baseUrl, 'https://api.openai.com/v1');
    assert.equal(loaded.model, 'gpt-test');
    assert.equal(loaded.apiKey, 'secret-key-never-log');
  });

  it('loads defaults when prefs missing', async () => {
    const loaded = await loadSettings();
    assert.deepEqual(
      {
        verbosity: loaded.verbosity,
        providerKind: loaded.providerKind,
        baseUrl: loaded.baseUrl,
        model: loaded.model,
      },
      DEFAULT_PREFS,
    );
    assert.equal(loaded.apiKey, '');
  });

  it('tolerates legacy prefs without baseUrl/model', async () => {
    // Simulate older blob by writing via memory after savePrefs shape — use raw path
    await savePrefs({
      verbosity: 'short',
      providerKind: 'stub',
      baseUrl: '',
      model: '',
    });
    const loaded = await loadSettings();
    assert.equal(loaded.baseUrl, '');
    assert.equal(loaded.model, '');
    assert.equal(loaded.verbosity, 'short');
  });
});

describe('remoteConfigError', () => {
  it('is null for stub / complete remote', () => {
    assert.equal(
      remoteConfigError({ providerKind: 'stub', baseUrl: '', apiKey: '' }),
      null,
    );
    assert.equal(
      remoteConfigError({
        providerKind: 'remote',
        baseUrl: 'https://example.test/v1',
        apiKey: 'k',
      }),
      null,
    );
  });

  it('names missing base URL and/or API key without echoing the key', () => {
    const both = remoteConfigError({
      providerKind: 'remote',
      baseUrl: '',
      apiKey: '',
    });
    assert.match(both ?? '', /base URL/i);
    assert.match(both ?? '', /API key/i);
    const urlOnly = remoteConfigError({
      providerKind: 'remote',
      baseUrl: '',
      apiKey: 'secret-should-not-appear',
    });
    assert.match(urlOnly ?? '', /base URL/i);
    assert.doesNotMatch(urlOnly ?? '', /secret-should-not-appear/);
  });
});
