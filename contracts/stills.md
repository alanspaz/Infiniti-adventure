# Contract: On-demand stills (provider + UI cache)

## Purpose
Provider interface for asking to **see** what was described (player / NPC / location / item / injury / free “show me what you described”). Pure TypeScript under `product/engine/`. Offline-first: stub returns cache/placeholder metadata with **no network**. Remote is not configured (same pattern as narrator).

**T-013:** Image UI + device cache persistence. Placeholders/cacheKeys survive reload via injected `PersistStore`.

## Subject kinds
| Kind | Use |
|------|-----|
| `player` | Player character portrait / beat |
| `npc` | Named or stub NPC |
| `location` | Current or named place |
| `item` | Object / gear |
| `injury` | Wound / condition still (non-NSFW) |
| `described` | Free-form “show me what you described” from recent prose |

## Provider kinds
| Kind | Behavior |
|------|----------|
| `stub` | Offline. Returns placeholder result + deterministic `cacheKey`. Never hits network. |
| `remote` | Reserved HTTP image provider. Until configured, throws clear **not configured**. App factory falls back to cached stub when remote incomplete. |
| `on-device` | Reserved local generator. Throws **reserved / not available** in v1. |

## Request / result
**StillRequest:** `subjectKind`, optional `subjectId`, `prompt`, `locationId`, `styleHint`, `playstylePackId`.

**StillResult:**
- `providerKind`, `offline` (true for stub)
- `uri` — null for stub placeholder (no binary); UI shows `Image` only when uri is set and not placeholder
- `placeholder` — true when no real image bytes
- `cacheKey` — stable key (`ia.still.…`)
- `message` — short human status
- `subjectKind`

## Cache persistence (injected store)
Engine stays pure — pass a `PersistStore` (Memory in tests, AsyncStorage adapter in app).

| Helper | Role |
|--------|------|
| `stillPersistKey` / `STILL_CACHE_INDEX_KEY` | Entry + index keys (`ia.still.entry.*`, `ia.still.index`) |
| `writeStillCache` / `readStillCache` / `listStillCacheEntries` | Serialize placeholder metadata |
| `CachingStillProvider` / `createCachedStillProvider` | Wrap any provider; hit cache before request; write on miss |
| App `createAppStillProvider` | Stub + device PersistStore; remote incomplete → cached stub |

## UI
- **StillFrame** — themed frame (`#140f0c` / `#d4a054`); placeholder ornament or Image when uri exists
- **SceneScreen** — “Show me” requests still via cached provider and renders StillFrame
- **StillsScreen** — Home entry; request subject kinds + browse device cache gallery

## Factory
`createStillProvider(kind, options?)` — options may include `baseUrl` / `apiKey` for remote (unused until configured).

## Rules
- No NSFW subjects or prompts in stubs
- Empty party / missing subject ids remain valid (generic placeholder)
- Do not auto-fetch remote images; offline must work
- No real network image generation required for v1

## Non-goals
Binary decode pipelines, vendor brand lock-in, real CDN, Expo device playtest, NSFW.
