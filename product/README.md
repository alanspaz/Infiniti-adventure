# Infinite Adventure — product (Expo app)

Expo SDK **57** app. Run everything from this folder (`product/`), not the repo root.

## Windows path

    C:\Users\alank\Desktop\Infiniti-adventure\product

## Prerequisites

- **Node 22 LTS preferred** (Node 20 OK; **avoid Node 24** — Metro/Expo CLI flakiness on Windows)
- Expo Go on phone must match **SDK 57**
- Same Wi-Fi for LAN; use tunnel if LAN/firewall blocks Metro
- Optional: nvm/fnm picks Node 22 from `.nvmrc` in this folder

## First-time / after pull

    cd C:\Users\alank\Desktop\Infiniti-adventure
    git pull
    cd product
    npm install

## Start Metro (Expo Go)

Clear cache (recommended after pull or bundler weirdness):

    cd C:\Users\alank\Desktop\Infiniti-adventure\product
    npm run start:clear

Equiv: `npx expo start -c`

Normal: `npm start`

### Tunnel (phone cannot reach PC LAN)

    npm run start:tunnel

Clear + tunnel: `npm run start:tunnel:clear`

Scan QR with **Expo Go** (SDK 57). Prefer tunnel if Windows firewall / guest Wi-Fi blocks port 8081.

## Scripts (must run from product/)

| Script | What it does |
|--------|----------------|
| `npm start` | `expo start` (cwd guard via `prestart`) |
| `npm run start:clear` | `expo start -c` |
| `npm run start:tunnel` | `expo start --tunnel` |
| `npm run start:tunnel:clear` | `expo start -c --tunnel` |
| `npm test` | unit tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run smoke` | backend smoke script |

If you run these from the **repo root**, the cwd guard fails loudly and prints the Windows `cd` path.

## Verify (no device)

    cd C:\Users\alank\Desktop\Infiniti-adventure\product
    npm test
    npx tsc --noEmit

## Metro / babel notes

Already wired for SDK 57:

- `babel.config.js` uses `babel-preset-expo` (also a **direct** dependency)
- `metro.config.js` uses `expo/metro-config` `getDefaultConfig(__dirname)`

If Metro dies with a `transformFile` TypeError: remove `node_modules`, reinstall under `product/`, use **Node 22**, then `npm run start:clear`.

## Tip to open

Repo tip with Hybrid + Q/I: `d19e3d3` or later on `main`.
