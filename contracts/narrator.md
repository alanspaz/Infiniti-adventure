# Contract: Narrator provider

## Purpose
OpenAI-compatible chat/completions-style interface for scene prose. Pure TypeScript under `product/engine/` (+ thin app factory under `product/src/ai/`). Hybrid offline: a **stub** provider returns pack-template / canned prose with **no network**. Vendor brand is **not** chosen — remote uses abstract **base URL** + API key + optional model from Settings.

## Provider kinds (`ProviderKind`)
| Kind | Behavior |
|------|----------|
| `stub` | Offline. Uses playstyle pack `contentStubs` (e.g. `openingBeat`) and canned fallbacks. Always works. |
| `remote` | OpenAI-compatible HTTP (`{baseUrl}/chat/completions`). Needs base URL + API key in settings. When configured, play factory sets `enableHttp` and uses real `fetch` (or injected `fetchImpl` in tests). Scene play falls back to stub if remote is missing or fails. |
| `on-device` | Reserved for a future local model. Throws clear **reserved / not available** in v1; play factory uses stub with a reserved note. |

Default settings kind remains `stub` (see settings prefs).

## Settings (prefs + SecureStore)
| Field | Storage | Notes |
|-------|---------|--------|
| `providerKind` | prefs blob `ia.settings.prefs` | stub / remote / on-device |
| `verbosity` | prefs blob | short / standard / lush |
| `baseUrl` | prefs blob | e.g. `https://api.openai.com/v1` (OpenRouter / xAI compatible) |
| `model` | prefs blob | optional model id |
| `apiKey` | SecureStore `ia.settings.apiKey` | **never logged** |

UI shows a clear error when remote is selected but base URL and/or API key is missing (`remoteConfigError`).

## Abstraction (chat/completions-style)
Request messages: `role` ∈ `system` \| `user` \| `assistant`, `content` string.

`NarratorProvider`:
- `kind` — provider kind
- `createChatCompletion(request)` → OpenAI-like `{ id, object: 'chat.completion', created, model, choices: [{ message, finish_reason }] }`
- `narrateScene(request)` → `{ prose, providerKind, offline, source }` higher-level scene helper

### Scene request (engine)
| Field | Notes |
|-------|--------|
| `playstylePackId` | Optional; stub loads pack templates when set |
| `locationId` | Optional place id |
| `partyNames` | Display names; **empty party is valid** |
| `turn` | Non-negative turn hint |
| `playerAction` | Optional player text |
| `logSummary` | Optional recent summary |
| `verbosity` | `short` \| `standard` \| `lush` (matches settings) |
| `beat` | `opening` \| `continue` \| `custom` |
| `checkHint` | Optional dice/check outcome line for prose coloring |

### Scene result `source`
`pack-template` \| `canned` \| `remote` \| `on-device`

## Factory
- `createNarratorProvider(kind, options?)` — engine; options may include `baseUrl`, `apiKey`, `model`, `enableHttp`, `fetchImpl` for remote
- App: `createNarratorFromSettings` / `createPlayNarrator` / `narrateSceneForPlay` — play helpers fall back to stub when remote is unavailable; when remote is fully configured, HTTP is enabled with fetch

## Offline / NSFW
- Stub never requires network; engine unit tests must pass offline
- Tests must not require a real API key — mock `fetchImpl`
- No NSFW prose in stubs or canned lines
- Empty party never auto-spawns companions in narrator helpers

## Related
Full adventure play loop: `contracts/scene.md` (T-012). Settings polish: T-014.
