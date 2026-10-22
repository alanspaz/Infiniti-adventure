import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyCampaignPatch,
  applyItemAction,
  applyOpenShop,
  applyTrade,
  buyPrice,
  campaignToState,
  createCampaign,
  createCharacter,
  detectTradeIntent,
  merchantForLocation,
  merchantState,
  parseCampaign,
  serializeCampaign,
  starterKitPatch,
  tradeLedger,
  type CampaignSave,
  type TradeRequest,
} from './index';

const SMITH = 'merchant.brightanvil';
const KETTLE = 'merchant.kettle';

function camp(opts: { gold?: number; loc?: string; pack?: string } = {}): CampaignSave {
  const pc = createCharacter({ id: 'pc', name: 'Asha' });
  let c = createCampaign({
    id: 'shop',
    party: [pc],
    world: { quests: [] },
    session: { locationId: opts.loc ?? 'place.brightanvil' },
    ...(opts.pack ? { playstylePackId: opts.pack } : {}),
  });
  c = applyCampaignPatch(c, starterKitPatch(campaignToState(c))!);
  if (opts.gold) c = applyCampaignPatch(c, { grantGold: opts.gold });
  return c;
}
const st = (c: CampaignSave) => campaignToState(c);
const qty = (items: { id: string; qty: number }[], id: string) =>
  items.find((i) => i.id === id)?.qty ?? 0;

function assertConserved(before: CampaignSave, after: CampaignSave, merchantId: string) {
  const a = tradeLedger(st(before), merchantId);
  const b = tradeLedger(st(after), merchantId);
  assert.equal(b.totalGold, a.totalGold, 'gold checksum');
  assert.equal(b.totalUnits, a.totalUnits, 'item checksum');
  assert.ok(b.playerGold >= 0 && b.merchantGold >= 0);
}

describe('P-INT-04 merchants from location tables', () => {
  it('maps locations to merchants; none on the open road', () => {
    assert.equal(merchantForLocation('interior.kettle-common')?.id, KETTLE);
    assert.equal(merchantForLocation('interior.smith-forge')?.id, SMITH);
    assert.equal(merchantForLocation('place.mossglass')?.id, 'merchant.mossglass');
    assert.equal(merchantForLocation('locale.ashen-fields'), null);
  });

  it('pack table raises buy prices for ash-ledger', () => {
    const base = st(camp());
    const harsh = st(camp({ pack: 'ash-ledger' }));
    const sword = merchantState(base, SMITH).stock.find((i) => i.id === 'shortsword')!;
    assert.equal(buyPrice(base, SMITH, sword), 10);
    assert.equal(buyPrice(harsh, SMITH, sword), 13);
  });
});

describe('P-INT-04 buy', () => {
  it('moves one unit + its price, conserves totals, narrates', () => {
    const c0 = camp({ gold: 15 });
    const { campaign: c1, result } = applyTrade(c0, { kind: 'buy', merchantId: SMITH, itemId: 'shortsword' });
    assert.equal(result.ok, true);
    const s = st(c1);
    assert.equal(s.inventory.gold, 5);
    // QA-01: stacks onto the (unequipped) starter shortsword — one row, ×2.
    assert.equal(s.inventory.items.filter((i) => i.name === 'Shortsword').length, 1);
    assert.equal(qty(s.inventory.items, 'starter-shortsword'), 2);
    assert.equal(merchantState(s, SMITH).gold, 90);
    assert.equal(qty(merchantState(s, SMITH).stock, 'shortsword'), 0);
    assert.equal(s.storyBeats.at(-1)?.playerLine, 'Buy Shortsword');
    assertConserved(c0, c1, SMITH);
  });

  it('stacks repeat buys; sold-out rejects', () => {
    let c = camp({ gold: 20 });
    c = applyTrade(c, { kind: 'buy', merchantId: SMITH, itemId: 'dagger' }).campaign;
    c = applyTrade(c, { kind: 'buy', merchantId: SMITH, itemId: 'dagger' }).campaign;
    assert.equal(qty(st(c).inventory.items, 'dagger'), 2);
    const r = applyTrade(c, { kind: 'buy', merchantId: SMITH, itemId: 'dagger' });
    assert.equal(r.result.ok, false);
    assert.equal(r.campaign, c);
  });

  it('denies when the player cannot afford it (no state change, gold ≥ 0)', () => {
    const c = camp({ gold: 9 });
    const r = applyTrade(c, { kind: 'buy', merchantId: SMITH, itemId: 'chain-shirt' });
    assert.equal(r.result.ok, false);
    assert.match(r.result.message, /Not enough gold: Chain shirt costs 30, you have 9/);
    assert.equal(r.campaign, c);
    assert.equal(st(r.campaign).inventory.gold, 9);
  });
});

