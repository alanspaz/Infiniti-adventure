# PlayShell UI assets (Artist → Coder)

## Spec
`PLAYSHELL_VISUAL_SPEC.md` — Base44 layout, IA theme.

## Files
| Path | Use |
|------|-----|
| `icons/playshell-icons-2x4.png` | Reference sprite 2×4 (Character, Items, Dice, Combat, Quest, Companions, Map, Settings). Slice to 8 PNGs or use as design ref; prefer vector/`@expo/vector-icons` if sharper at 22–24pt. |
| `avatar-narrator.png` | Narrator/DM chat avatar (circle-crop in UI) |

## Icon plan (if slicing sprite)
Cell order row-major → `icon-character.png` … `icon-settings.png`.  
Target display ~22–24pt glyph in 40–44pt hit target.  
Active: accent tint; idle: `#a89880`.

## Optional follow-ups (not blocking)
- Gender-neutral Character / Companions silhouettes (hooded) if male-coded bust feels wrong for Solo.
- `icon-send.png` / `icon-attach.png` — or use system vectors.
- Pack-tint active state later.

## Wire notes
Replace `PlayTabBar` text pills with header icon grid. Story = chat bubbles + composer “What do you do?”. Drop Base44 purple/orange; no NSFW copy.
