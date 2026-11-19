# RC4.7 native scene review

## Changes and native contract

The first weapon is released once, three native world metres in front of the
player's **current** transform, using VC opcode04C4 from the bundled original
Sanny opcode inventory. A marker follows that actual pickup coordinate until
collection. It no longer remains at the original spawn after the player has
walked toward the landing.

Four actors start inside the helicopter: white-top VC extra, Steve, Pudge,
original club dancer. Native landing and native exit predicates precede their
run toward the current player position. The destination refreshes every700ms;
the approach lasts at least1.2s and at most4.8s. The existing3.2s unarmed scuffle
and4.5s dispersion remain bounded. A missing actor, blocked door or timed-out
flight releases a playable weapon/target fallback without creating a fake
exit. All four actors are cleaned on terminal transitions and retries.

The outsider question belongs to C1. Steve no longer also appears among C2's
three roadside walkers. Two oncoming cars and the continuous drive remain.
No grading, ammo allocation, target-credit contract or existing ABI slot0–192
was changed.

| Appended slot | Meaning |
| --- | --- |
| 193 | Fourth arrival actor handle |
| 194–196 | Release-time pickup world coordinates, float32 |
| 197 | Pudge exposed to the native camera near the player |
| 198 | Pudge continuous-exposure deadline |
| 199 | Steve exposed to the native camera near the player |
| 200 | Steve continuous-exposure deadline |
| 201 | Earliest end of the visible approach beat |
| 202 | Completed C1 Pudge observation |
| 203 | Completed C1 Steve observation |

Each guest flag requires a live, existing actor, out of the helicopter,
native on-screen predicate02CB and proximity within18×18×5 metres for600ms
continuously. Leaving those conditions resets that guest's pending timer.
Completed flags remain latched and are copied to record1 before completion;
record1 restoration copies them back. On-screen is the native predicate, not
an independent pixel-level occlusion guarantee. Both are required by the UI
before offering the unscored two-outsider question.

## Verification performed

**48 focused tests pass:**

- 26 native SCM interpreter cases: standard opcode argument semantics;
  bounded landing/exit/approach/fallback; four real vehicle occupants; cleanup;
  preserved grading; independent visibility windows; pickup ahead of two
  current player positions/headings; completed C1 fact persistence/restore.
- 3 cast asset/installer cases: actual bundled IDE/DIR, intact dancer and
  human geometry, append-only model files, idempotence and mutation-free reject.
- 4 static collision cases across arrival, road and street suites: actual
  shipped COL1/IPL geometry, available floors and sampled body clearances.
- 15 Pudge/Steve regression cases: model isolation and structure; original
  Pudge texture; corrected native shoulder sockets and native IFP pose samples.

```sh
node --test tests/rc2-native-contract.test.cjs tests/rc44-native-road.test.cjs tests/rc46-street-geometry.test.cjs tests/rc47-arrival-geometry.test.cjs tests/rc47-arrival-cast.test.cjs tests/rc46-pudge-shoulders.test.cjs tests/rc46-block-ped.test.cjs tests/rc44-pudge-model.test.cjs
```

`RC47-ARRIVAL-AUDIT.json` reports the initial pickup corridor and four sampled
approaches from around the settled helicopter. The initial pickup is about
15m from its centre. Collision sampling does not prove native exit animation,
dynamic avoidance or clearance for Pudge's wider silhouette.

The RC4.6 Pudge asset is unchanged. Its corrected shoulder-socket width is
0.6613m, versus0.4113m in the native template. Existing CPU samples of actual
idle/walk/run/fight animation channels preserve limb lengths and keep the
maximum duplicated-vertex seam gap below0.000005m. These checks do not certify
the native renderer, blending, IK or door animations.

## Build identity and limits

- `range.scm`:53,205 bytes; SHA256
  `fa84cbbc5a94d43f0a32c3e4dd02b349abecd5ee171721f157e95e95c68555ab`.
- `egecj.dff`:73,728 bytes; `egecj.txd`:18,432 bytes.
- Two new model leaves total90KiB, already registered in the verified manifest.
- No native GPU execution was performed by this worker. The VM and CPU renders
  establish code/asset properties, not an end-to-end first-device gameplay pass.
