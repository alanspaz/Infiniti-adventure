/**
 * P-INT-03 — earned character upgrades as CampaignState mutations.
 *
 * XP → (player-triggered) level-up → ability points → spend on abilities.
 * Rules only here; narration describes the result after the fact (stub, offline).
 */
import {
  applyCampaignPatch,
  campaignToState,
  type CampaignState,
  type CampaignStatePatch,
} from './campaignState';
import { deriveStats } from './derived';
import { itemNarrationPatch, withBeatPatch } from './items';
import { COMBAT_BLOCKED, LEVEL_UP } from './narration/lineBanks';
import { foeTokens, mechanicsLineFor, voiceFor } from './narration/voice';
import type { CampaignSave } from './save';
import type { AbilityKey, CharacterSheet } from './types';

export const MAX_LEVEL = 20;
export const ABILITY_SCORE_CAP = 20;
/** Ability points granted per level gained. */
export const POINTS_PER_LEVEL = 2;

/** Total XP needed to reach `level` (L1 = 0, L2 = 100, L3 = 300, L4 = 600, L5 = 1000 …). */
export function xpForLevel(level: number): number {
  const L = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return 50 * L * (L - 1);
}

export type ProgressionSummary = {
  level: number;
  xp: number;
  /** XP total for the next level; null at MAX_LEVEL. */
  nextLevelXp: number | null;
  /** XP total where the current level started. */
  currentLevelXp: number;
  canLevelUp: boolean;
  unspentPoints: number;
};

export function progressionSummary(state: CampaignState): ProgressionSummary {
  const level = state.character?.level ?? 1;
  const { xp, unspentPoints } = state.progression;
  const nextLevelXp = level >= MAX_LEVEL ? null : xpForLevel(level + 1);
  return {
    level,
    xp,
    nextLevelXp,
    currentLevelXp: xpForLevel(level),
    canLevelUp:
      Boolean(state.character) && nextLevelXp !== null && xp >= nextLevelXp,
    unspentPoints,
  };
}

export type ProgressionRequest =
  | { kind: 'level-up' }
  | { kind: 'spend-point'; ability: AbilityKey };

export type ProgressionResult = {
  ok: boolean;
  kind: ProgressionRequest['kind'];
  message: string;
  patch: CampaignStatePatch | null;
  narration: string | null;
  playerLine: string | null;
  /** NARR-04: numbers line under the prose (prose itself is number-free). */
  mechanicsLine?: string | null;
  /** NARR-04: anti-repeat ids for the picked line. */
  narrFlags?: Record<string, string>;
};

const ABILITY_NAMES: Record<AbilityKey, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

function reject(
  kind: ProgressionRequest['kind'],
  message: string,
  narration: string | null = null,
  mechanicsLine: string | null = null,
): ProgressionResult {
  return { ok: false, kind, message, patch: null, narration, playerLine: null, mechanicsLine };
}

/**
 * Keep combat HP aligned with derived max after a sheet change:
 * maxHp := new derived max; current HP shifts by the same delta (floor 1 if it was > 0).
 */
function hpAfterSheetChange(
  state: CampaignState,
  before: CharacterSheet,
  after: CharacterSheet,
): { hp: number; maxHp: number } {
  const oldMax = deriveStats(before).maxHitPoints;
  const newMax = deriveStats(after).maxHitPoints;
  const hp = state.combat.hp ?? oldMax;
  const shifted = hp + (newMax - oldMax);
  return {
    maxHp: newMax,
    hp: Math.max(hp > 0 ? 1 : 0, Math.min(newMax, shifted)),
  };
}

function withPc(state: CampaignState, pc: CharacterSheet) {
  return [pc, ...state.party.slice(1)];
}

