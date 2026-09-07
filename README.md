# Infinite Adventure

Solo phone RPG with an AI narrator. Rules, dice, maps, and saves on-device; ask to see what was described.

**Display title:** Infinite Adventure
**Suggested GitHub repo:** alanspaz/Infiniti-adventure

## Stack

- Expo ~57, React 19.2, React Native 0.86
- TypeScript
- Settings via React Context + expo-secure-store (in-memory fallback); prefs include verbosity, providerKind, **base URL**, optional **model**
- Campaign saves via PersistStore: MemoryPersistStore (tests) + AsyncStorage adapter (runtime; memory fallback)
- Pure TS game engine under `product/engine/` (character, dice, save, playstyle packs, identity create, narrator, maps/whereAmI, stills + cache, **scene adventure loop**)
- Playstyle pack content under `product/packs/` (Hearthlight, Ash Ledger)
- Narrator: stub (offline) | remote (OpenAI-compatible base URL + key; HTTP when configured; stub fallback) | on-device (reserved); thin `src/ai` factory
- Maps: starter Embervale graph; whereAmI path/exits on-device
- Stills: stub placeholder/cacheKey + device PersistStore cache; StillFrame UI; Stills gallery; Scene “show me”; remote not configured
- App screens: Home (Continue / New campaign), Settings, Pack select, Identity, **PlayShell tabs** (Story stays mounted; Quest / Character / Companions / Items / Map / Settings), Dice, Stills

## Run locally (Windows + Expo Go)

App lives under `product/` (Expo SDK **57**). Do **not** start Metro from the repo root.

**Windows path:**

    C:\Users\alank\Desktop\Infiniti-adventure\product

**Node:** prefer **22 LTS** (20 OK; avoid 24). `product/.nvmrc` pins 22.

**Expo Go** on the phone must match **SDK 57**.

Copy-paste (PowerShell / cmd):

    cd C:\Users\alank\Desktop\Infiniti-adventure
    git pull
    cd product
    npm install
    npm run start:clear

Tunnel if LAN/firewall blocks Metro:

    npm run start:tunnel

Or clear + tunnel: `npm run start:tunnel:clear`

Equiv: `npx expo start -c` / `npx expo start --tunnel`

Scripts fail loudly if cwd is wrong (see `product/scripts/ensure-product-cwd.js`).

Full detail: `product/README.md`.

Backend verification (no device), from `product/`:

    npm test
    npx tsc --noEmit

## Upload to GitHub

Exclude product/node_modules and product/.expo. Handoff zip is flat at repo root.

## Docs

- product/README.md — Windows Expo Go / Metro runbook
- PRODUCT.md — locked product brief
- CREW.md — next ticket pointer (companion UX / device playtest)
- board/ — backlog / done
- contracts/ — character, dice, save, playstyle, identity, narrator, map, stills, **scene**
- tickets/ — ticket records

## Theme

Background #140f0c, accent #d4a054. Portrait-first; tablets allowed.

## Node version

**Prefer Node 22 LTS** over Node 24 (package engines: >=20 <25). Node 24 may break Expo Metro bundling on Windows. Use `product/.nvmrc`.

## Metro bundling note

`babel-preset-expo` is a direct dependency; `metro.config.js` uses `expo/metro-config`. If Metro fails with a `transformFile` TypeError: reinstall under `product/`, use Node 22, then `npm run start:clear`.
