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
  applyItemAction,
  withBeatPatch,
  type BeatExtras,
  type ItemActionRequest,
  type ItemActionResult,
} from './items';
import { placePhrase } from './chronicle';
import {
  COMBAT_ACTION,
  COMBAT_BLOCKED,
  COMBAT_FOE,
  DEFEAT_WAKE,
  LEVEL_READY,
  PLACE_VICTORY_NOTE,
  SEEK_NO_FOES,
  type Bank,
  type CombatPath,
  type FoeId,
  type LineContext,
  type RecentEvent,
} from './narration/lineBanks';
import {
  foeArticled,
  foeTokens,
  mechanicsLineFor,
  recordCtxFor,
  recordLine,
  voiceFor,
  type MechanicsDelta,
  type Voice,
} from './narration/voice';
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
  /** NARR-04: numbers under the prose (HP, XP, gold, loot). Prose has none. */
  mechanicsLine?: string | null;
  /** NARR-04: anti-repeat ids for the lines picked this round. */
  narrFlags?: Record<string, string>;
  /** NARR-04: what just happened (justFought / justLost). */
  event?: RecentEvent | null;
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
/** QA-02: classes with real spellcraft (others can still throw a feeble spark). */
const CASTER_CLASS_RE = /mage|wizard|sorcer|warlock|witch|bard|singer|cleric|druid|priest|adept|alchem|shaman|oracle/i;
export function isSpellcasterClass(className: string | null | undefined): boolean {
  return CASTER_CLASS_RE.test(className ?? '');
}

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
  /** Natural 1 (NARR-04: drives the fumble lines). */
  fumble?: boolean;
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
    return { hit, crit, fumble: face === 1, damage: 0, line: `${head} — ${face === 1 ? 'fumble' : 'miss'}` };
  }
  const dmg = rollDamage(damage, damageMod, crit, rng);
  return { hit, crit, damage: dmg.total, line: `${head} — ${crit ? 'CRIT' : 'hit'}, ${dmg.total} dmg` };
}

function reject(message: string): CombatTurnResult {
  return { ok: false, outcome: 'rejected', message, patch: null, narration: null, rollLine: null };
}

function lowerName(foe: FoeState): string {
  return `the ${foe.name.toLowerCase()}`;
}

/** Per-foe bank for a path, then the generic one. */
function foeBanks(foeId: string, path: CombatPath): Bank[] {
  const own = COMBAT_FOE[foeId as FoeId]?.[path];
  return own ? [own, COMBAT_FOE.generic[path]] : [COMBAT_FOE.generic[path]];
}

function foeSay(voice: Voice, foe: FoeState, path: CombatPath, ctx?: Partial<LineContext>): string | null {
  return voice.say(`combat.${path}`, foeBanks(foe.id, path), foeTokens(foe.name), ctx ? { ctx } : {});
}

/**
 * Resolve one full round: the player's action, then the foe's reply.
 * Rejected actions (no fight / nothing usable) spend no turn and change nothing.
 */
