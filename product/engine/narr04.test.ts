import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyCampaignPatch,
  applyTrade,
  applyItemAction,
  applyProgressionAction,
  applyCombatTurn,
  campaignToState,
  createCampaign,
  createCampaignFromIdentity,
  createCharacter,
  createSeededRng,
  createStarterMap,
  enterCombatPatch,
  formatMechanicsLine,
  parseCampaign,
  resolveOpeningBeat,
  resolveSceneBeat,
  routePlayerInput,
  serializeCampaign,
  spawnFoe,
  starterKitPatch,
  storySoFar,
  selectQuestTab,
  STARTER_QUEST,
  MAX_ITEM_HISTORY,
  type CampaignSave,
  type Rng,
} from './index';
import * as B from './narration/lineBanks';
import { BANNED_PROSE_RE, KNOWN_TOKENS, proseLintIssues } from './narration/lint';
import { Voice } from './narration/voice';

type L = B.Line;
const st = (c: CampaignSave) => campaignToState(c);
const map = createStarterMap();
const PACKS = ['hearthlight', 'ash-ledger'] as const;
const VERBOSITIES = ['short', 'standard', 'lush'] as const;
const LIST_RE = /Nearby:|Exits:|Here at /i;

/* ───────── lint port (Narrative's lint.ts) ───────── */

const banks: [string, readonly L[]][] = [];
const singles: [string, string][] = [];
function walk(p: string, v: unknown): void {
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === 'object' && v[0] && 'lead' in v[0]) banks.push([p, v as L[]]);
    else if (v.length && typeof v[0] === 'string') banks.push([p, (v as string[]).map((s, i) => ({ id: `${p}#${i}`, lead: s }))]);
    return;
  }
  if (typeof v === 'string') {
    singles.push([p, v]);
    return;
  }
  if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(`${p}.${k}`, (v as Record<string, unknown>)[k]);
}
for (const [k, v] of Object.entries(B)) if (typeof v === 'object') walk(k, v);
const LINE_BY_ID = new Map<string, L>();
for (const [, bank] of banks) for (const l of bank) LINE_BY_ID.set(l.id, l);

describe('NARR-04 lint: line banks', () => {
  it('walks a real set of banks', () => {
    assert.ok(banks.length > 200, `banks: ${banks.length}`);
  });

  it('no digits, no banned IP/NSFW/sign-off terms, no unknown tokens', () => {
    const errs: string[] = [];
    const check = (where: string, t: string) => {
      if (/\d/.test(t)) errs.push(`DIGIT ${where}: ${t}`);
      if (BANNED_PROSE_RE.test(t)) errs.push(`BANNED ${where}: ${t.match(BANNED_PROSE_RE)![0]}`);
      for (const m of t.matchAll(/\{(\w+)\}/g)) if (!KNOWN_TOKENS.has(m[1]!)) errs.push(`TOKEN ${where}: ${m[1]}`);
    };
    for (const [p, bank] of banks) for (const l of bank) for (const t of [l.lead, l.body, l.hook]) if (t) check(`${p}/${l.id}`, t);
    for (const [p, t] of singles) {
      // Mechanics-line labels (e.g. "Room · 5 gold…") and plain UI labels are not prose banks.
      if (/^MECHANICS|notes$/.test(p)) continue;
      check(p, t);
    }
    assert.deepEqual(errs, []);
  });

  it('line ids are unique; {companions} lines are tagged; {foe} only in combat banks', () => {
    const ids = new Set<string>();
    const errs: string[] = [];
    for (const [p, bank] of banks) {
      for (const l of bank) {
        if (!p.includes('#') && !l.id.includes('#')) {
          if (ids.has(l.id)) errs.push(`DUP ${l.id}`);
          ids.add(l.id);
        }
        for (const t of [l.lead, l.body, l.hook]) {
          if (!t) continue;
          if (t.includes('{companions}') && l.when?.companions !== true) errs.push(`COMP-UNTAGGED ${l.id}`);
          if (/\{(foe|Foe)\}/.test(t) && !/COMBAT|REST_SHORT\.inCombat|TRADE_IN_COMBAT|WHERE_AM_I_COMBAT|COMBAT_BLOCKED/.test(p)) {
            errs.push(`FOE-OUTSIDE ${p}/${l.id}`);
          }
        }
      }
    }
    assert.deepEqual(errs, []);
  });

  it('every bank has at least three variants per pack', () => {
    const thin: string[] = [];
    for (const [p, bank] of banks) {
      if (bank.length < 3) thin.push(`${p}=${bank.length}`);
      for (const pack of PACKS) {
        const n = bank.filter((l) => !l.when?.pack || l.when.pack === pack).length;
        if (n < 3 && bank.length >= 3) thin.push(`${p}[${pack}]=${n}`);
      }
    }
    assert.deepEqual(thin, []);
  });

  it('the remote-reply lint rejects digits, lists, banned terms and stray tokens', () => {
    assert.ok(proseLintIssues('You find 3 gold.').includes('digit'));
    assert.ok(proseLintIssues('Nearby: the cellar.').length > 0);
    assert.ok(proseLintIssues('A beholder floats over the bar.').some((x) => x.startsWith('banned')));
    assert.ok(proseLintIssues('You greet {npc}.').includes('token'));
    assert.deepEqual(proseLintIssues('Hollis slides a mug across the bar.'), []);
  });
});