describe('P-INT-04 sell', () => {
  it('sells one unit at half price, conserves totals', () => {
    const c0 = camp();
    const { campaign: c1, result } = applyTrade(c0, {
      kind: 'sell',
      merchantId: SMITH,
      itemId: 'starter-healing-potion',
    });
    assert.equal(result.ok, true);
    const s = st(c1);
    assert.equal(s.inventory.gold, 5);
    assert.equal(qty(s.inventory.items, 'starter-healing-potion'), 1);
    assert.equal(qty(merchantState(s, SMITH).stock, 'starter-healing-potion'), 1);
    assert.equal(merchantState(s, SMITH).gold, 75);
    assertConserved(c0, c1, SMITH);
  });

  it('denies when the merchant is broke', () => {
    let c = camp({ loc: 'interior.kettle-common' });
    c = applyCampaignPatch(c, { merchants: { [KETTLE]: { gold: 2, stock: [] } } });
    const r = applyTrade(c, { kind: 'sell', merchantId: KETTLE, itemId: 'starter-shortsword' });
    assert.equal(r.result.ok, false);
    assert.match(r.result.message, /can't afford/);
    assert.equal(r.campaign, c);
  });

  it('protects quest items', () => {
    let c = camp();
    c = applyCampaignPatch(c, { addItem: { id: 'seal', name: 'Mayor’s seal', qty: 1, kind: 'quest' } });
    const r = applyTrade(c, { kind: 'sell', merchantId: SMITH, itemId: 'seal' });
    assert.equal(r.result.ok, false);
    assert.match(r.result.message, /quest/);
    assert.equal(r.campaign, c);
  });

  it('refuses equipped items until unequipped (consistent rule)', () => {
    let c = camp();
    c = applyItemAction(c, { kind: 'equip', itemId: 'starter-shortsword' }).campaign;
    const r = applyTrade(c, { kind: 'sell', merchantId: SMITH, itemId: 'starter-shortsword' });
    assert.equal(r.result.ok, false);
    assert.match(r.result.message, /unequip it first/);
    c = applyItemAction(c, { kind: 'equip', itemId: 'starter-shortsword' }).campaign;
    const ok = applyTrade(c, { kind: 'sell', merchantId: SMITH, itemId: 'starter-shortsword' });
    assert.equal(ok.result.ok, true);
    assert.equal(merchantState(st(ok.campaign), SMITH).stock.find((i) => i.id === 'starter-shortsword')?.equipped, undefined);
  });

  it('denies mid-combat', () => {
    let c = camp({ gold: 50 });
    c = applyCampaignPatch(c, { combat: { inCombat: true } });
    assert.equal(applyTrade(c, { kind: 'buy', merchantId: SMITH, itemId: 'dagger' }).result.ok, false);
  });
});

describe('P-INT-04 checksum invariant over a random-ish session', () => {
  it('totals never change across many mixed trades (accepted or denied)', () => {
    let c = camp({ gold: 25 });
    const start = tradeLedger(st(c), SMITH);
    const reqs: TradeRequest[] = [];
    const sellable = ['starter-healing-potion', 'starter-torch', 'starter-leather-armor', 'dagger', 'shield'];
    const buyable = ['dagger', 'shield', 'shortsword', 'chain-shirt', 'starter-torch'];
    for (let i = 0; i < 40; i++) {
      reqs.push(
        i % 3 === 0
          ? { kind: 'sell', merchantId: SMITH, itemId: sellable[i % sellable.length]! }
          : { kind: 'buy', merchantId: SMITH, itemId: buyable[i % buyable.length]! },
      );
    }
    for (const r of reqs) {
      c = applyTrade(c, r).campaign;
      const l = tradeLedger(st(c), SMITH);
      assert.equal(l.totalGold, start.totalGold);
      assert.equal(l.totalUnits, start.totalUnits);
      assert.ok(l.playerGold >= 0 && l.merchantGold >= 0);
    }
  });
});

describe('P-INT-04 opening the shop', () => {
  it('Tale trade phrases are detected', () => {
    for (const t of ['trade', 'I want to shop', 'buy a potion', 'sell my torch', 'what do you have']) {
      assert.equal(detectTradeIntent(t), true, t);
    }
    assert.equal(detectTradeIntent('sit by the fire'), false);
  });

  it('opens where a merchant works, with a Tale beat; travel closes it', () => {
    let c = camp({ loc: 'interior.kettle-common' });
    const r = applyOpenShop(c, 'trade', 1);
    assert.equal(r.ok, true);
    c = r.campaign;
    assert.equal(st(c).shop.activeMerchantId, KETTLE);
    assert.equal(st(c).storyBeats.at(-1)?.playerLine, 'trade');
    assert.match(st(c).storyBeats.at(-1)!.prose, /Hollis/);
    c = applyCampaignPatch(c, { locationId: 'place.copper-kettle' });
    assert.equal(st(c).shop.activeMerchantId, null);
  });

  it('refuses honestly where nobody trades (still a beat, no shop)', () => {
    const r = applyOpenShop(camp({ loc: 'locale.ashen-fields' }), 'trade', 1);
    assert.equal(r.ok, false);
    assert.equal(st(r.campaign).shop.activeMerchantId, null);
    // NARR-04: TRADE_NOBODY bank line.
    assert.ok(st(r.campaign).flags['narr.last.trade.nobody']);
  });
});

describe('P-INT-04 save/load', () => {
  it('merchant purse/stock and the player side persist', () => {
    let c = camp({ gold: 12 });
    c = applyOpenShop(c, 'trade', 1).campaign;
    c = applyTrade(c, { kind: 'buy', merchantId: SMITH, itemId: 'shield' }).campaign;
    c = applyTrade(c, { kind: 'sell', merchantId: SMITH, itemId: 'starter-torch' }).campaign;
    const back = st(parseCampaign(serializeCampaign(c)));
    const a = st(c);
    assert.deepEqual(back.merchants, a.merchants);
    assert.deepEqual(back.inventory, a.inventory);
    assert.equal(back.shop.activeMerchantId, SMITH);
    assert.equal(merchantState(back, SMITH).gold, 80 + 10 - 1); // +10 shield, −1 torch (min sell price 1)
  });
});
