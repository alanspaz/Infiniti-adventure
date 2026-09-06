# Infinite Adventure

Solo phone RPG with an AI narrator. Rules, dice, maps, and saves on-device; ask to see what was described.

**Display title:** Infinite Adventure
**Suggested GitHub repo:** alanspaz/Infiniti-adventure

## Stack

- Expo ~57, React 19.2, React Native 0.86
- TypeScript
- Settings via React Context + expo-secure-store (in-memory fallback)
- Campaign saves via PersistStore: MemoryPersistStore (tests) + AsyncStorage adapter (runtime; memory fallback)
- Pure TS game engine under `product/engine/` (character, dice, save, playstyle packs, identity create, narrator, maps/whereAmI, stills + cache, **scene adventure loop**)
- Playstyle pack content under `product/packs/` (Hearthlight, Ash Ledger)
- Narrator: stub (offline) | remote (optional HTTP when configured; stub fallback) | on-device (reserved); thin `src/ai` factory
- Maps: starter Embervale graph; whereAmI path/exits on-device
- Stills: stub placeholder/cacheKey + device PersistStore cache; StillFrame UI; Stills gallery; Scene “show me”; remote not configured
- App screens: Home (continue → Scene), Settings, Pack select, Identity, **Scene play loop**, Map (whereAmI), Character sheet, Dice, **Stills**

## Run locally

From product/: install, expo start.

Backend verification (no device): tsc --noEmit, test suite, smoke script.

## Upload to GitHub

Exclude product/node_modules and product/.expo. Handoff zip is flat at repo root.

## Docs

- PRODUCT.md — locked product brief
- CREW.md — next ticket pointer (remote settings / companion UX)
- board/ — backlog / done
- contracts/ — character, dice, save, playstyle, identity, narrator, map, stills, **scene**
- tickets/ — ticket records

## Theme

Background #140f0c, accent #d4a054. Portrait-first; tablets allowed.
