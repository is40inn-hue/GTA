# RC2: layout and Vice accents

## Reference and dimensions

Reviewed the supplied 942 px wide Telegram screenshot and the illustrated Vice sunset reference. A 240 px move in that screenshot is approximately `240 × 390 / 942 = 99.4` CSS px for a 390 px phone viewport.

The portrait touch zone therefore moves upward by **up to 100 CSS px**, not 240 CSS px. Both the right action buttons and the left joystick share the same bottom coordinate. The contextual instruction follows above that zone.

- Normal portrait: `--control-lift: clamp(64px, 14vh, 100px)`.
- Viewports below 580 px tall: `clamp(28px, 8vh, 46px)`.
- Landscape below 520 px tall: `clamp(6px, 4vh, 20px)`.
- Controls remain at least **44 × 44 CSS px**. The joystick remains larger than that target.
- Landscape uses a compact two-column instrument group and puts the instruction between the two thumb zones. The parent game shell is allowed to use the available horizontal width.

The raised control baseline is `max(edge, bottom safe area) + lift`; this preserves the previous bottom safety inset and adds the requested lift once.

## HUD top gap

The former final rule in `native.css` applied `env(safe-area-inset-top)` to the HUD even while the parent exam frame already handled the Telegram top inset. The screenshot's approximately 49 CSS px top offset versus approximately 12 CSS px left offset is consistent with that duplicate inset. No extra canvas positioning was found in `native.js`; `app.js::positionNative` fits the persistent iframe to its visible anchor.

RC2 gives the HUD one `--native-edge` (12 px, 8 px on shorter screens). For embedded scenes the top and side safe areas are zeroed, because the parent owns them. The bottom safe area remains active: the parent does not reserve it during normal gameplay.

Integration contract in `native.js`:

```js
document.body.dataset.embedded = String(parent !== window);
```

`body[data-exam="true"]` is also supported as a fallback. A top-level standalone native page retains its own safe areas. This avoids masking a real notch in standalone mode.

## Visual direction

Russian exam paper remains the primary style: cream surfaces, rectangular outlines, clear labels, numbered cells, conventional typography. Vice appears through the palette, a three-pixel sunset rule, and a small original palm stamp. No neon glow, new imagery over evidence, or flag illustration is added.

| Token | Value |
| --- | --- |
| Cream | `#f5efdf` |
| Paper | `#fffaf0` |
| Ink | `#252638` |
| Indigo | `#344887` |
| Dark indigo | `#28345f` |
| Raspberry | `#b52c52` |
| Dark raspberry | `#922140` |
| Warm gold | `#d8b676` |
| Form paper | `#f1dfd2` |
| Border | `#c6b99f` |
| Sunset rule | `#344887 → #b52c52 → #e0ae7b` |

The SVG palm is decorative and original. It is applied as a small CSS background on the workbook series line and the native loading route. It does not replace any gameplay screenshot.

## Visual ordering question

`ol.order-list.order-visual` supports five logo cards. Each row contains a position, a contained logo, a readable label and two 44 × 44 px buttons. The regular thumbnail is 56 × 40 px; below 360 px it becomes 44 × 38 px. Aspect ratio is preserved with `object-fit: contain`; game logos are not cropped.

## Files and integration

- `dist/native-vc/native.css`: HUD positioning, touch zone, responsive geometry and native palette.
- `dist/vice-accent.css`: final theme layer for the exam and playtest. Load after the existing stylesheets.
- `dist/assets/vice-palm.svg`: shared decorative stamp.

`index.html`, `rpg/index.html`, `app.js`, `native.js` and `story-card.js` are owned by the parent agent and were not edited in this subtask. Canvas-rendered story cards need the same palette applied in their renderer; CSS cannot recolour exported raster pixels.

## Verification boundaries

Both references were inspected. Changes are based on the actual RC1 selectors and DOM. CSS syntax and local SVG validity can be checked without starting the full native runtime; final placement inside Telegram and actual landscape device behaviour still require the parent's browser/device pass.