export function resolveCombatTurn(
  state: CampaignState,
  /** 'pass' (internal): the player spent the round on something else — the foe acts. */
  kind: CombatActionKind | 'pass',
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
  const foeName = lowerName(foe);
  const patch: CampaignStatePatch = {};
  const caster = !state.character || isSpellcasterClass(state.character.className);
  // NARR-04: seeded voice (separate from the dice rng); {weapon} = "your shortsword" / "your fists".
  const voice = voiceFor(state);
  const notes: string[] = [];
  const extraFlags: Record<string, string> = {};
  const hpStart = hp;
  let qtyLeft: { name: string; qty: number } | undefined;

  switch (kind) {
    case 'attack':
    case 'cast': {
      const prof = kind === 'attack' ? weaponProfile(state) : spellProfile(state);
      const r = attackRoll('', prof.toHit, foe.ac, prof.damage, prof.damageMod, rng);
      lines.push(r.line);
      if (r.hit) {
        foe = { ...foe, hp: Math.max(0, foe.hp - r.damage) };
      }
      const ft = foeTokens(foe.name);
      let line: string | null;
      if (kind === 'attack') {
        line = foeSay(voice, foe, r.crit ? 'crit' : r.hit ? 'hit' : r.fumble ? 'fumble' : 'miss');
      } else {
        const spell = r.crit ? 'castCrit' : r.hit ? 'castHit' : 'castMiss';
        const lead = caster ? null : voice.say('combat.noCaster', COMBAT_ACTION.noCaster, ft);
        const body = voice.say(`combat.${spell}`, COMBAT_ACTION[spell], ft);
        line = [lead, body].filter(Boolean).join(' ') || null;
      }
      if (line) prose.push(line);
      break;
    }
    case 'defend':
      stance = 'defend';
      prose.push(voice.say('combat.defend', COMBAT_ACTION.defend, foeTokens(foe.name)) ?? 'You set your feet and raise your guard.');
      notes.push(`Defend · +${DEFEND_AC_BONUS} AC this round`);
      break;
    case 'dodge':
      stance = 'dodge';
      prose.push(voice.say('combat.dodge', COMBAT_ACTION.dodge, foeTokens(foe.name)) ?? 'You stay light and moving.');
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
      Object.assign(extraFlags, used.narrFlags ?? {});
      const left = (patch.inventory?.items ?? []).find((i) => i.id === heal.id)?.qty ?? 0;
      qtyLeft = { name: heal.name, qty: left };
      break;
    }
    case 'pass':
      break;
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
          narration: foeSay(voice, foe, 'fleeOk') ?? `You break away and run until ${foeName} gives up the chase.`,
          rollLine: lines.join(' · '),
          mechanicsLine: null,
          narrFlags: { ...voice.flags(), ...extraFlags },
          event: 'justFought',
        };
      }
      prose.push(foeSay(voice, foe, 'fleeFail') ?? `You try to break away, but ${foeName} cuts you off.`);
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
    const has = { loot: Boolean(foe.loot), goldGained: foe.gold > 0, goldLost: false };
    const win = foeSay(voice, foe, 'victory', { has });
    const ready = canLevel ? voice.say('combat.levelReady', LEVEL_READY, {}) : null;
    const rc = recordCtxFor(state.campaignId, state.playstylePackId);
    const placeNote = state.locationId
      ? recordLine(PLACE_VICTORY_NOTE, rc, `victory:${state.locationId}:${foe.id}:${state.session.turn}`, {
          foeA: foeArticled(foe.name),
        })
      : null;
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
        // TABS-01: the deed (structured, NARR-04), where the loot came from, and a note on the place.
        deed: {
          kind: 'victory',
          text: `Defeated ${foeArticled(foe.name)}${state.locationId ? ` in ${placePhrase(state.locationId)}` : ''}`,
          foeName: foe.name,
          ...(state.locationId ? { locationId: state.locationId } : {}),
        },
        ...(foe.loot
          ? {
              itemObtained: {
                itemId: foe.loot.id,
                name: foe.loot.name,
                how: 'loot' as const,
                source: foe.name,
                locationId: state.locationId,
              },
            }
          : {}),
        ...(state.locationId
          ? { placeLearned: { id: state.locationId, ...(placeNote ? { note: placeNote } : {}), victory: true } }
          : {}),
      },
      narration: [...prose, win ?? `${cap(foeName)} falls and does not rise.`, ...(ready ? [ready] : [])].join(' '),
      rollLine: lines.join(' · '),
      mechanicsLine: mechanicsLineFor({
        xp: foe.xp,
        ...(foe.gold > 0 ? { gold: foe.gold } : {}),
        ...(foe.loot ? { itemsGained: [foe.loot.name] } : {}),
        ...(canLevel ? { notes: ['Level up ready'] } : {}),
      }),
      narrFlags: { ...voice.flags(), ...extraFlags },
      event: 'justFought',
    };
  }

  // Foe's turn.
  const ac = playerArmorClass(state, stance);
  const fr = attackRoll(`${foe.name} `, foe.attackBonus, ac, foe.damage, 0, rng, stance === 'dodge');
  lines.push(fr.line);
  if (fr.hit) {
    hp = Math.max(0, hp - fr.damage);
  }
  const lowNow = maxHp > 0 && hp / maxHp <= 0.5;
  const foeLine = foeSay(voice, foe, fr.crit ? 'foeCrit' : fr.hit ? 'foeHit' : 'foeMiss', { hpLow: lowNow });
  prose.push(foeLine ?? (fr.hit ? `${cap(foeName)} catches you.` : `${cap(foeName)} misses.`));

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
      narration: [
        ...prose.slice(0, -1),
        foeSay(voice, foe, 'defeat') ?? 'The world goes dark.',
        voice.say('combat.wake', DEFEAT_WAKE, {}, { ctx: { has: { loot: false, goldGained: false, goldLost: lost > 0 } } }) ??
          "You wake in the Copper Kettle's common room.",
      ].join(' '),
      rollLine: lines.join(' · '),
      mechanicsLine: mechanicsLineFor({ notes: ['Knocked out'], hp: wakeHp, hpMax: maxHp, ...(lost > 0 ? { gold: -lost } : {}) }),
      narrFlags: { ...voice.flags(), ...extraFlags },
      event: 'justLost',
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
        mode: kind === 'flee' || kind === 'pass' ? 'idle' : kind,
        lastAction: lines[lines.length - 1] ?? kind,
        round,
      },
    },
    narration: prose.join(' '),
    rollLine: lines.join(' · '),
    mechanicsLine: roundMechanics(hp, hpStart, maxHp, qtyLeft, notes),
    narrFlags: { ...voice.flags(), ...extraFlags },
    event: 'justFought',
  };
}

