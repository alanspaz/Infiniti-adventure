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

## Tale backdrops (BG-01) — Artist delivery

Drop path: `product/assets/backdrops/`. Format: progressive JPEG (opaque art, much smaller than PNG; Metro `require` handles `.jpg`).
New scene/speaker art is portrait 720×1280 (9:16), subject in upper/middle, dark calm lower third for the chat log. Target ~150–350 KB each.

| File | Backdrop key(s) | Use |
|------|-----------------|-----|
| `backdrops/emberford.jpg` | `location:locale.emberford` | Riverside town street, chimneys, market awnings, dusk lanterns |
| `backdrops/ashen-fields.jpg` | `location:locale.ashen-fields` | Pale ash farmland, leaning scarecrows, windmill, watch-stones |
| `backdrops/brightanvil.jpg` | `location:place.brightanvil` | Open forge yard, anvil sparks, weapon racks |
| `backdrops/smith-forge.jpg` | `location:interior.smith-forge` | Forge floor: coals, bellows, quench tub, blade racks |
| `backdrops/mossglass.jpg` | `location:place.mossglass` | Narrow apothecary: green bottles, drying herbs, green lamps |
| `backdrops/alchemist-counter.jpg` | `location:interior.alchemist-counter` | Polished counter, vials, ledger + quill, scales |
| `backdrops/kettle-cellar.jpg` | `location:interior.kettle-cellar` | Vaulted stone cellar, cider casks, locked chest, stairs up |
| `backdrops/kettle-common.jpg` | `location:interior.kettle-common` (optional) | Inn common room: big hearth, long bar, benches |
| `backdrops/merchant-hollis.jpg` | `merchant:merchant.kettle` | Hollis the innkeeper wiping the bar |
| `backdrops/merchant-dagna.jpg` | `merchant:merchant.brightanvil` | Dagna Brightanvil, smith, hammer on shoulder |
| `backdrops/merchant-fennick.jpg` | `merchant:merchant.mossglass` | Fennick of Mossglass, alchemist over ledger |
| `backdrops/foe-ash-wolf.jpg` | `foe:foe.ash-wolf` | Snarling cinder-grey wolf on ash fields |
| `backdrops/foe-scarecrow-husk.jpg` | `foe:foe.scarecrow-husk` | Animated scarecrow, glowing eyes, straw/red-thread charm |
| `backdrops/foe-road-bandit.jpg` | `foe:foe.road-bandit` | Hooded, masked bandit with dagger on the vale road |
| `backdrops/foe-cellar-rat.jpg` | `foe:foe.cellar-rat` | Giant rat on a cask in the cellar |
| `backdrops/foe-ruffian.jpg` | `foe:foe.ruffian` | Rowdy brawler, fists up, lantern-lit alley |

All 16 above: 720×1280 portrait progressive JPEG, 159,061–254,032 B each, 3386347 B total. Subjects sit in the upper/middle, lower third kept dark for the scrim; no text, no NSFW, no gore.

### Compressed copies of reused art (drop-in, same 1536×1024 framing)

| File | Replaces (for backdrops only) | Size |
|------|-------------------------------|------|
| `backdrops/hearth-sm.jpg` | `packs/pack-hearthlight.png` (2,052,565 B) → `art.hearth` | 235,810 B |
| `backdrops/vista-embervale-sm.jpg` | `splash-epic-cliffside.png` (2,342,564 B) → `art.vista` (`appImages.vistaEmbervale`) | 279,473 B |

Originals untouched (PackSelect still uses `pack-hearthlight.png`; splash files unchanged). If `splash-epic-cliffside.png` is not used elsewhere, the backdrop can drop its 2.3 MB require entirely.

Wiring sketch: `images.ts` → `bgEmberford: require('../assets/backdrops/emberford.jpg')` …; `BackdropArtId` add e.g. `'art.emberford' | 'art.merchant.hollis' | 'art.foe.ash-wolf'`; point `art.hearth`/`art.vista` at the `-sm.jpg` copies.
