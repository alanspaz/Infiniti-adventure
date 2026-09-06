import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkModifier,
  createCharacter,
  createSeededRng,
  deriveStats,
  parseNotation,
  resolveCheck,
  resolveContested,
  rollDice,
  rollDie,
  rollNotation,
} from './index';

describe('createSeededRng', () => {
  it('is deterministic for the same seed', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    assert.deepEqual(seqA, seqB);
  });

  it('differs across seeds', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    assert.notEqual(a(), b());
  });
});

describe('rollDie / rollDice', () => {
  it('stays in range for polyhedral sides', () => {
    const rng = createSeededRng(7);
    for (const sides of [4, 6, 8, 10, 12, 20, 100] as const) {
      for (let i = 0; i < 40; i++) {
        const face = rollDie(sides, rng);
        assert.ok(face >= 1 && face <= sides, `d${sides}=${face}`);
      }
    }
  });

  it('sums faces', () => {
    const rng = createSeededRng(99);
    const result = rollDice(3, 6, rng);
    assert.equal(result.faces.length, 3);
    assert.equal(
      result.sum,
      result.faces.reduce((a, b) => a + b, 0),
    );
  });
});

describe('notation', () => {
  it('parses NdM±K', () => {
    assert.deepEqual(parseNotation('2d6+3'), {
      count: 2,
      sides: 6,
      modifier: 3,
      notation: '2d6+3',
    });
    assert.deepEqual(parseNotation('1d20-1'), {
      count: 1,
      sides: 20,
      modifier: -1,
      notation: '1d20-1',
    });
    assert.deepEqual(parseNotation('4d8'), {
      count: 4,
      sides: 8,
      modifier: 0,
      notation: '4d8',
    });
  });

  it('rolls notation with seed', () => {
    const rng = createSeededRng(123);
    const r = rollNotation('2d6+1', rng);
    assert.equal(r.faces.length, 2);
    assert.equal(r.total, r.faces[0] + r.faces[1] + 1);
  });

  it('rejects bad notation', () => {
    assert.throws(() => parseNotation('d20'));
    assert.throws(() => parseNotation('2d7'));
  });
});

describe('resolveCheck', () => {
  it('succeeds when total >= DC', () => {
    // Force high rolls via a fixed stub rng that always returns ~0.999 → face 20
    const alwaysHigh = () => 0.999;
    const r = resolveCheck(2, 15, { rng: alwaysHigh });
    assert.equal(r.d20, 20);
    assert.equal(r.total, 22);
    assert.equal(r.success, true);
    assert.equal(r.natural20, true);
  });

  it('fails when total < DC', () => {
    const alwaysLow = () => 0;
    const r = resolveCheck(0, 10, { rng: alwaysLow });
    assert.equal(r.d20, 1);
    assert.equal(r.success, false);
    assert.equal(r.natural1, true);
  });

  it('advantage keeps higher face', () => {
    // Sequence: first call -> low, second -> high
    let i = 0;
    const seq = [0, 0.999];
    const rng = () => seq[i++] ?? 0.5;
    const r = resolveCheck(0, 1, { mode: 'advantage', rng });
    assert.deepEqual(r.d20Faces, [1, 20]);
    assert.equal(r.d20, 20);
  });

  it('disadvantage keeps lower face', () => {
    let i = 0;
    const seq = [0.999, 0];
    const rng = () => seq[i++] ?? 0.5;
    const r = resolveCheck(0, 1, { mode: 'disadvantage', rng });
    assert.deepEqual(r.d20Faces, [20, 1]);
    assert.equal(r.d20, 1);
  });
});

describe('checkModifier + character wiring', () => {
  it('uses ability modifier and optional proficiency', () => {
    const hero = createCharacter({
      id: 'h1',
      name: 'Hero',
      level: 5,
      abilities: { strength: 16, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    });
    const d = deriveStats(hero);
    assert.equal(checkModifier(hero.abilities, 'strength'), 3);
    assert.equal(
      checkModifier(hero.abilities, 'strength', true, d.proficiencyBonus),
      3 + 3,
    );
  });
});

describe('resolveContested', () => {
  it('compares totals', () => {
    // A rolls 20, B rolls 1
    let i = 0;
    const seq = [0.999, 0];
    const rng = () => seq[i++] ?? 0.5;
    const r = resolveContested(
      { label: 'A', modifier: 0 },
      { label: 'B', modifier: 0 },
      rng,
    );
    assert.equal(r.outcome, 'a');
    assert.equal(r.a.total, 20);
    assert.equal(r.b.total, 1);
  });
});