/* ───────── anti-repeat ───────── */

describe('NARR-04 anti-repeat', () => {
  it('a path never picks the same line twice in a row (any bank, both packs)', () => {
    const errs: string[] = [];
    for (const [p, bank] of banks) {
      for (const pack of PACKS) {
        const ctx: B.LineContext = {
          pack,
          hpLow: false,
          companions: false,
          recentEvent: null,
          timeOfDay: null,
          hearth: null,
          activeQuestIds: [],
          has: { loot: false, goldLost: false, goldGained: false },
        };
        let last: string | null = null;
        for (let i = 0; i < 12; i++) {
          const v = new Voice({ ctx, seedBase: `rep|${p}|${i}`, lastIds: last ? { k: last } : {} });
          const line = v.pick('k', bank);
          if (!line) break;
          const eligible = bank.filter((l) => B.lineMatches(l, ctx)).length;
          if (line.id === last && eligible > 1) {
            errs.push(`${p}[${pack}] repeated ${line.id}`);
            break;
          }
          last = line.id;
        }
      }
    }
    assert.deepEqual(errs, []);
  });
});

/* ───────── sweep: every route, both packs, all verbosities, seeds 1–50 ───────── */

type Beat = { prose: string; mechanicsLine?: string | null };

function seqRng(seed: number): Rng {
  return createSeededRng(seed);
}

async function playthrough(pack: (typeof PACKS)[number], verbosity: (typeof VERBOSITIES)[number], seed: number) {
  const rng = seqRng(seed);
  let c = createCampaignFromIdentity(
    { name: 'Brannoch', className: seed % 2 ? 'Warden' : 'Mage', originMode: 'backstory', playstylePackId: pack },
    { rng: createSeededRng(seed) },
  );
  c = applyCampaignPatch(c, { playPrefs: { verbosity } });
  const kit = starterKitPatch(st(c));
  if (kit) c = applyCampaignPatch(c, kit);
  const out: Beat[] = [];
  const opening = await resolveOpeningBeat(c, { verbosity, map, rng });
  c = opening.campaign;
  out.push({ prose: opening.prose });
  let now = 1000;
  const act = async (text: string) => {
    now += 1;
    const routed = routePlayerInput(c, text, { map, now, rng });
    if (routed) {
      c = routed.campaign;
    } else {
      const r = await resolveSceneBeat({ campaign: c, playerAction: text, beat: 'custom', verbosity, map, rng, forceCheck: null });
      c = r.campaign;
      out.push({ prose: r.prose, mechanicsLine: r.mechanicsLine ?? null });
    }
  };
  for (const t of [
    'look around',
    'where am I',
    'wait',
    'wait',
    'inventory',
    'help',
    'talk to Hollis',
    'ask him about work',
    'short rest',
    'long rest',
    'buy trail rations',
    'go to the cellar',
    'look around',
    'go up the stairs',
    'leave',
    'go outside',
    'look around',
  ]) {
    await act(t);
  }
  c = applyCampaignPatch(c, { locationId: 'locale.ashen-fields' });
  await act('look for trouble');
  for (let i = 0; i < 10 && st(c).combat.inCombat; i++) await act(i % 3 === 2 ? 'defend' : 'attack');
  await act('level up');
  await act('raise strength');
  await act('where am I');
  const beats = st(c).storyBeats.map((b) => ({ prose: b.prose, mechanicsLine: b.mechanicsLine ?? null }));
  return { beats: [...out, ...beats], campaign: c };
}

