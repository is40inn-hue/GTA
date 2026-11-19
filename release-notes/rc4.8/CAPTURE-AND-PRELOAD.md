# RC4.8 — real frame composition and first-visit audit

## What the code confirms

RC4.7's native capture copied the entire WebGL canvas. Any black cinematic bars already in that buffer were therefore exported into the JPEG. Separately, the old story compositor deliberately drew a large darkened backdrop and a smaller contained copy. Both paths could make the result look like a framed video.

The user's screenshot alone does not establish which renderer state produced its exact black bars. No native GPU session was executed in this audit. The change handles observable padding without changing native camera, rendering, missions or scores.

## Changes

- `dist/image-content-bounds.js`: shared, optional detection of obvious paired black padding, used by both capture and final composition. It samples at most 96 pixels on the long edge. Only fully near-black opaque opposite bands qualify; one-sided shadows, substantial asymmetry, soft dark gradients, transparent padding, low-light interiors and uniform frames stay unchanged. Removal is capped at 40% of either axis, with a visible-content/contrast check.
- `dist/native-vc/highlight-capture.js`: uses bounds from its already-existing small pixel probe and encodes the real source rectangle without stretching it. The long edge remains at most 960 pixels, the JPEG size bound is unchanged, and no extra native readback was added. Destruction credit still comes solely from the native mission packet. This does not invent fire or infer gameplay outcomes from colours.
- Final composition may call `GTAImageContentBounds.detect(image)` to handle old saved JPEGs with padding. Unavailable canvas readback or an absent optional helper leaves the full image intact.

No protocol metadata changes are needed: new JPEG dimensions describe the already-cropped pixels. The parent and native HTML must load the shared helper before their consumers.

## Verification

`node --test tests/rc48-image-bounds.test.cjs tests/native-highlight.test.cjs`

**19 tests passed, 0 failures.** Nine new tests cover real paired letterbox/pillarbox fixtures, near-black JPEG-like bands, fully dark and natural-looking shadows, asymmetry, excess borders, unreadable canvas fallback, bounded probe disposal and a native-confirmed explosion encoded from the cropped source. Ten retained tests cover scheduling, bounded capture, origin/ownership checks and unchanged native scoring. These are pixel/protocol fixtures, not a GPU visual test.

## Cold preload: read-only review

The RC4.7 preparation fixes remain intact:

1. After the cover's first paint (`app.js`, two animation frames), preparation is enabled without waiting for part C.
2. A/B input and media preparation defer the next request instead of discarding an active chunk. Paused/hidden/offline/data-saving states still yield.
3. Verified bytes use the same parent-owned asset service for byte preparation, hidden native initialization and foreground practice. Persistent-storage failure falls back to bounded session memory.
4. The temporary cover owner can transfer to the real attempt; part C adopts the same prepared runtime when available.
5. Native progress starts from retained bytes, then uses an indeterminate engine phase. Session bytes are released only after a successful foreground native frame, not during hidden preparation.

No new preload changes were made. The packaged RC4.7 report retained here records 69,804,226 bytes / 464 leaves, zero duplicate reads, and zero additional downloads during cache-only handoff. That was a local-file transport test with accelerated scheduling, not first-load timing on a phone. The package and preload logic are unchanged in this iteration.

A first visit still requires network throughput and enough active time. Low-memory devices without writable storage, data saving, 2G, background eviction and GPU availability can prevent a fully warm handoff. The loading screen remains necessary; a universal zero-wait promise would be inaccurate.
