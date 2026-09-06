# UI-01 Hybrid chrome (Artist → Coder)

**Locks:** `#140f0c` / `#d4a054` · no NSFW · portrait · panels = views of one CampaignState (Coder CS-01/02).

Base44 **visual language** only — not purple/orange skin.

## Layout targets (from Base44 study)

1. **Story** stays center: chat bubbles + composer.
2. **Header** icon grid (already shipped).
3. **Side-panel chrome:** when a module opens (Character / Items / …), use a sheet or right-hand card:
   - surface `#1e1814`, border `#3a2f26`, radius 12–16
   - title in accent, close/back control
   - no separate data fetch styling — same tokens as Story
4. **Combat rail** (always-available strip or Combat panel footer):
   - HP / AC readout (engine-derived; Coder wires)
   - Action chips: Attack · Defend · Dodge · Cast · Use Item
   - Icons: `assets/icons/{attack,defend,dodge,cast,use-item}.png` (64)
   - Idle: muted gold stroke on surface; pressed: accent fill + dark glyph
   - v1: can be **layout-only** (no combat resolution) until rules exist — still looks Base44

## Assets ready on box

| File | Use |
|------|-----|
| `icons/attack.png` | Combat rail |
| `icons/defend.png` | Combat rail |
| `icons/dodge.png` | Combat rail |
| `icons/cast.png` | Combat rail |
| `icons/use-item.png` | Combat rail |
| Header 8 + `dm-avatar.png` | Already on main |

## Non-goals
Purple theme · NSFW · new pack art · real spell VFX.
