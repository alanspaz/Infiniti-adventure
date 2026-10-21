/**
 * COMBAT-02 — turn-based combat loop (rules in state, narration after).
 *
 * Player acts → (foe still standing) foe acts → victory / defeat / continue.
 * Hits: d20 + mod vs AC (nat 20 crit = double dice, nat 1 miss).
 * Damage: equipped weapon dice (items.ts) + mod, unarmed 1 + STR.
 * All randomness comes from an injected Rng so tests are deterministic.
 */
import { hasWildFoes, type FoeState } from './bestiary';
import {
  applyCampaignPatch,
  campaignToState,
  detectCombatEnterFromAction,
  detectCombatExitFromAction,
  NOT_A_FIGHT_RE,
  enterCombatPatch,
  exitCombatPatch,
  type CampaignState,
  type CampaignStatePatch,
  type CombatState,
} from './campaignState';
import { abilityModifier, proficiencyBonus } from './derived';
import { parseNotation, rollDie, type DieSides } from './dice';
import {
  armorClassWithGear,
  equippedLoadout,
  itemNarrationPatch,
  itemTraits,
  resolveItemAction,
} from './items';
import { xpForLevel } from './progression';
import { createSeededRng, type Rng } from './rng';
import type { CampaignSave } from './save';
import type { AbilityScores } from './types';

export type CombatActionKind = 'attack' | 'cast' | 'defend' | 'dodge' | 'use-item' | 'flee';

export type CombatOutcome = 'continue' | 'victory' | 'defeat' | 'fled' | 'ended' | 'rejected';

export type CombatTurnResult = {
  ok: boolean;
  outcome: CombatOutcome;
  /** Short panel/rail line. */
  message: string;
  patch: CampaignStatePatch | null;
  /** Narrator prose describing what the state already applied. */
  narration: string | null;
  /** Compact dice line(s) for the Tale (shown as the beat's check line). */
  rollLine: string | null;
};

/** Where a knocked-out hero wakes up (inn hearth). */
export const RECOVERY_LOCATION_ID = 'interior.kettle-common';
export const FLEE_DC = 10;
export const DEFEND_AC_BONUS = 2;

const FINESSE_RE = /\b(dagger|knife|rapier|shortsword|scimitar|bow|crossbow|sling|whip)\b/i;

const DEFAULT_ABILITIES: AbilityScores = {
  strength: 10,
  dexterity: 10,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
};

function pcAbilities(state: CampaignState): AbilityScores {
  return state.character?.abilities ?? DEFAULT_ABILITIES;
}

function pcProf(state: CampaignState): number {
  return proficiencyBonus(state.character?.level ?? 1);
}

export function playerArmorClass(state: CampaignState, stance = state.combat.stance): number {
  return (
    armorClassWithGear(pcAbilities(state).dexterity, state.inventory) +
    (stance === 'defend' ? DEFEND_AC_BONUS : 0)
  );
}

type DamageRoll = { total: number; text: string };

function rollDamage(notation: string, mod: number, crit: boolean, rng: Rng): DamageRoll {
  let parsed: ReturnType<typeof parseNotation> | null = null;
  try {
    parsed = parseNotation(notation);
  } catch {
    parsed = null;
  }
  if (!parsed) {
    const flat = Math.max(1, (crit ? 2 : 1) + mod);
    return { total: flat, text: `${flat}` };
  }
  const count = parsed.count * (crit ? 2 : 1);
  let sum = 0;
  for (let i = 0; i < count; i++) sum += rollDie(parsed.sides as DieSides, rng);
  const total = Math.max(1, sum + parsed.modifier + mod);
  return { total, text: `${total}` };
}

export type PlayerAttackProfile = {
  label: string;
  toHit: number;
  damage: string;
  damageMod: number;
};

/** Weapon attack profile from equipped gear (unarmed fallback). */
export function weaponProfile(state: CampaignState): PlayerAttackProfile {
  const ab = pcAbilities(state);
  const str = abilityModifier(ab.strength);
  const dex = abilityModifier(ab.dexterity);
  const weapon = equippedLoadout(state.inventory).weapon;
  if (!weapon) {
    return { label: 'fists', toHit: str + pcProf(state), damage: '1', damageMod: str };
  }
  const mod = FINESSE_RE.test(weapon.name) ? Math.max(str, dex) : str;
  return {
    label: weapon.name.toLowerCase(),
    toHit: mod + pcProf(state),
    damage: itemTraits(weapon).damage ?? '1d4',
    damageMod: mod,
  };
}