describe('NARR-04 sweep: prose is number-free and list-free', () => {
  it('both packs × all verbosities × seeds 1–50', async () => {
    const bad: string[] = [];
    for (const pack of PACKS) {
      for (const v of VERBOSITIES) {
        for (let seed = 1; seed <= 50; seed++) {
          const { beats, campaign } = await playthrough(pack, v, seed);
          for (const b of beats) {
            if (/\d/.test(b.prose)) bad.push(`${pack}/${v}/${seed} DIGIT: ${b.prose}`);
            if (LIST_RE.test(b.prose)) bad.push(`${pack}/${v}/${seed} LIST: ${b.prose}`);
            if (/\{\w+\}/.test(b.prose)) bad.push(`${pack}/${v}/${seed} TOKEN: ${b.prose}`);
            if (BANNED_PROSE_RE.test(b.prose)) bad.push(`${pack}/${v}/${seed} BANNED: ${b.prose}`);
          }
          // Empty party: no {companions}-tagged line was ever chosen.
          for (const [k, id] of Object.entries(st(campaign).flags)) {
            if (!k.startsWith('narr.last.')) continue;
            const line = LINE_BY_ID.get(String(id));
            if (line?.when?.companions === true) bad.push(`${pack}/${v}/${seed} COMPANIONS: ${k}=${id}`);
          }
          if (bad.length > 5) break;
        }
      }
    }
    assert.deepEqual(bad.slice(0, 5), []);
  });

  it('determinism: the same campaign and inputs give the same prose', async () => {
    const a = await playthrough('hearthlight', 'standard', 7);
    const b = await playthrough('hearthlight', 'standard', 7);
    assert.deepEqual(
      a.beats.map((x) => x.prose),
      b.beats.map((x) => x.prose),
    );
  });
});

/* ───────── mechanics line = formatMechanicsLine(delta) ───────── */

function dice(...rolls: [number, number][]): Rng {
  const q = [...rolls];
  return () => {
    const next = q.shift();
    if (!next) throw new Error('scripted rng exhausted');
    return (next[0] - 1) / next[1] + 1e-9;
  };
}
function hero(loc = 'interior.kettle-common', quests = [STARTER_QUEST], gold = 0): CampaignSave {
  const pc = createCharacter({ id: 'pc', name: 'Brannoch', abilities: { strength: 14, dexterity: 12 } });
  let c = createCampaign({ id: 'narr04', party: [pc], world: { quests }, session: { locationId: loc, turn: 1 } });
  c = applyCampaignPatch(c, starterKitPatch(st(c))!);
  if (gold) c = applyCampaignPatch(c, { grantGold: gold });
  return c;
}
const lastBeat = (c: CampaignSave) => st(c).storyBeats.at(-1)!;

