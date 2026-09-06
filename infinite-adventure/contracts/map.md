# Contract: Maps / whereAmI

## Purpose
On-device map graph and location awareness for Infinite Adventure. Pure TypeScript under `product/engine/`. Hierarchy, exits, and `whereAmI` run offline; the narrator may **color** the whereAmI line only when online (engine always returns a plain on-device line).

## Hierarchy
Strict nesting (parent chain):

| Kind | Example |
|------|---------|
| `region` | Vale of Embervale |
| `locale` | Emberford (town), Ashen Fields |
| `place` | inn, smithy, alchemist shop |
| `interior` | common room, counter, cellar |

Every node except the root region has a `parentId`. Path strings walk parents root → leaf.

## Graph shapes
- **MapGraph** — `id`, `title`, `startNodeId`, `nodes` (id → MapNode)
- **MapNode** — `id`, `kind`, `name`, `description`, `parentId` (null for root), `exits`
- **MapExit** — `id`, `label` (player-facing), `toNodeId`

## whereAmI
Given a graph + `locationId` (campaign `session.locationId`):

| Field | Notes |
|-------|--------|
| `nodeId` | Current node |
| `pathParts` | Ordered `{ id, name, kind }` from region → current |
| `path` | Joined path string (` › ` separator) |
| `name` / `description` / `kind` | Current node |
| `exits` | `{ id, label, toNodeId, toName }[]` |
| `line` | Plain on-device summary (path + short exit list). Narrator coloring is out of band / online only |

Throws if `locationId` is missing from the graph.

## Navigation
- `listExits(graph, locationId)`
- `travel(graph, fromId, exitId)` → destination node id (validates exit)
- `travelByLabel(graph, fromId, label)` → case-insensitive label match
- `setCampaignLocation(campaign, locationId)` → updates `session.locationId` via save helpers
- `placeCampaignAtMapStart(campaign, graph?)` → sets location to graph `startNodeId`

## Starter sample
`createStarterMap()` / `STARTER_MAP_ID` — generic fantasy (Embervale / Emberford / Copper Kettle / Brightanvil / Mossglass). **No WotC IP.** Used for tests and optional Map screen.

## Campaign integration
`SessionState.locationId` already exists on saves. New campaigns from identity may start at the starter map `startNodeId`. Empty party remains valid.

## Non-goals (this contract)
Full overworld UI, fog of war, procedural generation, remote map sync, NSFW locales, Expo device playtest.
