# Infinite Adventure

Solo phone RPG with an AI narrator. Rules, dice, maps, and saves on-device; ask to see what was described.

**Display title:** Infinite Adventure
**Suggested GitHub repo:** alanspaz/Infiniti-adventure

## Stack

- Expo ~57, React 19.2, React Native 0.86
- TypeScript
- Settings via React Context + expo-secure-store (in-memory fallback)
- Pure TS game engine under `product/engine/`

## Run locally

From `product/`:

```
cd product
npm install
npx expo start
```

```
cd product
npx tsc --noEmit
npm test
```

## Upload to GitHub

Upload this project (exclude `product/node_modules`) to the Infiniti-adventure repo.

1. Initialize git and commit the tree
2. Add remote origin for alanspaz/Infiniti-adventure
3. Push the main branch

Or use the GitHub web UI zip upload.

## Docs

- `PRODUCT.md` — locked product brief
- `CREW.md` — next ticket pointer (**T-004**)
- `board/` — backlog / done
- `contracts/character.md` — character sheet contract
- `tickets/` — ticket records

## Theme

Background `#140f0c`, accent `#d4a054`. Portrait-first; tablets allowed.
