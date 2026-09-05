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
In scope for current work: settings shell, character sheet contract + pure TS engine with derived stats.
Out of scope for this slice: dice UI, save system, playstyle packs UI, identity screens, narrator, maps, images, multiplayer, AI vendor selection beyond stub/remote/on-device kinds.
