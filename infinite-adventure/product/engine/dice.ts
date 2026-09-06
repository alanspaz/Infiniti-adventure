import { AbilityKey, AbilityScores } from './types';
import { abilityModifier } from './derived';
import { Rng, defaultRng, randomInt } from './rng';

export type DieSides = 4 | 6 | 8 | 10 | 12 | 20 | 100;

export const SUPPORTED_SIDES: DieSides[] = [4, 6, 8, 10, 12, 20, 100];

export type AdvantageMode = 'normal' | 'advantage' | 'disadvantage';

export type DieRollResult = {
  sides: DieSides;
  faces: number[];
  sum: number;
};

export type NotationRollResult = {
  count: number;
  sides: DieSides;
  faces: number[];
  modifier: number;
  total: number;
  notation: string;
};

export type CheckResult = {
  mode: AdvantageMode;
  d20Faces: number[];
  d20: number;
  modifier: number;
  total: number;
  dc: number;
  success: boolean;
  natural20: boolean;
  natural1: boolean;
};

export type ContestedSide = {
  label: string;
  modifier: number;
  mode?: AdvantageMode;
};

export type ContestedResult = {
  a: CheckResult & { label: string };
  b: CheckResult & { label: string };
  outcome: 'a' | 'b' | 'tie';
};

export type ParsedNotation = {
  count: number;
  sides: DieSides;
  modifier: number;
  notation: string;
};

function assertSides(sides: number): asserts sides is DieSides {
  if (!(SUPPORTED_SIDES as number[]).includes(sides)) {
    throw new Error(`Unsupported die sides: ${sides}`);
  }
}

/** Roll a single die with faces 1..sides. */
export function rollDie(sides: DieSides, rng: Rng = defaultRng()): number {
  assertSides(sides);
  return randomInt(rng, 1, sides);
}

/** Roll `count` dice of `sides`; returns faces and sum. */
export function rollDice(
  count: number,
  sides: DieSides,
  rng: Rng = defaultRng(),
): DieRollResult {
  const n = Math.floor(count);
  if (n < 1) throw new Error(`rollDice: count must be >= 1, got ${count}`);
  assertSides(sides);
  const faces: number[] = [];
  for (let i = 0; i < n; i++) {
    faces.push(rollDie(sides, rng));
  }
  return { sides, faces, sum: faces.reduce((a, b) => a + b, 0) };
}

const NOTATION_RE = /^(\d+)d(\d+)([+-]\d+)?$/i;

/** Parse "NdM+K" / "NdM-K" / "NdM". */
export function parseNotation(expr: string): ParsedNotation {
  const trimmed = expr.trim().replace(/\s+/g, '');
  const m = NOTATION_RE.exec(trimmed);
  if (!m) {
    throw new Error(`Invalid dice notation: ${expr}`);
  }
  const count = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const modifier = m[3] ? parseInt(m[3], 10) : 0;
  if (count < 1) throw new Error(`Invalid dice notation count: ${expr}`);
  assertSides(sides);
  return { count, sides, modifier, notation: trimmed.toLowerCase() };
}

export function rollNotation(
  expr: string,
  rng: Rng = defaultRng(),
): NotationRollResult {
  const parsed = parseNotation(expr);
  const { faces, sum } = rollDice(parsed.count, parsed.sides, rng);
  return {
    count: parsed.count,
    sides: parsed.sides,
    faces,
    modifier: parsed.modifier,
    total: sum + parsed.modifier,
    notation: parsed.notation,
  };
}

function rollD20WithMode(
  mode: AdvantageMode,
  rng: Rng,
): { faces: number[]; kept: number } {
  if (mode === 'normal') {
    const face = rollDie(20, rng);
    return { faces: [face], kept: face };
  }
  const a = rollDie(20, rng);
  const b = rollDie(20, rng);
  const kept = mode === 'advantage' ? Math.max(a, b) : Math.min(a, b);
  return { faces: [a, b], kept };
}

/**
 * Ability / skill style check: d20 + modifier vs DC.
 * Natural 20/1 are flagged; v1 does not auto succeed/fail on them.
 */
export function resolveCheck(
  modifier: number,
  dc: number,
  options: { mode?: AdvantageMode; rng?: Rng } = {},
): CheckResult {
  const mode = options.mode ?? 'normal';
  const rng = options.rng ?? defaultRng();
  const { faces, kept } = rollD20WithMode(mode, rng);
  const total = kept + modifier;
  return {
    mode,
    d20Faces: faces,
    d20: kept,
    modifier,
    total,
    dc,
    success: total >= dc,
    natural20: kept === 20,
    natural1: kept === 1,
  };
}

/** Build check modifier from ability scores (+ optional proficiency). */
export function checkModifier(
  abilities: AbilityScores,
  key: AbilityKey,
  proficient = false,
  proficiencyBonus = 0,
): number {
  return abilityModifier(abilities[key]) + (proficient ? proficiencyBonus : 0);
}

/** Contested d20 + modifier; higher total wins. */
export function resolveContested(
  sideA: ContestedSide,
  sideB: ContestedSide,
  rng: Rng = defaultRng(),
): ContestedResult {
  const aCheck = resolveCheck(sideA.modifier, 0, {
    mode: sideA.mode ?? 'normal',
    rng,
  });
  const bCheck = resolveCheck(sideB.modifier, 0, {
    mode: sideB.mode ?? 'normal',
    rng,
  });
  let outcome: 'a' | 'b' | 'tie' = 'tie';
  if (aCheck.total > bCheck.total) outcome = 'a';
  else if (bCheck.total > aCheck.total) outcome = 'b';
  return {
    a: { ...aCheck, label: sideA.label, dc: 0, success: outcome === 'a' },
    b: { ...bCheck, label: sideB.label, dc: 0, success: outcome === 'b' },
    outcome,
  };
}
