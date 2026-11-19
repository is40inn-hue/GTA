# RC4.7 — first-visit preparation audit

## Defects found in RC4.6

1. The byte preloader required a readable **and writable** CacheStorage. A denied storage API, private-storage failure, quota failure or cache timeout made preparation unavailable. With no prior persisted bytes, part C then had to download its entire package.
2. Every pointerdown, keydown and media event aborted the current chunk. A reader who answered frequently on a slower connection could repeatedly discard the same incomplete download.
3. The constrained-device policy slept two seconds after every leaf. With the current 464 leaves this imposed 926 seconds of artificial gaps, independent of network transfer time.
4. The native foreground loader started its assembly progress at zero even when earlier work had already retained verified bytes. That made preparation look discarded during the handoff.

These are reproduced code paths, not a diagnosis taken from telemetry on the user's particular phone.

## Implemented

- The shared parent-owned asset service retains private, SHA-verified copies of leaves that persistent storage cannot save. Default bound: 80 MiB; known deviceMemory <= 2 GB: 16 MiB. It does not evict earlier prepared leaves to pretend progress. It stops background preparation when the bound is exhausted.
- `cachedStats().available` retains its meaning as persistent-storage availability. Session diagnostics are separate. `native-preload.preparedAvailable` becomes true only once every required leaf is retained.
- Cache-only warm assembly can read the same retained session leaves. It cannot turn a missing leaf into a competing background network request.
- Input and media buffering defer the next bounded request instead of aborting one already underway. Navigation outside A/B, hiding, offline, data saving and explicit cancellation still abort.
- Failed audio does not permanently block preparation.
- One request remains in flight at a time. Constrained yields scale by leaf size from 50 to 500 ms. For the checked manifest their total is 77.944 seconds instead of 926 seconds. This is a scheduler calculation, **not a measured loading time**. Default eager Safari-style yields total 23.15 seconds, plus transfer/hash/storage time.
- After all bytes are retained, a 3G connection alone no longer prevents cache-only city initialization. Data-saving, 2G and known low-memory restrictions remain.
- If persisted reads fail after some chunks were prepared, their now-unusable verification markers are removed and the remaining queue is reconciled. Only actually retained bytes are counted; missing leaves are fetched into the bounded session buffer.

## Integration API

The native iframe already selects `parent.GTANativeAssets` before loading. Reuse that service; do not create another asset instance for warm preparation.

`assets.preparedSnapshot(logicalFiles)` returns `{loadedBytes,totalBytes,files}` with logical keys matching `onBytes.path`. Seed the native loader's Map from `files` and merge subsequent values using `Math.max(previous,event.loaded)`. The UI should show a byte percentage only for that phase, followed by indeterminate engine/city phases.

Keep the session buffer through A/B and hidden warm initialization, so discarding a hidden iframe does not discard the only reusable bytes. Call `assets.releaseSession()` once only after foreground activation and a successful native frame, after all filesystem writes: for example after `readNative(true)` in `postMainLoop`, with `!warmup`, `launch.runtime` and stage `briefing` or `playing`. It clears the fallback leaf copies; it does not mutate the independent assembled data/wasm/model buffers. Do not release on the first read or at hidden warm filesystem initialization. Keeping up to ~70 MB until the visible handoff is the deliberate bounded-memory tradeoff when persistent storage is unavailable.

An optional `onState: () => updatePreload()` callback in the app's native-warm coordinator refreshes the UI label as the engine becomes ready; it only reads state.

## Verification

Focused automated suite: **78 tests, zero failures**. Tests cover denied storage, quota refusal, a cache read failure after initial successful writes, repeated input during a slow cold request, media gating, retained progress, bounded session storage, release, warm reuse and constrained scheduling.

Native integration and observation suite: **59 tests, zero failures** (`vice-port.test.cjs`, `rc47-prepared-handoff.test.cjs`, `rc46-street-observation.test.cjs`). The four new preparation contracts execute the production native bridge and verify the logical-byte seed, monotonic leaf assembly, indeterminate engine phase, retained RAM through hidden warm initialization/discard, and release exactly once after the first acknowledged foreground frame. The C1 two-choice question covers confirmation, changing selections, skip, visibility/pause, revisiting without duplicate credit, changed-result rejection, and preserved RC4.6 record compatibility. These are VM protocol tests, not native WASM/GPU execution. The two suites total **137 passing tests**, with logs in `qa-rc47-preload-focused.txt` and `qa-rc47-native-contracts.txt`.

`node scripts/check-first-load.cjs` additionally exercised the actual packaged manifest and bytes with persistent storage denied:

- 464 retained leaves, 69,804,226 verified bytes.
- 466 transport reads including two manifests, no duplicate reads, one request at a time.
- All 355 logical resources assembled and checked against their full SHA.
- No additional runtime download when the same service was used for cache-only C assembly.
- Session bytes returned to zero after release.

The report is `qa-rc47-first-load.json`. This test uses local-file transport and compressed scheduling delays. It is **not** a browser, real-network timing or GPU benchmark.

## Remaining limits

Known low-memory devices with unavailable persistent storage can retain only 16 MiB, which cannot cover the whole ~70 MB package. In that case preparation is partial and the explicit C loader must retrieve the remainder. Heavy background city startup also remains deferred on such a device.

The first visit still needs enough active A/B time and network throughput. Hidden/inactive pages, offline state, save-data and 2G can suspend automatic work. Browser process eviction can remove both the warm instance and session memory. A model/cache integrity failure must be recovered rather than labelled ready. No universal zero-wait promise is justified.

This audit does not confirm native GPU gameplay, iPhone Telegram performance, autonomous traffic, or actual first-load time on mobile internet.
