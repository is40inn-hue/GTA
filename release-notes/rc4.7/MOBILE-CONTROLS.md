# RC4.4 — Telegram header and held controls

## Observed issue

The supplied iPhone screenshots show the exam's home/sound/help buttons on the same row as Telegram's native Back / menu capsules. The third screenshot shows iOS selecting the nested «Тормоз» label and opening Copy / Find / Translate.

## Implemented

- `telegram-layout.js` keeps the **device safe inset** and **Telegram content safe inset** separately. CSS uses `max(browser env inset, Telegram device inset) + Telegram content inset`, once. The old `max(system, content)` dropped the extra toolbar row.
- On mobile Telegram only, a fullscreen transition with a temporarily missing content-top value reserves one 48 px row. The real content inset replaces it; desktop and non-fullscreen do not receive that fallback.
- Safe/content/fullscreen/viewport/activated, browser resize/orientation, visual viewport resize and BFCache restore all update the same controller. Reconnecting the same SDK does not double-bind events. The fullscreen button follows the actual state.
- Main exam and both standalone practice scripts use the controller; direct native entry attaches it only when it owns the Telegram SDK. An embedded native scene still has zero top/side safe insets because its parent has already reserved them. Existing control lift and touch target dimensions are unchanged.
- Main controls and the native iframe explicitly disable `-webkit-user-select`, `user-select`, `-webkit-touch-callout`, including nested button labels.
- The common gesture guard suppresses `selectstart`, `contextmenu`, and `dragstart` on app/game chrome. It does not register touch, pointer or click handlers and does not intercept document scrolling.
- Name editing, editable fields, final PNG, final answer review and diagnostic copy are exceptions. The result image retains native long-press saving; existing Save / Share actions are unchanged.

## Integration

Root adds `telegram-layout.js` before the application scripts in main, `/rpg.html`, `/rpg/index.html`, and before `native-gestures.js` in `/native-vc/index.html`. Both `/rpg` hosts also load existing `game-gestures.js`.

Changed source files owned by this task:

- `dist/telegram-layout.js` (new)
- `dist/game-gestures.js`
- `dist/native-vc/native-gestures.js`
- `dist/styles.css`
- `dist/v3.css`
- `dist/native-vc/native.css`
- `dist/app.js`: only `updateInsets` / `initTelegram` section
- `dist/vice-playtest.js`: only insets / Telegram connection
- `dist/rpg-playtest.js`: only insets / Telegram connection
- `tests/rc44-mobile-guards.test.cjs` (new)

## Verification

- 7/7 new behavioral tests: layered offsets, missing-inset transition, rotation/side insets, event ownership and restoration, nested-label event guards, editing/image save exceptions, preservation of Telegram swipe ownership.
- 55/55 existing application flow / final image / storage conflict / tap chronology / boot recovery tests passed after these changes.
- These are JavaScript policy and lifecycle tests. They do **not** claim a native iOS long-press run or actual Telegram chrome rendering. Root performs browser geometry QA; final confirmation of the native menu is on the phone.

Expected geometry fixtures: iOS top 59 + content top 48 => 107 px; transient fullscreen content top 0 => 107 px using the one-row fallback; ordinary non-fullscreen zeros => 0 px; landscape left 59 / top 0 + content top 32 => left 59 / top 32.

## Primary API reference

Telegram Mini Apps documentation, checked 17 November 2026: https://core.telegram.org/bots/webapps#safeareainset and https://core.telegram.org/bots/webapps#contentsafeareainset. It distinguishes system-defined insets from the content area protected from Telegram controls and documents the corresponding change events. Combining the two layers is this application's layout decision based on those separate areas and the supplied phone screenshots.
