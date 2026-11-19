# RC4.8: unified exam print

## Scope

Two additive style layers only:

- `dist/rc48-unified.css`, linked after `rc47-polish.css` on the main exam.
- `dist/native-vc/rc48-native.css`, linked after `rc47-native.css` on the native practice page.

The approved cover image, story PNG renderer, questions, scores, preload, game logic, safe-area variables and control anchors are unchanged by these files. Root integration must add the stylesheet links and the current release query string.

## Visual decisions

The existing cream paper, indigo blue, raspberry and warm gold now have one repeated button and frame system. The Russian exam reference comes from blush registration headers, fine answer cells, numbered square fields and a restrained printed stamp treatment; it does not add explanatory prose or another poster layer.

Main actions use a 2px dark border, a small hard print shadow, a 3px corner and a minimum height of 56px. Secondary actions use a quieter paper key with a minimum height of 50px. Selected answers do not change border width or geometry. Disabled actions have no shadow and a muted paper fill. Pressing an action changes its shadow and gives a small tactile offset. Keyboard focus remains visible.

## Selector checklist for visual QA

| Area | Selectors | Intended result |
| --- | --- | --- |
| Registration | `.final-pass`, `.text-input`, `.final-pass > .primary` | Existing cover remains whole; large clear start key; paper form belongs to the same book. |
| Saved work | `.resume-banner`, `.daily-banner`, their button/text | Paper/blush receipt, indigo accent and matching secondary key replace the legacy green banner. Launch errors retain a raspberry edge. |
| Header | `.topbar`, `.brand-mark`, `.top-actions` controls | Blush form area on exam, cream home header, registration cells, matching square keys. Existing header dimensions and safe areas retained. |
| A/B choices | `.question-card`, `.choice`, `.choice-letter`, `.choice-indicator` | Calm paper sheet; 60px choices (58px at ≤360px); square 32×34 number cells and 24px selection boxes. |
| Chronology | `.tap-order-card`, `.tap-order-number`, `.tap-order-undo` | Same answer cells and selection fill; undo has a 48px target; no row movement when selecting. |
| Audio | `.audio-console`, `.audio-toggle`, `.audio-restart` | Printed radio faceplate in the same palette, small corners and a framed gold play key. |
| Between parts | `.stage-intro-card`, `.checkpoint-clean`, `.stage-route` | Same paper border and shadow; serif checkpoint title recalls exam paperwork. No correctness or score added. |
| Accepted progress | Route/navigation `.done`, `.commission-steps li.done` | Indigo denotes accepted progress; final review correct/incorrect semantic colors remain unchanged. |
| Final | `.result-picture`, `.result-share-actions`, `.result-review` | Single exported image remains canonical; gold share CTA, quieter save key, paper review drawer. Long-press image saving is not disabled. |
| Practice handoff | `.native-paper`, `.loading-form-head`, `.loading-stages` | Matching form paper, cells, 56px CTA; truthful progress remains owned by JS. |
| C HUD | `.mission-identity`, `.mission-route`, `.native-icon-button` | Existing compact plaque and top offsets, clearer ink rules, no new overlay. |
| C controls | `.range-controls button`, `.drive-actions button`, `#drive-enter` | Same printed keys; existing joystick, raised baseline and pedal dimensions retained. Exit hold target raised from 44 to 48px. |
| Observation | `.street-answers`, `.arrival-check`, `#arrival-confirm` | Answers 56px (48px on short viewports), square 24px checkboxes, selected paper-blue fill, 56px submit (50/48px short/landscape). |

## Verification boundary

These are CSS changes; no unit tests mirroring selectors were added. Parent-owned browser QA should inspect widths 320/390/430 and a short landscape frame, including a selected and disabled state, keyboard focus, an observation question and driving controls. CSS does not claim to verify native GPU rendering or real-device Telegram overlays.
