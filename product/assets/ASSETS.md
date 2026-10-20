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

## Tale backdrops (BG-01) — art wanted

Resolver: `engine/backdrop.ts` (`BACKDROP_ART`), images: `src/components/TaleBackdrop.tsx`.
Precedence: combat foe → open-shop merchant → location chain (room → parent → region) → theme placeholder.
Shown dimmed under a ~72–80% `#140f0c` scrim, `cover`-cropped to a portrait phone; keep subjects centred, low detail at top/bottom, landscape 1536×1024 like existing art is fine. No NSFW.

Reused today: `packs/pack-hearthlight.png` → `location:place.copper-kettle` (+ its rooms); `splash-epic-cliffside.png` → `location:region.embervale` (default for everything else).

Still needed (falls back today):
- Locations: `locale.emberford` (town streets/market), `locale.ashen-fields` (pale ash farmland, scarecrows), `place.brightanvil` / `interior.smith-forge` (forge yard / forge floor), `place.mossglass` / `interior.alchemist-counter` (green-glass apothecary), `interior.kettle-common` (inn common room, optional — inherits hearth), `interior.kettle-cellar` (cool stone cellar, casks).
- Merchants (shop open): `merchant:merchant.kettle` (Hollis, innkeeper), `merchant:merchant.brightanvil` (Dagna, smith), `merchant:merchant.mossglass` (Fennick, alchemist).
- Foes (in combat): `foe:foe.ash-wolf`, `foe:foe.scarecrow-husk`, `foe:foe.road-bandit`, `foe:foe.cellar-rat`, `foe:foe.ruffian`.

To wire a new file: add `require` in `src/images.ts`, an art id in `BackdropArtId` + `BACKDROP_IMAGES`, and the key in `BACKDROP_ART`.
