# RC4.3 — native street scene and courier drive

## What changed

- C1 starts in the same prepared Vice City scene. A parked yellow Taxi 150, one pedestrian hailing it, a passing witness, and the existing short-lived aggressor give the Uzi pickup street context. The aggressor still requires the actual pickup and player proximity. Both witnesses react only to native weapon damage and health loss on the target.
- C2 follows five physical zones: `(272, -1190)` → `(263, -1285)` → courier stop `(233, -1375)` → `(263, -1285)` → drop-off `(263, -1270)`. Both directions go to the right of the existing ramp. The polyline is approximately 391 m; 35–50 seconds is a design target, not a measured mobile playthrough.
- At the courier stop, the player must be the actual native driver of the mission Landstalker. The native vehicle must remain stopped in the marked zone for 900 ms before `SET_CHAR_OBJ_ENTER_CAR_AS_PASSENGER` is issued. The courier must actually be observed inside this car. A task request alone never completes pickup or awards points.
- Exiting before pickup or driving away cancels the pending stationary interval. A blocked entry task is retried after 6.5 seconds. After two blocked attempts, or for a missing/dead actor, a protected courier is recreated on foot at the opposite curb. No operation warps the courier into the vehicle. Leaving the courier behind sends the route back to the pickup stage.
- C2 now has a 150-second native deadline. C3 keeps its 90 seconds, six rockets, existing pickup and target positions, real damage/destruction requirements, and sequential live target marker.
- Native HUD copy follows route, stop and passenger state. Exam-mode C3 completion text is identical for success and failure; the parent commission remains the first score/result reveal. Standalone practice still gives its final C rating after scene 3.

## Scope and compatibility

- Scores remain **12 + 10 + 14 = 36**. C2 remains **5 for hijacking + 5 for completing the entire courier route**.
- The protocol remains version 3; slots 0–163 and all immutable terminal records are preserved. New read-only story fields occupy slots 164–172. JS writes only the existing mailbox.
- No added blocking `WAIT`, cutscene, iframe, engine, network asset, or input button. C1 warm preparation and immediate activation preserve the existing handoff.
- Taxi DFF/TXD were already embedded in the verified base `index.data`; male01, Landstalker, Uzi, Police and Maverick assets were already shipped. No phantom model or external dependency was introduced.
- Legacy SCM editions and native WASM binary were not modified.

## Verified in this workspace

Command:

```sh
node --test tests/rc2-native-contract.test.cjs tests/vice-sequence-contract.test.cjs tests/vice-port.test.cjs
```

Result: **64 tests passed, 0 failed.** This includes emitted-bytecode traces for zone order, wrong seat, movement, stop cancellation, real passenger observation, return trip, recovery, timeout, no fake points, ABI/score preservation, model availability, neutral final copy, and prior warm-runtime handoff/input controls.

Structural decoder: **1,473 instructions, 290 valid branches**, total **47,534 bytes**.

SCM SHA-256:

```text
6e6533c08b02a9bb3d46194283c2c5d0e66418ad61eb1cf10af22ebf56286cdf
```

`native.js` syntax and Python builder compilation also passed. The packaged SCM and generated SCM are identical and match both contracts.

## Remaining native-device check

These tests execute contract logic with explicit native-query fixtures. They **do not execute WASM, render Vice City, or simulate real native physics**. A real WebGL2-capable device must still verify passenger-door accessibility and boarding animation, exact road/ramp clearance, camera composition, touch-driving feel, and measured duration. The package retains honest `runtimeExecuted: false` metadata.
