/** QA-03: a fill-style instant set of 'Brannoch' then submit commits 'Brannoch'. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { campaignToState, createCampaignFromIdentity, createSeededRng } from '../../engine';
import { readHostValue, resolveSubmittedName } from './identityName';

/** Mirror of IdentityScreen: ref-backed setter + submit reading current sources. */
function form() {
  let stateValue = ''; // last rendered value (what a stale closure would see)
  const ref = { current: '' };
  const host = { value: '' }; // RN-web DOM input
  return {
    fill(text: string, { deliverChange = true, render = false } = {}) {
      host.value = text; // the browser sets the DOM value instantly
      if (deliverChange) ref.current = text; // onChangeText
      if (render) stateValue = text;
    },
    typeKey(ch: string) { host.value += ch; ref.current += ch; stateValue += ch; },
    submit() {
      const name = resolveSubmittedName({ domValue: readHostValue(host), latestTyped: ref.current, stateValue });
      return campaignToState(createCampaignFromIdentity(
        { name, className: 'Warden', originMode: 'backstory', playstylePackId: 'hearthlight' },
        { rng: createSeededRng(1) },
      )).character!.name;
    },
  };
}

describe('QA-03 name commits the field value at submit time', () => {
  it('fill then immediate submit (before re-render) commits Brannoch', () => {
    const f = form();
    f.fill('Brannoch');
    assert.equal(f.submit(), 'Brannoch');
  });
  it('typed "Bran" rendered, then paste of "noch" with no change event → Brannoch', () => {
    const f = form();
    for (const ch of 'Bran') f.typeKey(ch);
    f.fill('Brannoch', { deliverChange: false });
    assert.equal(f.submit(), 'Brannoch');
  });
  it('native (no DOM value): latest onChangeText beats a stale state value', () => {
    assert.equal(resolveSubmittedName({ latestTyped: 'Brannoch', stateValue: 'Bran' }), 'Brannoch');
    assert.equal(resolveSubmittedName({ domValue: undefined, latestTyped: '', stateValue: 'Brannoch' }), 'Brannoch');
    assert.equal(readHostValue(null), undefined);
    assert.equal(readHostValue({}), undefined);
  });
  it('a cleared field stays empty (Name is required)', () => {
    assert.equal(resolveSubmittedName({ domValue: '', latestTyped: '', stateValue: '' }), '');
  });
});
