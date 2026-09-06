# Contract: Dice / resolution

## Purpose
On-device dice rolling and check resolution for Infinite Adventure. Pure data + pure functions. No React, no I/O, no AI. Generic SRD-shaped math; do **not** label UI or APIs as “5e”.

## RNG
- Default rolls may use a non-deterministic source.
- Engines **should** accept an optional injectable RNG for tests and reproducible sessions.
- A seedable PRNG is in scope for unit tests (same seed → same sequence).

## Polyhedral dice
Supported face counts: `4 | 6 | 8 | 10 | 12 | 20 | 100`.

| Op | Behavior |
|----|----------|
| `rollDie(sides)` | Uniform integer in `1..sides` |
| `rollDice(count, sides)` | `count` independent die rolls; return faces + sum |
| `parseNotation(expr)` | Parse `"NdM+K"` / `"NdM-K"` / `"NdM"` (N≥1, M in supported sides, K integer) |
| `rollNotation(expr)` | Parse + roll; return faces, modifier, total |

## Ability / skill checks
Given an ability (or other) modifier and a difficulty class (DC):

1. Roll **d20** (optionally with advantage / disadvantage).
2. **Total** = d20 result + modifier.
3. **Success** if `total >= DC`.
4. Natural 20 / natural 1 are reported as flags; v1 does **not** force auto-success/fail unless a future rule pack says so — callers may treat them specially.

**Advantage:** roll 2d20, keep the higher face.  
**Disadvantage:** roll 2d20, keep the lower face.  
Normal: single d20.

## Contested rolls
Two sides each roll d20 + their modifier (each may have adv/disadv). Higher total wins; tie is a tie. Return both sides’ results and the outcome.

## Wiring with character engine
- Use `AbilityKey` / `abilityModifier` / `proficiencyBonus` from the character engine when building check modifiers.
- Dice module does not mutate character sheets or parties.

## Non-goals (this contract)
Animated roll presentation, official WotC tables, save persistence, narrator prompts.

## UI note
App surface: `DiceScreen` — NdM via `rollNotation`; ability checks via `checkModifier` + `resolveCheck`. No math outside this engine.
