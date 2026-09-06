# Done

## T-016 — Play shell UI polish
- PlayShell tabs Story Quest Character Companions Items Map Settings
- Story player-facing only; Map holds location path
- Stub narrator omits turn markers from prose
- Home entry Continue to play shell
- Theme retained; tests green


## T-014 — Remote narrator settings polish
- Settings: provider kind, API key, base URL, optional model; clear remote incomplete errors
- Prefs blob persists baseUrl/model; SecureStore for API key (never logged)
- createPlayNarrator enables HTTP fetch when remote configured; stub fallback otherwise; on-device reserved
- contracts/narrator.md; unit + smoke (mock fetch); docs + flat zip; GitHub push when green

## T-013 — Stills image UI / cache persistence
- StillFrame + StillsScreen (Home); Scene “Show me” shows themed placeholder / cached result
- PersistStore stills cache (`CachingStillProvider`); placeholders/cacheKeys survive reload
- Remote stills not configured (optional); offline stub; empty party valid; no NSFW
- Smoke + docs + flat zip refresh


## T-012 — Scene / adventure loop
- Real Scene play screen: narrator beat → action → optional check → travel → optional show-me still → persist
- Engine `scene.ts` heuristics + `resolveSceneBeat`; stub offline; remote HTTP optional (`enableHttp`) with stub fallback
- Home Continue / New scene wired; verbosity from settings; empty party valid
- Smoke + docs + flat zip refresh


## T-011 — Dice / character UI surfaces
- Character sheet screen: PC identity + derived stats from engine; empty-state (no campaign / empty party)
- Dice screen: NdM rolls + ability checks (engine dice + character modifiers); results shown
- Home entries: Character sheet / Dice; theme matched; empty party valid
- Smoke + docs + flat zip refresh


## T-010 — PersistStore AsyncStorage adapter
- AsyncPersistStore (`@react-native-async-storage/async-storage`) + memory fallback; MemoryPersistStore for tests
- `ia.save.activeId` continue pointer; Identity create / Home continue / Map travel persist best-effort
- contracts/save.md updated; unit tests + smoke (passing)

## T-008 — Maps / whereAmI
- `contracts/map.md` written
- Pure TS: `product/engine/map.ts` — hierarchy region→locale→place→interior, path string, exits, `whereAmI` (on-device line), travel helpers
- Starter sample map **Embervale** (generic fantasy, no WotC IP); `session.locationId` integration + identity create starts at map start
- Thin `MapScreen` from Home; unit tests + smoke (passing)

## T-009 — On-demand stills stub
- `contracts/stills.md` written
- Pure TS: `product/engine/stills.ts` — stub placeholder/cacheKey offline; remote not configured; on-device reserved
- Subject kinds: player/NPC/location/item/injury/described; no image UI
- Unit tests + smoke (passing)

## T-007 — Narrator provider stub
- `contracts/narrator.md` written
- Pure TS: `product/engine/narrator.ts` — OpenAI-compatible chat/completions interface + `narrateScene`
- Providers: **stub** (pack `contentStubs` / canned offline), **remote** (clear not-configured / optional enableHttp), **on-device** (reserved)
- Thin app factory `product/src/ai/`; SceneScreen play loop uses stub fallback
- Wired to settings `ProviderKind` via factory; default remains stub
- Empty party valid; no NSFW; unit tests + smoke (passing)

## Scaffold (T-001 / T-002 / T-015 / T-016 related)
- Expo ~57 app under `product/` with React 19 / RN 0.86, TypeScript
- Theme, Settings context + SecureStore (with in-memory fallback)
- Home + Settings screens; App.tsx screen switch
- PRODUCT.md, CREW.md, board, tickets, README

## T-003 — Character sheet + derived stats
- `contracts/character.md` written
- Pure TS engine under `product/engine/`
- Identity fields + derived-stat math
- Empty party valid; no auto-spawn companions
- Unit tests for derived stats (passing)

## T-004 — Dice / resolution
- `contracts/dice.md` written
- Pure TS: seedable RNG, polyhedral rolls, notation, checks, contested
- Wired with character modifiers / proficiency
- Unit tests (passing)

## T-005 — Save system
- `contracts/save.md` written
- Campaign/session shapes, JSON serialize/parse, PersistStore + MemoryPersistStore
- Empty party valid on create/load; no auto-companions
- Unit tests (passing)

## T-006 — Playstyle packs
- `contracts/playstyle.md` written
- Pack metadata + content stubs: **Hearthlight** (warm heroic, medium crunch) and **Ash Ledger** (grittier resources) under `product/packs/`
- Engine load/list/class lookup + resource hooks (`product/engine/pack.ts`)
- Empty party still valid with a pack id set
- Unit tests for loading packs and class-list / resource hooks (passing)

## T-006a — Identity UI
- `contracts/identity.md` written
- Pack select + Identity screens; Home **New campaign** → pack → identity → campaign banner
- `product/engine/identity.ts`: sealed backstory seed, create from identity → character + campaign
- Class list from selected pack (or custom); memory-loss generates `sealedBackstorySeed` on-device
- Empty party still valid; no auto-companions; theme matched to Home/Settings
- Unit tests + smoke (passing)