describe('NARR-04 mechanics line', () => {
  it('buy and sell', () => {
    const c = hero('interior.smith-forge', [], 50);
    const buy = applyTrade(c, { kind: 'buy', merchantId: 'merchant.brightanvil', itemId: 'dagger' });
    assert.equal(buy.result.ok, true);
    const price = st(c).inventory.gold - st(buy.campaign).inventory.gold;
    assert.equal(lastBeat(buy.campaign).mechanicsLine, formatMechanicsLine({ gold: -price, itemsGained: ['Dagger'] }));
    const sell = applyTrade(buy.campaign, { kind: 'sell', merchantId: 'merchant.brightanvil', itemId: 'dagger' });
    const got = st(sell.campaign).inventory.gold - st(buy.campaign).inventory.gold;
    assert.equal(lastBeat(sell.campaign).mechanicsLine, formatMechanicsLine({ gold: got, itemsLost: ['Dagger'] }));
  });

  it('victory and defeat', () => {
    let c = hero('region.embervale', [], 3);
    const start = enterCombatPatch(undefined, 'Combat begins', 'region.embervale', 0);
    const foe = { ...spawnFoe('region.embervale'), hp: 1 };
    c = applyCampaignPatch(c, { combat: { ...start.combat, foe, foeHp: 1, foeMaxHp: foe.maxHp } });
    const win = applyCombatTurn(c, 'attack', { rng: dice([15, 20]) });
    assert.equal(win.result.outcome, 'victory');
    assert.equal(
      lastBeat(win.campaign).mechanicsLine,
      formatMechanicsLine({ xp: foe.xp, gold: foe.gold, itemsGained: [foe.loot!.name] }),
    );
    let d = hero('region.embervale', [], 7);
    const foe2 = spawnFoe('region.embervale');
    d = applyCampaignPatch(d, { combat: { ...start.combat, foe: foe2, foeHp: foe2.hp, foeMaxHp: foe2.maxHp, hp: 1 } });
    const lose = applyCombatTurn(d, 'attack', { rng: dice([2, 20], [15, 20], [6, 6]) });
    assert.equal(lose.result.outcome, 'defeat');
    const s = st(lose.campaign);
    assert.equal(
      lastBeat(lose.campaign).mechanicsLine,
      formatMechanicsLine({ notes: ['Knocked out'], hp: s.combat.hp!, hpMax: s.combat.maxHp!, gold: -(7 - s.inventory.gold) }),
    );
    assert.match(lastBeat(lose.campaign).mechanicsLine!, /^Knocked out · HP \d+\/\d+ · −\d+ gold$/);
  });

  it('potion, long rest, level up', () => {
    let c = hero();
    const max = st(c).combat.maxHp!;
    c = applyCampaignPatch(c, { combat: { hp: max - 3 } });
    const pot = applyItemAction(c, { kind: 'use', itemId: 'starter-healing-potion' }, 1);
    assert.equal(
      lastBeat(pot.campaign).mechanicsLine,
      formatMechanicsLine({ hpChange: 3, hp: max, hpMax: max, qtyLeft: { name: 'Healing potion', qty: 1 } }),
    );
    const rested = routePlayerInput(applyCampaignPatch(hero(), { grantGold: 10 }), 'long rest', { map })!;
    const rs = st(rested.campaign);
    assert.equal(lastBeat(rested.campaign).mechanicsLine, formatMechanicsLine({ gold: -5, hp: rs.combat.maxHp!, hpMax: rs.combat.maxHp! }));
    let l = applyCampaignPatch(hero(), { grantXp: 100 });
    const before = st(l).combat.maxHp!;
    l = applyProgressionAction(l, { kind: 'level-up' }, 1).campaign;
    const after = st(l).combat.maxHp!;
    assert.equal(
      lastBeat(l).mechanicsLine,
      formatMechanicsLine({ level: 2, maxHp: after, maxHpGain: after - before, abilityPoints: st(l).progression.unspentPoints }),
    );
    assert.doesNotMatch(lastBeat(l).prose, /\d/);
  });

  it('quest complete: arrival in Emberford narrates and shows the reward line', async () => {
    const c = hero('place.copper-kettle');
    const r = await resolveSceneBeat({ campaign: c, playerAction: 'go outside', map, rng: createSeededRng(2), forceCheck: null });
    assert.equal(r.campaign.session.locationId, 'locale.emberford');
    assert.equal(r.mechanicsLine, formatMechanicsLine({ quest: { status: 'complete', title: STARTER_QUEST.title }, xp: 100 }));
    assert.doesNotMatch(r.prose, /\d/);
  });
});

/* ───────── chronicle ───────── */

describe('NARR-04 chronicle', () => {
  it('a place mention is written once, even after repeat arrivals', () => {
    let c = hero('interior.kettle-common');
    const count = () =>
      Object.values(st(c).chronicle.places).reduce((n, p) => n + p.notes.length, 0);
    const first = count();
    for (let i = 0; i < 3; i++) {
      c = applyCampaignPatch(c, { locationId: 'place.copper-kettle' });
      c = applyCampaignPatch(c, { locationId: 'interior.kettle-common' });
    }
    assert.equal(count(), first);
  });

  it('storySoFar: stable, ordered by when things happened, no digits', () => {
    let c = hero('interior.kettle-common', []);
    c = applyCampaignPatch(c, { session: { turn: 2 } });
    c = applyCampaignPatch(c, { deed: { kind: 'quest', text: 'Completed “Lost cat”', questTitle: 'Lost cat', questId: 'q.cat' } });
    c = applyCampaignPatch(c, { session: { turn: 5 } });
    c = applyCampaignPatch(c, {
      deed: { kind: 'victory', text: 'Defeated a road bandit in Embervale', foeName: 'Road bandit', locationId: 'region.embervale' },
    });
    c = applyCampaignPatch(c, { deed: { kind: 'level', text: 'Reached level 2', level: 2 } });
    const s = storySoFar(st(c));
    assert.equal(s, storySoFar(st(c)));
    assert.doesNotMatch(s, /\d/);
    const qi = s.indexOf('“Lost cat”');
    const vi = s.indexOf('road bandit');
    assert.ok(qi >= 0 && vi >= 0 && qi < vi, s);
    assert.ok(s.indexOf('Hollis') > vi, 'people come last');
  });

  it('legacy (text-only) deeds still read: facts are recovered on load', () => {
    const c = hero('interior.kettle-common', []);
    const raw = JSON.parse(serializeCampaign(c));
    raw.world.chronicle.deeds = [
      { turn: 1, kind: 'victory', text: 'Defeated a scarecrow husk in Ashen Fields' },
      { turn: 2, kind: 'quest', text: 'Completed “First steps”' },
    ];
    const s = storySoFar(st(parseCampaign(JSON.stringify(raw))));
    assert.match(s, /scarecrow husk/);
    assert.match(s, /“First steps”/);
  });

  it('quest journal text has no digits', () => {
    let c = hero('place.copper-kettle');
    c = applyCampaignPatch(c, { locationId: 'locale.emberford' });
    for (const e of [...selectQuestTab(st(c)).active, ...selectQuestTab(st(c)).done]) {
      for (const j of e.journal) assert.doesNotMatch(j.text, /\d/, j.text);
      if (e.nextLead) assert.doesNotMatch(e.nextLead, /\d/);
    }
  });

  it('item history keeps the last three acquisitions; old records migrate to one entry', () => {
    let c = hero('interior.smith-forge', []);
    for (let i = 0; i < 5; i++) {
      c = applyCampaignPatch(c, {
        itemObtained: { itemId: 'dagger', name: 'Dagger', how: i % 2 ? 'bought' : 'found', source: i % 2 ? 'Dagna Brightanvil' : null, locationId: 'interior.smith-forge' },
      });
    }
    const rec = st(c).chronicle.items['dagger']!;
    assert.equal(MAX_ITEM_HISTORY, 3);
    assert.equal(rec.history.length, 3);
    assert.equal(rec.history.at(-1)!.how, rec.how);
    const raw = JSON.parse(serializeCampaign(c));
    delete raw.world.chronicle.items['dagger'].history;
    const migrated = st(parseCampaign(JSON.stringify(raw))).chronicle.items['dagger']!;
    assert.equal(migrated.history.length, 1);
    assert.equal(migrated.history[0]!.how, migrated.how);
  });
});

