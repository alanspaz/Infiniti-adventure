# Contract: Save / load

## Purpose
On-device campaign and session state for Infinite Adventure. Pure shapes + serialize helpers in the engine. Persistence backends are pluggable. Empty party is valid.

## Versioning
- Every save blob has `schemaVersion` (integer).
- Current schema version: **1**.
- Loaders reject unknown future versions; may migrate older versions when migrations exist.

## Campaign save
Top-level document written to durable storage.

| Field | Type | Notes |
|-------|------|--------|
| `schemaVersion` | `1` | Schema marker |
| `id` | string | Stable campaign id |
| `title` | string | Display title |
| `createdAt` | string | ISO-8601 timestamp |
| `updatedAt` | string | ISO-8601 timestamp |
| `playstylePackId` | string \| null | e.g. `hearthlight`, `ash-ledger`; null until chosen |
| `party` | `CharacterSheet[]` | Ordered; **may be empty** |
| `session` | `SessionState` | Current play pointer |
| `flags` | `Record<string, boolean \| number \| string>` | Lightweight quest/world flags |
| `world` | `CampaignWorldState` (optional) | Inventory/gold (≥0), quests, combat, storyMeta, playPrefs (CS-01); omitted on older saves |

## Session state
| Field | Type | Notes |
|-------|------|--------|
| `turn` | number | Non-negative integer counter |
| `locationId` | string \| null | Current place id (maps) |
| `logSummary` | string | Short offline-safe summary of recent events |
| `rngSeed` | number \| null | Optional seed for reproducible dice |
| `storyBeats` | `StoryBeatRecord[]` (optional) | Player-facing Story log for Continue hydrate; capped |

## CampaignState (CS-01 / Q-01 / I-01)
PlayShell panels read a unified `CampaignState` view (`campaignToState`) over `party` + `session` + `world`. Story applies structured patches (`applyCampaignPatch` / `patchesFromSceneBeat`) — no per-tab local copies.

### Quests (Q-01)
- `world.quests[]`: `{ id, title, status, summary?, progressNotes? }`
- Status: `active` | `done` | `failed` (legacy wire value `complete` normalizes to `done`)
- Patches: `acceptQuest`, `updateQuest`, `completeQuestId`, `failQuestId` (+ `upsertQuest` stub)
- New campaigns seed an optional starter quest (`quest-first-steps`); older saves without `world` stay empty
- Quest tab shows active + done; empty journal must never crash

### Inventory (I-01)
- `world.inventory`: `{ gold, items[] }` with `gold ≥ 0` always on persist/normalize
- Patches: `grantGold`, `spendGold`, `addGold` (signed), `addItem`, `removeItemId`
- **Gold policy:** prefer **reject** a spend that would go negative (gold unchanged); always **clamp** persisted gold ≥ 0 as a safety net on direct writes / normalize

## Persistence interface
```ts
interface PersistStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
```

- Engine provides **MemoryPersistStore** for tests.
- App shell provides **AsyncPersistStore** (`@react-native-async-storage/async-storage`) with in-memory fallback (same pattern as settings SecureStore probe). Campaign JSON prefers AsyncStorage over SecureStore due to size limits.
- Serialize / deserialize via JSON (`serializeCampaign` / `parseCampaign`).
- Key prefix: `ia.save.` + campaign id.
- Active continue pointer: `ia.save.activeId` → campaign id (Home continue after reload).
- App helpers: `persistCampaign`, `loadActiveCampaign` under `product/src/persist/`.
- Never auto-spawn companions on load; restore party exactly (including empty).
- Best-effort in JS: UI continues if storage throws (memory-only note).

## Non-goals (this contract)
Cloud sync, multiplayer, full playstyle pack content. Identity create: `contracts/identity.md`. Settings API key remains on SecureStore (`settings/storage.ts`).
