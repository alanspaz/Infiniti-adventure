# Contract: Scene / adventure loop

## Purpose
On-device play loop that stitches narrator → player action → optional dice check → state apply (location / log / turn) → optional still → persist-ready campaign. Pure TypeScript under `product/engine/scene.ts`; UI in `SceneScreen`.

## Loop (v1)
1. **Beat** — `resolveSceneBeat` / `resolveOpeningBeat` calls a `NarratorProvider` (`stub` offline by default).
2. **Player action** — free text; empty party valid.
3. **Check** — heuristic `detectSuggestedCheck` (or `forceCheck`) → engine `resolveCheck` with PC modifiers when party non-empty (modifier 0 if empty).
4. **Travel** — `detectTravelSuggestion` matches exit labels / place names on the starter map; updates `session.locationId`.
5. **Show me** — optional stub still (`placeholder` + `cacheKey`); no image UI required.
6. **Persist** — returns updated `CampaignSave`; app shell writes via PersistStore.

## Verbosity
Settings `short` | `standard` | `lush` passed into narrator.

## Providers
- **Stub** — always works offline (required).
- **Remote** — optional HTTP when `baseUrl` + `apiKey` + `enableHttp`; app factory falls back to stub if not configured or request fails. Never blocks offline play.
- **On-device** — reserved; factory falls back to stub.

## Non-goals
Companion emotion system (not present yet), NSFW, Expo device playtest, vendor brand lock-in, stills image gallery.
