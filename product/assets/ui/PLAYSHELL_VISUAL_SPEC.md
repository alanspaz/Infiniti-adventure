# PlayShell visual spec (layout from Base44 — theme = Infinite Adventure)

**Source:** Alan Base44 prototype screenshot — **LAYOUT ONLY** (not purple/orange skin, not Base44 copy).  
**Locks:** `#140f0c` bg / `#d4a054` accent default · **NO NSFW** · empty party valid · stub narrator OK · portrait mobile.

## Screen structure (top → bottom)

### 1. Header
| Element | Spec |
|--------|------|
| Back | Left chevron, accent or text color, hits Home / leave play |
| Title block | Campaign title (18–20 bold, `#f2e8d5`) · subtitle `{PC name or "Solo"} • Level {n}` (`#a89880`, 13) |
| Icon grid | **2×4** top-right (not text pills). Hit ~40–44pt cells, 8–10pt gap. Inactive: muted gold/line `#a89880`. Active: filled/soft plate `#241c16` + accent `#d4a054` + 1px accent border. Labels optional under icons (10–11 caps) or a11y-only |

**Grid order (row-major):**  
1 Character · 2 Items · 3 Dice · 4 Combat/Sheet  
5 Quest · 6 Companions/Party · 7 Map · 8 Settings

Tap opens that panel (modal/sheet or body swap). **Story remains default body.** Settings stays in grid (not a separate “Home” chrome).

### 2. Story body (chat)
| Role | Alignment | Chrome |
|------|-----------|--------|
| Player | Right | Bubble fill `#d4a054` text `#140f0c` **or** surface `#1e1814` + accent border; corner radius 16; max width ~78% |
| Narrator / DM | Left | Bubble `#1e1814` + border `#3a2f26`; text `#f2e8d5` |
| Still / “Show me” | Full-width card in stream | Existing `StillFrame` / stubs |
| Avatar | Left of narrator only | 28–32 circle; default glyph `assets/ui/avatar-narrator.png` (initials “DM” / diamond). Player avatar optional later from still stub player |

**Do not** port Base44 purple gradient / orange send. **Do not** carry NSFW prompt copy from prototype.

Scroll: newest near input; keyboard avoids covering composer.

### 3. Composer (fixed bottom)
| Element | Spec |
|--------|------|
| Attach (optional v1 stub) | Square 40, border accent, paperclip/upload glyph — can no-op or open still request |
| Field | Placeholder **“What do you do?”** · surface + border · text `#f2e8d5` |
| Send | Square 40, fill `#d4a054`, dark airplane glyph |

Secondary actions (New beat / Show me): compact ghost chips **above** composer or overflow menu — don’t steal primary send.

### 4. Empty / edge
- Empty party: subtitle “Solo • Level n”; Companions panel keeps existing empty plate.
- Stub narrator: same bubble chrome; no “broken” styling.
- Loading beat: muted italic bubble or shimmer plate.

## Tokens (reuse `theme.ts`)
`background` `#140f0c` · `surface` `#1e1814` · `accent` `#d4a054` · `text` `#f2e8d5` · `textMuted` `#a89880` · `border` `#3a2f26` · `danger` `#c45c4a`

## Out of scope this pass
Custom fonts · pack-tinted chrome overlay · real attachment pipeline · combat rules UI beyond sheet entry icon.

## Assets
See `assets/ui/icons/` + `ASSETS_UI.md`.