/** Spell attack: best of INT/WIS/CHA; 1d10 force bolt, no damage mod. */
export function spellProfile(state: CampaignState): PlayerAttackProfile {
  const ab = pcAbilities(state);
  const mod = Math.max(
    abilityModifier(ab.intelligence),
    abilityModifier(ab.wisdom),
    abilityModifier(ab.charisma),
  );
  return { label: 'spark bolt', toHit: mod + pcProf(state), damage: '1d10', damageMod: 0 };
}

type AttackRoll = {
  hit: boolean;
  crit: boolean;
  damage: number;
  line: string;
};

function fmtMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function attackRoll(
  who: string,
  toHit: number,
  ac: number,
  damage: string,
  damageMod: number,
  rng: Rng,
  disadvantage = false,
): AttackRoll {
  const a = rollDie(20, rng);
  let face = a;
  let faces = `${a}`;
  if (disadvantage) {
    const b = rollDie(20, rng);
    face = Math.min(a, b);
    faces = `(${a},${b})→${face}`;
  }
  const total = face + toHit;
  const crit = face === 20;
  const hit = face !== 1 && (crit || total >= ac);
  const head = `${who}🎲 ${faces}${fmtMod(toHit)}=${total} vs AC ${ac}`;
  if (!hit) {
    return { hit, crit, damage: 0, line: `${head} — ${face === 1 ? 'fumble' : 'miss'}` };
  }
  const dmg = rollDamage(damage, damageMod, crit, rng);
  return { hit, crit, damage: dmg.total, line: `${head} — ${crit ? 'CRIT' : 'hit'}, ${dmg.total} dmg` };
}

function hashPick(pool: string[], seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[h % pool.length]!;
}

function reject(message: string): CombatTurnResult {
  return { ok: false, outcome: 'rejected', message, patch: null, narration: null, rollLine: null };
}

function lowerName(foe: FoeState): string {
  return `the ${foe.name.toLowerCase()}`;
}

/**
 * Resolve one full round: the player's action, then the foe's reply.
 * Rejected actions (no fight / nothing usable) spend no turn and change nothing.
 */
