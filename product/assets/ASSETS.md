# Sprint B first-look assets (Artist)

Theme: bg `#140f0c` / accent `#d4a054`. No NSFW.

## Files (under `product/assets/`)

| File | Use |
|------|-----|
| `icon.png` | App icon (1:1, gold road/star glyph) |
| `splash.png` | **Primary splash** — softer/warmer first-open (Alan) |
| `splash-epic-cliffside.png` | Alternate — prior epic cliffside sunrise |
| `splash-wordmark.png` | Alternate wordmark splash / marketing still |
| `home-hero.png` | Home screen hero / wordmark plate |
| `packs/pack-hearthlight.png` | PackSelect card — warm hearth / Hearthlight |
| `packs/pack-ash-ledger.png` | PackSelect card — ash ledger / Ash Ledger |
| `stills/still-stub-location.png` | Offline still stub — location |
| `stills/still-stub-player.png` | Offline still stub — player |
| `stills/still-stub-item.png` | Offline still stub — item |

## Expo `app.json` wiring (Coder)

```json
"icon": "./assets/icon.png",
"splash": {
  "image": "./assets/splash.png",
  "resizeMode": "cover",
  "backgroundColor": "#140f0c"
},
"android": {
  "adaptiveIcon": {
    "foregroundImage": "./assets/icon.png",
    "backgroundColor": "#140f0c"
  }
}
```

## UI wiring notes

- Home: show `home-hero.png` above Continue / New campaign.
- PackSelect: card background/header image per pack id (`hearthlight` / `ash-ledger`).
- StillFrame placeholder: pick stub by `subjectKind` (`location` / `player` / `item`; fallback location or player for others).

Source copies also in `/workspace/ia-art-sprint-b/`.

## Update
- `splash.png` replaced with softer/cheerful first-open version (Alan). Prior epic version kept as `splash-epic-cliffside.png`.

## PlayShell header icons (Sprint C) — READY

Drop path: `product/assets/icons/`

| File | Use |
|------|-----|
| `character.png` | Header · Character (64) |
| `items.png` | Items |
| `dice.png` | Dice |
| `combat.png` | Combat / stats |
| `quest.png` | Quest |
| `companions.png` | Companions |
| `map.png` | Map |
| `settings.png` | Settings |
| `dm-avatar.png` | Story chat narrator avatar (64) |

Aliases also present as `icon-*.png` / `avatar-narrator.png` (+ `-48` variants). Gold on transparent. Theme `#140f0c` / `#d4a054`.

Sprite reference slices remain under `ui/icons/` for design history.
