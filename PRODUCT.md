# Infinite Adventure — Product Brief (Locked)

## Title
**Infinite Adventure** (display name). Repository may be named Infiniti-adventure elsewhere; treat that as packaging only.

## Pitch
Solo phone RPG with an AI narrator. Rules, dice, maps, and saves run on-device for offline play. The player can ask to see what was described (on-demand stills).

## Genre
AI-narrated TTRPG-style / text adventure with on-demand stills. D&D-inspired fantasy math is fine when shaped like a generic SRD, but this is **not** official D&D: no WotC product names, no book-only monsters, no official logos. Do not label UI as “5e”.

## Platform
iOS + Android via **React Native + Expo**. Portrait-first. Tablets allowed in `app.json`.

## Tone & packs
Original fantasy. Planned playstyle packs:
- **Hearthlight** — warm heroic
- **Ash Ledger** — gritty

Theme colors: background `#140f0c`, accent `#d4a054`.

## Out of v1
- NSFW content
- Monetization / ads / IAP
- Real on-device LLM (stub provider only in v1)

## Solo by default
The player is alone unless they explicitly form a party. Empty party is valid; do not auto-spawn companions.

## Scope boundaries (v1 scaffold + engine)
Done in engine/app: settings shell, character sheet engine + Character sheet UI, dice/resolution engine + Dice UI, save/load shapes, playstyle packs (Hearthlight / Ash Ledger), identity create UI (pack → identity), narrator provider stub (offline pack-template/canned; remote optional HTTP + stub fallback), maps/whereAmI (starter Embervale graph + Map screen), stills provider stub (placeholder/cache; Scene show-me), PersistStore AsyncStorage adapter, **Scene adventure loop** (Home Continue / New scene).
Out of scope until ticketed: stills image UI / cache persistence, remote base URL in settings polish, companion emotion, multiplayer, AI vendor brand selection, Expo device playtest.