export function resolveProgressionAction(
  state: CampaignState,
  req: ProgressionRequest,
): ProgressionResult {
  const pc = state.character;
  if (!pc) return reject(req.kind, 'No character to upgrade.');
  if (state.combat.inCombat) {
    const v = voiceFor(state);
    const foe = foeTokens(state.combat.foe?.name);
    return {
      ...reject(req.kind, 'Not mid-fight — finish the combat first.', v.say('combat.blocked', COMBAT_BLOCKED, foe)),
      narrFlags: v.flags(),
    };
  }
  const prog = state.progression;

  if (req.kind === 'level-up') {
    if (pc.level >= MAX_LEVEL) {
      return reject(
        'level-up',
        `Already at the level cap (${MAX_LEVEL}).`,
        "You've grown as far as this road can take you.",
        `Level ${pc.level} · Level cap`,
      );
    }
    const need = xpForLevel(pc.level + 1);
    if (prog.xp < need) {
      return reject(
        'level-up',
        `Not enough XP: ${prog.xp}/${need} for level ${pc.level + 1}.`,
        "You're not ready yet. More fights and quests will get you there.",
        `XP ${prog.xp}/${need}`,
      );
    }
    const next: CharacterSheet = { ...pc, level: pc.level + 1 };
    const hp = hpAfterSheetChange(state, pc, next);
    const gained = hp.maxHp - deriveStats(pc).maxHitPoints;
    const points = prog.unspentPoints + POINTS_PER_LEVEL;
    const voice = voiceFor(state);
    const narration =
      voice.say('level.up', LEVEL_UP, {}) ??
      `${pc.name.split(/\s+/)[0]} feels the change settle in: tougher, quicker, readier.`;
    return {
      ok: true,
      kind: 'level-up',
      message: `Level ${next.level}! Max HP +${gained} (${hp.maxHp}). +${POINTS_PER_LEVEL} ability points (${points} to spend).`,
      patch: {
        party: withPc(state, next),
        combat: { ...state.combat, hp: hp.hp, maxHp: hp.maxHp },
        progression: { unspentPoints: points },
      },
      narration,
      playerLine: 'Level up',
      mechanicsLine: mechanicsLineFor({
        level: next.level,
        maxHp: hp.maxHp,
        ...(gained ? { maxHpGain: gained } : {}),
        abilityPoints: POINTS_PER_LEVEL,
      }),
      narrFlags: voice.flags(),
    };
  }

  // spend-point
  const ability = req.ability;
  if (!(ability in pc.abilities)) return reject('spend-point', 'Unknown ability.');
  if (prog.unspentPoints < 1) {
    return reject(
      'spend-point',
      'No ability points to spend — level up first.',
      'You have nothing left to put into it yet. Level up first.',
    );
  }
  const score = pc.abilities[ability];
  if (score >= ABILITY_SCORE_CAP) {
    return reject(
      'spend-point',
      `${ABILITY_NAMES[ability]} is already at the cap (${ABILITY_SCORE_CAP}).`,
      `Your ${ABILITY_NAMES[ability].toLowerCase()} can't go any higher.`,
      `${ABILITY_NAMES[ability]} ${score} · Cap`,
    );
  }
  const next: CharacterSheet = {
    ...pc,
    abilities: { ...pc.abilities, [ability]: score + 1 },
  };
  const hp = hpAfterSheetChange(state, pc, next);
  const left = prog.unspentPoints - 1;
  return {
    ok: true,
    kind: 'spend-point',
    message: `${ABILITY_NAMES[ability]} ${score} → ${score + 1}. ${left} point${left === 1 ? '' : 's'} left.`,
    patch: {
      party: withPc(state, next),
      combat: { ...state.combat, hp: hp.hp, maxHp: hp.maxHp },
      progression: { unspentPoints: left },
    },
    narration: `You put the work in, and your ${ABILITY_NAMES[ability].toLowerCase()} improves.`,
    playerLine: null,
    mechanicsLine: `${ABILITY_NAMES[ability]} ${score} → ${score + 1} · ${left} ability point${left === 1 ? '' : 's'} left`,
  };
}

export function applyProgressionAction(
  campaign: CampaignSave,
  req: ProgressionRequest,
  now: number = Date.now(),
): { campaign: CampaignSave; result: ProgressionResult } {
  const state = campaignToState(campaign);
  const result = resolveProgressionAction(state, req);
  if (!result.ok || !result.patch) return { campaign, result };
  let patch = result.patch;
  // Spending a point on the Character sheet stays silent in the Tale (as before).
  if (result.narration && result.kind === 'level-up') {
    patch = withBeatPatch(
      patch,
      itemNarrationPatch(state, result.narration, result.playerLine, now, {
        mechanicsLine: result.mechanicsLine ?? null,
        narrFlags: result.narrFlags ?? {},
      }),
    );
  }
  return { campaign: applyCampaignPatch(campaign, patch), result };
}
