# ЕГЭ GTA — 0.5.2 · Допуск к GTA VI

**Base:** RC4.9 / EGE 0.5.1. This ZIP is a complete prebuilt static website, including the original Vice City WASM runtime, all exams and practical scenes. It is *not* a Unity/Three.js mockup and does not replace the C game engine.

## What changed

1. **Real in-engine opening cutscene:** separate `native-vc/exam-intro.html` runs the *shipped* `vice-city-wasm` engine and an independently compiled `intro.scm`. The classroom is new low-poly RenderWare `egeclass.dff` with original desk props, chalkboard, six desks and an exam paper. A stock Vice City **WFYBU female pedestrian model 67** plays the examiner; its low-resolution suit texture is authored for this project, not downloaded from a third-party site.
2. **Game camera:** three in-engine cuts (wide room, teacher, ticket on the desk). The UI is subtitles and skip/progress only; it no longer uses the 0.5.1 SVG fake classroom and HTML paper stage.
3. **Graceful exit:** a visible Skip works even before downloading the engine. If the GPU/engine refuses to load, the player goes directly to part A; scores and save/resume are untouched.
4. **One narrative:** home UI and A/B checkpoints are reworded around official admission, C is the practical qualification, and the commission issues a final result.
5. **Result:** at 60/100 or more the screen and shareable PNG read **«ДОПУЩЕН К GTA VI»**; below 60 the card says **«НЕ ДОПУЩЕН»** and the app offers a retake. Example from the user's screenshot: 46/100 is a fail. The `profile.passes` metric now counts only successful exams, not all exam completions.
6. **Protected game:** `native-vc/range.scm`, `range-config.json`, all three C missions, question bank and the original scoring engine are unchanged.

## New native files

- `native-vc/exam-intro.html`, `exam-intro-native.js`, `intro-classroom-models.js`
- `native-vc/intro-assets/intro.scm`, `intro-contract.json`, `egeclass.dff`, `egeclass.txd`, `wfybu.txd`, `provenance.json`
- `release-notes/ege-052/scripts/build-native-intro.py`, `build-classroom.py` (source), `intro.listing.txt`
- `release-notes/ege-052/tests/native-classroom.test.cjs` (targeted asset/scene/verdict regression)

## Test status, 19 Nov 2026

- **8 / 8** new native classroom and result contract checks pass.
- **115 / 115** selected original score, exam flow, preload and interaction tests pass.
- Source JavaScript parses (`node --check` on modified and new scripts).
- Static matching and hash validation pass for all author-created DFF/TXD/SCM assets; original packed WFYBU `.dff` is present.
- **NOT YET VERIFIED:** a physical iPhone/GPU boot of the new classroom; no claim of real rendered frames or complete original 390-case regression. Headless localhost browser requests were denied by sandbox policy (`ERR_BLOCKED_BY_ADMINISTRATOR`), so the real engine must be reviewed in Safari or Telegram after deploy.
- The original 0.5.1 fake room SVG asset remains bundled for historical compatibility but is **not referenced by any 0.5.2 opening scene**.

## How to publish on Render

1. Unzip **full** `gta-ege-0.5.2-native-classroom-full.zip` (not the patch) and upload its **contents** to a dedicated GitHub repository (with `index.html` at root).
2. Render → New → Static Site → select that repository. Build command: `echo "Prebuilt"`, Publish directory: `.` (if `index.html` is at root).
3. Use a **separate Static Site**, rather than overwriting the existing Tam service while testing.
4. Load the site on an iPhone, tap `Сдать на допуск`, let the real game engine stream or hit `Пропустить`, and confirm the first A question. Then finish a 60+ and a <60 run to review verdict graphics.
5. First access streams a roughly 60+ MB bundled WASM/data/model package shared with the practical scenes; allow cache/network time. The native intro can always be skipped.

## Limitations / risk to test next

- The WebGL2 engine and its camera have not been checked on a physical iPhone; performance, actual teacher skin and room draw order need a live QA pass.
- The engine intro runs in its own iframe, so a brief engine restart before C can still occur; verified asset cache sharing reduces redownloading.
- No user answers, question bank and C score structures were migrated. Older saved exams resume without replaying the opening cinematic.