/* ───────── talk route ───────── */

describe('NARR-04 talk route', () => {
  it('talking to someone here gives a spoken line, no digits; nobody here is honest', () => {
    const c = hero('interior.kettle-common');
    const r = routePlayerInput(c, 'talk to Hollis', { map, now: 1 })!;
    assert.equal(r.route, 'talk');
    assert.match(r.message, /Hollis/);
    assert.doesNotMatch(lastBeat(r.campaign).prose, /\d|Nearby:/);
    assert.ok(Object.keys(st(r.campaign).flags).some((k) => k.startsWith('narr.last.')));
    const bare = routePlayerInput(c, 'talk to him', { map, now: 2 });
    assert.equal(bare?.route, 'talk');
    const field = routePlayerInput(hero('locale.ashen-fields'), 'talk to Hollis', { map, now: 3 });
    assert.notEqual(field?.route, 'talk');
  });
});

/* ───────── import cycles (port of the TABS-01 cycle check) ───────── */

describe('NARR-04 imports', () => {
  it('engine/ and src/ have no runtime import cycles', () => {
    const root = path.resolve(__dirname, '..');
    const files: Record<string, 1> = {};
    const walkDir = (d: string) => {
      for (const f of fs.readdirSync(d)) {
        const p = path.join(d, f);
        if (fs.statSync(p).isDirectory()) {
          if (f !== 'node_modules') walkDir(p);
        } else if (/\.tsx?$/.test(f) && !/\.test\./.test(f)) files[p] = 1;
      }
    };
    ['engine', 'src'].forEach((d) => walkDir(path.join(root, d)));
    const g: Record<string, string[]> = {};
    for (const f of Object.keys(files)) {
      const s = fs.readFileSync(f, 'utf8');
      g[f] = [];
      for (const m of s.matchAll(/^(?:import|export)\s+(type\s+)?[^'"]*?from\s+['"](\.[^'"]+)['"]/gm)) {
        if (m[1]) continue;
        const t = path.resolve(path.dirname(f), m[2]!);
        for (const ext of ['.ts', '.tsx', '/index.ts']) {
          if (files[t + ext]) {
            g[f]!.push(t + ext);
            break;
          }
        }
      }
    }
    const seen: Record<string, number> = {};
    const stack: string[] = [];
    const cycles = new Set<string>();
    const dfs = (n: string) => {
      seen[n] = 1;
      stack.push(n);
      for (const m of g[n]!) {
        if (seen[m] === 1) cycles.add(stack.slice(stack.indexOf(m)).map((x) => path.relative(root, x)).join(' -> '));
        else if (!seen[m]) dfs(m);
      }
      stack.pop();
      seen[n] = 2;
    };
    Object.keys(g).forEach((n) => {
      if (!seen[n]) dfs(n);
    });
    assert.deepEqual([...cycles], []);
  });
});
