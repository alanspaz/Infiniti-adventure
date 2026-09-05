# Contract: Character sheet

## Purpose
On-device character model for Infinite Adventure. Pure data + pure functions. No React, no I/O, no AI.

## Party
- A **party** is an ordered list of characters.
- **Empty party is valid.** The solo player is alone unless they explicitly add companions.
- Engines and UI **must not** auto-spawn companions.

## Character identity
| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable unique id within a save |
| `name` | string | Display name |
| `description` | string | Free-text look / vibe |
| `className` | string | Generic class label (not WotC product names) |
| `age` | number \| null | Optional; years |
| `originMode` | `'backstory' \| 'memory-loss'` | How origin is framed |
| `sealedBackstorySeed` | string \| null | Optional; sealed until revealed by play |

## Ability scores
Six abilities, classic SRD shape with **generic names**:

| Key | Label |
|-----|--------|
| `strength` | Strength |
| `dexterity` | Dexterity |
| `constitution` | Constitution |
| `intelligence` | Intelligence |
| `wisdom` | Wisdom |
| `charisma` | Charisma |

Scores are integers. Typical play range 1–30; engine accepts any integer and still computes modifiers.

## Derived stats (pure functions)
Given ability scores and optional level (default 1):

1. **Ability modifier** for score `s`: `floor((s - 10) / 2)`
2. **Proficiency bonus** for level `L` (1–20 clamp): `2 + floor((clamp(L,1,20) - 1) / 4)`
3. **Armor class (unarmored baseline)**: `10 + dexterityModifier`
4. **Hit points (max, simple v1)**: `max(1, hitDie + constitutionModifier)` at level 1; for level > 1 add `(L-1) * max(1, floor(hitDie/2) + 1 + constitutionModifier)` — hit die default 8 if class does not specify
5. **Initiative bonus**: `dexterityModifier`
6. **Passive perception**: `10 + wisdomModifier`

Class may supply `hitDie` (4, 6, 8, 10, or 12). Default `8`.

## Non-goals (this contract)
Dice rolling UI, save serialization format, narrator prompts, equipment lists, official monster/stat blocks.
