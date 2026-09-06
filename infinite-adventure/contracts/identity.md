# Contract: Identity UI / create flow

## Purpose
On-device screens and pure helpers to choose a playstyle pack and create a character identity for a new campaign. Builds on `contracts/character.md`, `contracts/playstyle.md`, and `contracts/save.md`. No narrator runtime, no maps/stills, no NSFW.

## Flow
1. **Pack select** — player picks a registered playstyle pack (`playstylePackId`). Class lists come from that pack.
2. **Identity** — player sets character identity fields (below).
3. **Commit** — engine creates a `CharacterSheet` and a `CampaignSave` with that pack id. Party contains **at most** the created PC; never auto-spawn companions. Empty party remains a valid save shape if creation intentionally omits a character.

Home navigates into this flow (e.g. “New campaign”); Settings remains reachable and unchanged in purpose.

## Identity fields (UI)
| Field | Type | Notes |
|-------|------|--------|
| `name` | string | Required; still required under memory-loss |
| `description` | string | Free-text look / vibe (and known backstory prose when `originMode` is `backstory`) |
| `className` | string | From pack class list **or** custom when `allowCustomClasses` |
| `age` | number \| null | Years; optional |
| `originMode` | `'backstory' \| 'memory-loss'` | How origin is framed |

## Memory-loss vs backstory
- **backstory** — player-authored `description` is known; `sealedBackstorySeed` is `null`.
- **memory-loss** — name, class, and age are still collected; `description` may be sparse (“I don’t remember…”). On create, a **`sealedBackstorySeed` is generated on-device** (opaque string) and stored on the sheet for later reveal by play. The engine does not expand or narrate the seed here.

## Pack + class wiring
- Pack must be selected before (or together with) identity so the UI can list `pack.classes`.
- Selecting a listed class applies pack defaults (`className` + `hitDie`) via `applyPackClassDefaults`.
- Custom class text is allowed when `pack.allowCustomClasses` is true; otherwise only listed classes.

## Engine helpers (pure)
- `generateSealedBackstorySeed(rng?)` — opaque on-device seed string
- `createCharacterFromIdentity(input)` — builds a sheet; generates sealed seed iff `originMode === 'memory-loss'`
- `createCampaignFromIdentity(input)` — campaign with `playstylePackId` set; party is `[pc]` by default, or `[]` when `includeCharacter: false`

## Theme
Match app shell: background `#140f0c`, accent `#d4a054` (see product theme).

## Non-goals
Narrator loop, dice/character sheet browse UI, images, Expo device playtest, NSFW. (PersistStore app adapter: see contracts/save.md / T-010.)