function roundMechanics(
  hp: number,
  hpStart: number,
  maxHp: number,
  qtyLeft: { name: string; qty: number } | undefined,
  notes: string[],
): string | null {
  const d: MechanicsDelta = {
    ...(hp !== hpStart ? { hpChange: hp - hpStart, hp, hpMax: maxHp } : {}),
    ...(qtyLeft ? { qtyLeft } : {}),
    ...(notes.length ? { notes } : {}),
  };
  return mechanicsLineFor(d);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Deterministic per-moment RNG for the UI (same state → same rolls; no save-scum). */
function mix(h: number, n: number): number {
  let x = Math.imul((h ^ (n >>> 0)) >>> 0, 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  return (x ^ (x >>> 13)) >>> 0;
}

/**
 * Deterministic per-round RNG from the save (no save-scumming: same save →
 * same roll). QA-01 P1-7: seeded from monotonic counters (session.turn
 * advances every combat beat; storyMeta.beatCount is uncapped) and mixed
 * non-linearly, so fights never replay once the 40-beat log is full.
 */
export function combatRngFor(campaign: CampaignSave): Rng {
  let h = 2166136261;
  for (const ch of campaign.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const c = campaign.world?.combat;
  const beatCount = campaign.world?.storyMeta?.beatCount ?? campaign.session.storyBeats?.length ?? 0;
  h = mix(h, campaign.session.rngSeed ?? 0);
  h = mix(h, campaign.session.turn);
  h = mix(h, c?.round ?? 0);
  h = mix(h, beatCount);
  return createSeededRng(h);
}

function appendBeat(
  campaign: CampaignSave,
  patch: CampaignStatePatch,
  narration: string,
  playerLine: string | null,
  rollLine: string | null,
  now: number,
  extras: BeatExtras = {},
): CampaignSave {
  const state = campaignToState(campaign);
  const beat = itemNarrationPatch(state, narration, playerLine, now, {
    ...extras,
    turnAfter: campaign.session.turn + 1,
  });
  const beats = beat.storyBeats!;
  if (rollLine && beats.length > 0) {
    beats[beats.length - 1] = { ...beats[beats.length - 1]!, checkLine: rollLine };
  }
  // QA-01 P1-7: every combat beat advances the turn clock (fresh RNG next round).
  return applyCampaignPatch(campaign, {
    ...withBeatPatch(patch, beat),
    storyBeats: beats,
    session: { ...(patch.session ?? {}), turn: campaign.session.turn + 1 },
  });
}

function extrasOf(r: { mechanicsLine?: string | null; narrFlags?: Record<string, string>; event?: RecentEvent | null }): BeatExtras {
  return { mechanicsLine: r.mechanicsLine ?? null, narrFlags: r.narrFlags ?? {}, event: r.event ?? null };
}

/** Rejections carry no numbers already; "no healing items" keeps its wording, others use COMBAT_BLOCKED. */
function rejectionProse(state: CampaignState, message: string): string {
  if (/\d/.test(message) && state.combat.foe) {
    return voiceFor(state).say('combat.blocked', COMBAT_BLOCKED, foeTokens(state.combat.foe.name)) ?? 'Not now.';
  }
  return message;
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
          rejectionProse(state, result.message),
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
      extrasOf(result),
    ),
    result,
  };
}


const SEEK_RE = /\b(?:look\s+for\s+(?:trouble|a\s+fight)|hunt|ambush|fight)\b/i;

/** Classify typed Tale text while a fight is on (QA-01 P1-6: cast/attack before flee). */
const CAST_RE = /\b(?:cast|spell|magic|zap|fire\s*bolt|firebolt|lightning|hex|arcane)\b/i;
const ATTACK_RE =
  /\b(?:attack|strike|hit|swing|stab|slash|shoot|punch|kick|fight|cut|smash|bash|lunge|thrust)\b|\brun\s+(?:\w+\s+){0,3}through\b/i;
const USE_RE = /\b(?:drink|quaff|potion|bandage|heal\s+(?:myself|me|up)|use\s+(?:an?\s+|my\s+|the\s+)?(?:item|salve|elixir|potion))\b/i;
const FLEE_RE =
  /\b(?:flee|run\s+away|run\s+for\s+it|retreat|escape|get\s+away|break\s+away|disengage|make\s+a\s+break|stand\s+down|surrender|spare(?:\s+(?:them|it|him|her))?|end\s+(?:the\s+)?(?:fight|combat))\b|^(?:i\s+)?run\b/i;

export function classifyCombatText(text: string): CombatActionKind | 'end' | null {
  const t = text.trim();
  if (CAST_RE.test(t)) return 'cast';
  if (USE_RE.test(t)) return 'use-item';
  if (ATTACK_RE.test(t)) return 'attack';
  if (/\b(?:defend|block|guard|parry|brace|shield\s+up)\b/i.test(t)) return 'defend';
  if (/\b(?:dodge|evade|duck|sidestep|weave)\b/i.test(t)) return 'dodge';
  // QA-01 P1-2: every way out of a fight (stand down, surrender, spare…) is a flee roll.
  if (FLEE_RE.test(t)) return 'flee';
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
    if (!kind || kind === 'end') return null;
    const turn = applyCombatTurn(campaign, kind, { rng, playerLine: text, now });
    if (!turn.result.ok) {
      // Honest refusal still answers in the Tale (never silent).
      return {
        campaign: appendBeat(campaign, {}, rejectionProse(state, turn.result.message), text, null, now),
        result: turn.result,
      };
    }
    return turn;
  }

  if (!detectCombatEnterFromAction(text) || NOT_A_FIGHT_RE.test(text)) return null;
  const seeking = SEEK_RE.test(text) && !/\b(?:attack|strike|stab|slash|shoot|punch|kick)\b/i.test(text);
  if (seeking && !hasWildFoes(loc)) {
    const voice = voiceFor(state);
    const narration =
      voice.say('combat.seekNone', SEEK_NO_FOES, {}) ??
      'Nothing here wants a fight. Trouble roams the Ashen Fields and the vale road, and something scratches in the Kettle cellar.';
    return {
      campaign: appendBeat(campaign, {}, narration, text, null, now, { narrFlags: voice.flags() }),
      result: { ok: false, outcome: 'rejected', message: narration, patch: null, narration, rollLine: null },
    };
  }
  const start = enterCombatPatch(state.combat, 'Combat begins', loc, rng());
  const foe = start.combat!.foe!;
  // NARR-04: the intro is prose only; HP / AC go on the mechanics line.
  const introVoice = voiceFor(state);
  const intro = foeSay(introVoice, foe, 'intro') ?? `${cap(foeArticled(foe.name))} squares up to you.`;
  const introMechanics = mechanicsLineFor({ foeStats: { name: foe.name, hp: foe.hp, ac: foe.ac } });
  let next = applyCampaignPatch(campaign, start);
  if (seeking) {
    const narration = intro;
    next = appendBeat(next, {}, narration, text, null, now, {
      mechanicsLine: introMechanics,
      narrFlags: introVoice.flags(),
      event: 'justFought',
    });
    return {
      campaign: next,
      result: {
        ok: true,
        outcome: 'continue',
        message: `Fight: ${foe.name}`,
        patch: start,
        narration,
        rollLine: null,
        mechanicsLine: introMechanics,
        narrFlags: introVoice.flags(),
        event: 'justFought',
      },
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
    const ml = [introMechanics, last.mechanicsLine].filter(Boolean).join(' · ');
    beats[beats.length - 1] = { ...last, prose: `${intro} ${last.prose}`, ...(ml ? { mechanicsLine: ml } : {}) };
    return {
      campaign: applyCampaignPatch(turn.campaign, {
        storyBeats: beats,
        flags: { ...introVoice.flags(), ...turn.campaign.flags, ...introOnlyFlags(introVoice) },
      }),
      result: turn.result,
    };
  }
  return turn;
}

/**
 * QA-01: item actions that change your kit (use / equip / drop) cost the
 * round mid-fight — the foe gets its turn. Inspect / move stay free, and
 * outside combat this is plain applyItemAction. Rejections never spend a turn.
 */
export function applyItemActionWithTurn(
  campaign: CampaignSave,
  req: ItemActionRequest,
  opts: { rng?: Rng; now?: number; playerLine?: string | null } = {},
): { campaign: CampaignSave; result: ItemActionResult; turn: CombatTurnResult | null } {
  const now = opts.now ?? Date.now();
  const state = campaignToState(campaign);
  if (!state.combat.inCombat || req.kind === 'inspect' || req.kind === 'move') {
    return { ...applyItemAction(campaign, req, now), turn: null };
  }
  const item = resolveItemAction(state, req);
  if (!item.ok || !item.patch) return { campaign, result: item, turn: null };
  let patch: CampaignStatePatch = item.patch;
  if (patch.combat) patch = { ...patch, combat: { ...state.combat, ...patch.combat } };
  const mid = applyCampaignPatch(campaign, patch);
  const rng = opts.rng ?? combatRngFor(campaign);
  const turn = resolveCombatTurn(campaignToState(mid), 'pass', rng);
  const narration = [item.narration ?? item.message, turn.narration].filter(Boolean).join(' ');
  const mechanicsLine = [item.mechanicsLine, turn.mechanicsLine].filter(Boolean).join(' · ') || null;
  return {
    campaign: appendBeat(mid, turn.patch ?? {}, narration, opts.playerLine ?? item.playerLine, turn.rollLine, now, {
      mechanicsLine,
      narrFlags: { ...(item.narrFlags ?? {}), ...(turn.narrFlags ?? {}) },
      event: turn.event ?? 'justFought',
    }),
    result: { ...item, message: `${item.message} ${turn.message}`.trim() },
    turn,
  };
}

/** Only the intro path's anti-repeat id (the round's own ids are already on the save). */
function introOnlyFlags(v: Voice): Record<string, string> {
  const f = v.flags();
  const k = 'narr.last.combat.intro';
  return f[k] ? { [k]: f[k]! } : {};
}
