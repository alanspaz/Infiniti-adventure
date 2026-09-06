# Contract: Playstyle packs

## Purpose
Loadable playstyle packs that flavor tone, class lists, and resource/crunch hints. Pure data + pure functions in the engine. No React, no I/O, no narrator runtime, no NSFW.

## Built-in packs (v1)
| Id | Display name | Tone | Crunch |
|----|--------------|------|--------|
| `hearthlight` | Hearthlight | Warm heroic | Medium |
| `ash-ledger` | Ash Ledger | Gritty / hard-edged | Medium with grittier resources |

Pack ids are stable kebab-case strings. Campaign saves store `playstylePackId` (see `contracts/save.md`); `null` means unset.

## Pack metadata
| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable pack id |
| `displayName` | string | UI label |
| `description` | string | Short pitch |
| `allowCustomClasses` | boolean | If true, classes outside the list are allowed |
| `classes` | `PackClassDef[]` | Suggested / listed classes |
| `tone` | object | `summary`, `imageStyle` hints for later stills/narrator |
| `resources` | object | Crunch + resource-tracking flavor (see below) |
| `contentStubs` | object | Placeholder prompt/seed strings; not executed |

### PackClassDef
| Field | Type | Notes |
|-------|------|--------|
| `id` | string | Stable within pack |
| `name` | string | Display / `className` match target |
| `hitDie` | `4 \| 6 \| 8 \| 10 \| 12` | Default hit die when applying class |
| `summary` | string | One-line flavor |

### Tone hints
- `summary` — prose tone for future narrator
- `imageStyle` — short still-generation style hint (no provider wiring here)

### Resources / crunch
| Field | Type | Notes |
|-------|------|--------|
| `crunch` | `'light' \| 'medium' \| 'heavy'` | Rules density hint |
| `trackSupplies` | boolean | Scarcity / supply tracking flavor |
| `trackWounds` | boolean | Lingering harm flavor (Ash Ledger) |
| `heroicInspiration` | boolean | Warm heroic inspiration flavor (Hearthlight) |
| `restHarshness` | `'generous' \| 'standard' \| 'harsh'` | Rest recovery flavor |

## Engine API (pure)
- `listPlaystylePacks()` — all registered packs (metadata)
- `loadPlaystylePack(id)` — pack by id, or throw if unknown
- `tryLoadPlaystylePack(id)` — pack or `null`
- `getPackClass(pack, classNameOrId)` — lookup by class `id` or `name` (case-insensitive name)
- `isClassAllowed(pack, className)` — true if listed, or `allowCustomClasses`
- `applyPackClassDefaults(sheet, pack, classNameOrId)` — sets `className` + `hitDie` from pack class when found; no-op lookup miss if custom allowed / returns unchanged sheet when not found and custom allowed
- Empty party remains valid regardless of pack; loading a pack never spawns companions

## Content stubs
Packs may include `contentStubs` with keys such as `openingBeat`, `narratorSystemHint`. These are **data only** for later tickets (narrator / identity UI). The engine does not call an LLM.

## Non-goals (this contract)
Maps/stills pipeline, full class feature lists, NSFW variants, device Expo playtest. Narrator: see contracts/narrator.md / T-007. Identity UI: see contracts/identity.md / T-006a.
