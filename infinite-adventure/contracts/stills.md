# Contract: On-demand stills (provider stub)

## Purpose
Provider interface for asking to **see** what was described (player / NPC / location / item / injury / free “show me what you described”). Pure TypeScript under `product/engine/`. Offline-first: stub returns cache/placeholder metadata with **no network**. Remote is not configured (same pattern as narrator). Full image UI is out of scope.

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
| `remote` | Reserved HTTP image provider. Until configured, throws clear **not configured**. |
| `on-device` | Reserved local generator. Throws **reserved / not available** in v1. |

## Request / result
**StillRequest:** `subjectKind`, optional `subjectId`, `prompt`, `locationId`, `styleHint`, `playstylePackId`.

**StillResult:**
- `providerKind`, `offline` (true for stub)
- `uri` — null for stub placeholder (no binary)
- `placeholder` — true when no real image bytes
- `cacheKey` — stable key for future cache (`ia.still.…`)
- `message` — short human status (e.g. “Placeholder still (offline)”)
- `subjectKind`

## Factory
`createStillProvider(kind, options?)` — options may include `baseUrl` / `apiKey` for remote (unused until configured).

## Rules
- No NSFW subjects or prompts in stubs
- Empty party / missing subject ids remain valid (generic placeholder)
- Do not auto-fetch remote images

## Non-goals
Image UI screens, binary decode, vendor brand lock-in, real CDN, Expo device playtest.