export function resolveCombatTurn(
  state: CampaignState,
  kind: CombatActionKind,
  rng: Rng,
): CombatTurnResult {
  const combat = state.combat;
  const foe0 = combat.foe;
  if (!combat.inCombat || !foe0) return reject('No fight right now.');

  const maxHp = combat.maxHp ?? 10;
  let hp = combat.hp ?? maxHp;
  let foe: FoeState = { ...foe0 };
  let stance: CombatState['stance'] = 'none';
  const lines: string[] = [];
  const prose: string[] = [];
  const seed = `${foe.id}:${combat.round}:${kind}`;
  const foeName = lowerName(foe);
  const patch: CampaignStatePatch = {};

  switch (kind) {
    case 'attack':
    case 'cast': {
      const prof = kind === 'attack' ? weaponProfile(state) : spellProfile(state);
      const r = attackRoll('', prof.toHit, foe.ac, prof.damage, prof.damageMod, rng);
      lines.push(r.line);
      if (r.hit) {
        foe = { ...foe, hp: Math.max(0, foe.hp - r.damage) };
        prose.push(
          kind === 'attack'
            ? hashPick(
                r.crit
                  ? [`Your ${prof.label} finds the perfect opening — a brutal blow to ${foeName}.`]
                  : [
                      `Your ${prof.label} bites into ${foeName}.`,
                      `You drive your ${prof.label} home; ${foeName} reels.`,
                      `A clean strike with your ${prof.label} — ${foeName} staggers.`,
                    ],
                seed,
              )
            : r.crit
              ? `Your spark bolt detonates against ${foeName} in a blinding flash.`
              : `A spark bolt cracks from your fingers and scorches ${foeName}.`,
        );
      } else {
        prose.push(
          kind === 'attack'
            ? hashPick(
                [
                  `${cap(foeName)} twists aside and your ${prof.label} cuts only air.`,
                  `Your ${prof.label} glances off — no purchase.`,
                ],
                seed,
              )
            : `Your spark bolt sputters wide of ${foeName}.`,
        );
      }
      break;
    }
    case 'defend':
      stance = 'defend';
      prose.push(`You set your feet and raise your guard (+${DEFEND_AC_BONUS} AC this round).`);
      break;
    case 'dodge':
      stance = 'dodge';
      prose.push(`You stay light and moving, making yourself hard to pin down.`);
      break;
    case 'use-item': {
      const heal = state.inventory.items.find((i) => itemTraits(i).effect?.type === 'heal');
      if (!heal) return reject('Nothing usable — you have no healing items.');
      const used = resolveItemAction(state, { kind: 'use', itemId: heal.id });
      if (!used.ok || !used.patch) return reject(used.message);
      hp = used.patch.combat?.hp ?? hp;
      if (used.patch.inventory) patch.inventory = used.patch.inventory;
      lines.push(used.message);
      prose.push(used.narration ?? `You use the ${heal.name.toLowerCase()}.`);
      break;
    }
    case 'flee': {
      const dex = abilityModifier(pcAbilities(state).dexterity);
      const face = rollDie(20, rng);
      const total = face + dex;
      const ok = total >= FLEE_DC;
      lines.push(`Flee 🎲 ${face}${fmtMod(dex)}=${total} vs DC ${FLEE_DC} — ${ok ? 'escaped' : 'caught'}`);
      if (ok) {
        const exit = exitCombatPatch(combat, `Fled from ${foe.name}`).combat!;
        return {
          ok: true,
          outcome: 'fled',
          message: `You escape ${foeName}.`,
          patch: { ...patch, combat: { ...exit, hp } },
          narration: `You break away and run until ${foeName} gives up the chase.`,
          rollLine: lines.join(' · '),
        };
      }
      prose.push(`You try to break away, but ${foeName} cuts you off.`);
      break;
    }
  }

  // Victory?
  if (foe.hp <= 0) {
    const exit = exitCombatPatch(combat, `${foe.name} defeated`).combat!;
    const xpAfter = state.progression.xp + foe.xp;
    const level = state.character?.level ?? 1;
    const canLevel = state.character && level < 20 && xpAfter >= xpForLevel(level + 1);
    const rewards = [
      `${foe.xp} XP`,
      ...(foe.gold > 0 ? [`${foe.gold} gold`] : []),
      ...(foe.loot ? [foe.loot.name] : []),
    ].join(', ');
    return {
      ok: true,
      outcome: 'victory',
      message: `Victory! ${rewards}.`,
      patch: {
        ...patch,
        combat: { ...exit, hp },
        grantXp: foe.xp,
        ...(foe.gold > 0 ? { grantGold: foe.gold } : {}),
        ...(foe.loot ? { addItem: { ...foe.loot } } : {}),
      },
      narration: `${prose.join(' ')} ${cap(foeName)} falls and does not rise. You gain ${rewards}.${canLevel ? ' You feel ready to level up (see Character).' : ''}`,
      rollLine: lines.join(' · '),
    };
  }

  // Foe's turn.
  const ac = playerArmorClass(state, stance);
  const fr = attackRoll(`${foe.name} `, foe.attackBonus, ac, foe.damage, 0, rng, stance === 'dodge');
  lines.push(fr.line);
  if (fr.hit) {
    hp = Math.max(0, hp - fr.damage);
    prose.push(
      fr.crit
        ? `${cap(foeName)} lands a savage hit (${fr.damage}).`
        : hashPick(
            [
              `${cap(foeName)} strikes back and catches you (${fr.damage}).`,
              `${cap(foeName)} lunges — it connects (${fr.damage}).`,
            ],
            seed,
          ),
    );
  } else {
    prose.push(
      stance === 'none'
        ? `${cap(foeName)} lashes out and misses.`
        : `${cap(foeName)} attacks, but your ${stance === 'defend' ? 'guard holds' : 'footwork carries you clear'}.`,
    );
  }

  // Defeat → knocked out, wake at the hearth: half HP, lose half your gold.
  if (hp <= 0) {
    const lost = Math.floor(state.inventory.gold / 2);
    const exit = exitCombatPatch(combat, `Knocked out by ${foe.name}`).combat!;
    const wakeHp = Math.max(1, Math.floor(maxHp / 2));
    return {
      ok: true,
      outcome: 'defeat',
      message: `Knocked out! You wake at the Copper Kettle with ${wakeHp}/${maxHp} HP${lost > 0 ? ` and ${lost} gold lighter` : ''}.`,
      patch: {
        ...patch,
        combat: { ...exit, hp: wakeHp, maxHp },
        ...(lost > 0 ? { spendGold: lost } : {}),
        locationId: RECOVERY_LOCATION_ID,
      },
      narration: `${prose.join(' ')} The world goes dark. … You wake to hearth-warmth in the Copper Kettle's common room — someone hauled you back.${lost > 0 ? ` Your purse is ${lost} gold lighter.` : ''}`,
      rollLine: lines.join(' · '),
    };
  }

  const round = combat.round + 1;
  return {
    ok: true,
    outcome: 'continue',
    message: `${foe.name} ${foe.hp}/${foe.maxHp} · you ${hp}/${maxHp}`,
    patch: {
      ...patch,
      combat: {
        ...combat,
        hp,
        maxHp,
        foe,
        foeHp: foe.hp,
        foeMaxHp: foe.maxHp,
        stance,
        tempAcBonus: stance === 'defend' ? DEFEND_AC_BONUS : 0,
        mode: kind === 'flee' ? 'idle' : kind,
        lastAction: lines[lines.length - 1] ?? kind,
        round,
      },
    },
    narration: prose.join(' '),
    rollLine: lines.join(' · '),
  };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Deterministic per-moment RNG for the UI (same state → same rolls; no save-scum). */
export function combatRngFor(campaign: CampaignSave): Rng {
  let h = 2166136261;
  for (const ch of campaign.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const c = campaign.world?.combat;
  const beats = campaign.session.storyBeats?.length ?? 0;
  return createSeededRng(
    (h + (campaign.session.rngSeed ?? 0) + (c?.round ?? 0) * 7919 + beats * 104729 + campaign.session.turn * 31) >>> 0,
  );
}

function appendBeat(
  campaign: CampaignSave,
  patch: CampaignStatePatch,
  narration: string,
  playerLine: string | null,
  rollLine: string | null,
  now: number,
): CampaignSave {
  const state = campaignToState(campaign);
  const beat = itemNarrationPatch(state, narration, playerLine, now);
  const beats = beat.storyBeats!;
  if (rollLine && beats.length > 0) {
    beats[beats.length - 1] = { ...beats[beats.length - 1]!, checkLine: rollLine };
  }
  return applyCampaignPatch(campaign, { ...patch, ...beat, storyBeats: beats });
}

const ACTION_LABEL: Record<CombatActionKind, string> = {
  attack: 'Attack',
  cast: 'Cast',
  defend: 'Defend',
  dodge: 'Dodge',
  'use-item': 'Use Item',
  flee: 'Flee',
};

/** Resolve + apply one combat round and log it to the Tale. */
export function applyCombatTurn(
  campaign: CampaignSave,
  kind: CombatActionKind,
  opts: { rng?: Rng; playerLine?: string; now?: number; logRejection?: boolean } = {},
): { campaign: CampaignSave; result: CombatTurnResult } {
  const state = campaignToState(campaign);
  const rng = opts.rng ?? combatRngFor(campaign);
  const result = resolveCombatTurn(state, kind, rng);
  if (!result.ok || !result.patch) {
    // Rail taps answer honestly in the Tale when they can't act (no turn spent).
    if (opts.logRejection && state.combat.inCombat) {
      return {
        campaign: appendBeat(
          campaign,
          {},
          result.message,
          opts.playerLine ?? ACTION_LABEL[kind],
          null,
          opts.now ?? Date.now(),
        ),
        result,
      };
    }
    return { campaign, result };
  }
  return {
    campaign: appendBeat(
      campaign,
      result.patch,
      result.narration ?? result.message,
      opts.playerLine ?? ACTION_LABEL[kind],
      result.rollLine,
      opts.now ?? Date.now(),
    ),
    result,
  };
}


const SEEK_RE = /\b(?:look\s+for\s+(?:trouble|a\s+fight)|hunt|ambush|fight)\b/i;

/** Classify typed Tale text while a fight is on. */
export function classifyCombatText(text: string): CombatActionKind | 'end' | null {
  const t = text.trim();
  if (/\b(?:flee|run\s+away|run|retreat|escape|bolt)\b/i.test(t)) return 'flee';
  if (detectCombatExitFromAction(t)) return 'end';
  if (/\b(?:drink|quaff|potion|heal|bandage|use\s+(?:an?\s+|my\s+)?(?:item|salve|elixir))\b/i.test(t)) return 'use-item';
  if (/\b(?:cast|spell|bolt|magic|zap)\b/i.test(t)) return 'cast';
  if (/\b(?:defend|block|guard|parry|brace|shield\s+up)\b/i.test(t)) return 'defend';
  if (/\b(?:dodge|evade|duck|sidestep|weave)\b/i.test(t)) return 'dodge';
  if (/\b(?:attack|strike|hit|swing|stab|slash|shoot|punch|kick|fight|cut|smash)\b/i.test(t)) return 'attack';
  return null;
}

/**
 * Tale entry point. Returns null when the text isn't about fighting
 * (caller then uses the normal narrator).
 * - Out of combat: attack verbs start a fight here and strike first;
 *   "look for trouble"/"hunt"/"fight" starts one only where foes roam.
 * - In combat: maps text to a combat action (or ends the fight on surrender/stand down).
 */
export function applyCombatIntent(
  campaign: CampaignSave,
  text: string,
  opts: { rng?: Rng; now?: number } = {},
): { campaign: CampaignSave; result: CombatTurnResult } | null {
  const state = campaignToState(campaign);
  const rng = opts.rng ?? combatRngFor(campaign);
  const now = opts.now ?? Date.now();
  const loc = state.locationId ?? RECOVERY_LOCATION_ID;

  if (state.combat.inCombat) {
    const kind = classifyCombatText(text);
    if (!kind) return null;
    if (kind === 'end') {
      const foe = state.combat.foe;
      const patch = exitCombatPatch(state.combat, 'Stood down');
      const narration = `You lower your guard. ${foe ? cap(lowerName(foe)) : 'Your foe'} backs off, and the moment passes.`;
      return {
        campaign: appendBeat(campaign, patch, narration, text, null, now),
        result: { ok: true, outcome: 'ended', message: 'Fight ended.', patch, narration, rollLine: null },
      };
    }
    const turn = applyCombatTurn(campaign, kind, { rng, playerLine: text, now });
    if (!turn.result.ok) {
      // Honest refusal still answers in the Tale (never silent).
      return {
        campaign: appendBeat(campaign, {}, turn.result.message, text, null, now),
        result: turn.result,
      };
    }
    return turn;
  }

  if (!detectCombatEnterFromAction(text) || NOT_A_FIGHT_RE.test(text)) return null;
  const seeking = SEEK_RE.test(text) && !/\b(?:attack|strike|stab|slash|shoot|punch|kick)\b/i.test(text);
  if (seeking && !hasWildFoes(loc)) {
    const narration =
      'Nothing here wants a fight. Trouble roams the Ashen Fields and the vale road — and something scratches in the Kettle cellar.';
    return {
      campaign: appendBeat(campaign, {}, narration, text, null, now),
      result: { ok: false, outcome: 'rejected', message: narration, patch: null, narration, rollLine: null },
    };
  }
  const start = enterCombatPatch(state.combat, 'Combat begins', loc, rng());
  const foe = start.combat!.foe!;
  const intro = `A ${foe.name.toLowerCase()} squares up to you — ${foe.hp} HP, AC ${foe.ac}.`;
  let next = applyCampaignPatch(campaign, start);
  if (seeking) {
    const narration = `${intro} Steel yourself: Attack, Cast, Defend, Dodge, or Use Item.`;
    next = appendBeat(next, {}, narration, text, null, now);
    return {
      campaign: next,
      result: { ok: true, outcome: 'continue', message: `Fight: ${foe.name}`, patch: start, narration, rollLine: null },
    };
  }
  // Attack verb: open the fight and strike first in the same beat.
  const turn = applyCombatTurn(next, classifyCombatText(text) === 'cast' ? 'cast' : 'attack', {
    rng,
    playerLine: text,
    now,
  });
  if (turn.result.ok) {
    const s = campaignToState(turn.campaign);
    const beats = [...s.storyBeats];
    const last = beats[beats.length - 1]!;
    beats[beats.length - 1] = { ...last, prose: `${intro} ${last.prose}` };
    return {
      campaign: applyCampaignPatch(turn.campaign, { storyBeats: beats }),
      result: turn.result,
    };
  }
  return turn;
}
