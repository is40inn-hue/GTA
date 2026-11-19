# RC4.4 — native scene changes and verification

## Scope

The scenes still execute in the supplied Vice City runtime through native SCM.
No JavaScript or canvas substitute moves actors, lands helicopters or awards hits.
This report records bytecode, VM and packaged collision checks; it is **not a native GPU playtest**.

## Player-facing sequence

- **C1:** The real Maverick starts above the road. The native START command begins
  its descent; hidden preload holds it still. Two humans and the separately installed
  Pudge model occupy real vehicle seats. After native landing and actual passenger exit,
  they run toward foreground positions and fight briefly. The Uzi appears when the
  scuffle begins, then the crew disperses. No score comes from the vignette.
- **C2:** The courier is removed. The designated car follows five sequential zones
  south along Ocean Drive, ending at the RPG location. The waypoint connectors total
  **412.87 metres**. The player must really drive the car through each zone; there is
  no passenger, braking or stopping requirement. The limit remains 150 seconds.
- **C3:** The RPG sits two metres ahead of the arrival position. One red marker identifies
  the next uncredited target. Two cars and the airborne helicopter keep the existing
  native RPG damage/health/destruction checks and six-rocket budget.

The arrival uses native game-clock deadlines: 8 seconds for landing, 6 for the doors,
1.8 for the foreground walk, 3.2 for the scuffle and 4.5 for dispersal. These run during
play, not before C opens. Failed flight/exit tasks release the Uzi and stop the surviving
target in its actual position. An invalid or destroyed helicopter before the weapon is
released ends that scene honestly, without waiting for an impossible target. A valid Uzi
explosion during the scuffle still goes through the normal scoring path.

## Compatibility and integration

- ABI v3 / native content edition 10 remain unchanged. Slots 0–172 retain their layout;
  four arrival-state fields are appended at slots 173–176. Old courier fields are reserved
  and stay empty.
- Scoring remains C1 **12**, C2 **10**, C3 **14**. C1 has 40 Uzi rounds; C3 has 6 rockets.
- The same warmed engine/iframe is retained. Prepare does not launch the arrival action.
  Existing neutral feedback in the embedded exam is preserved until the final commission.
- `GTAExamPudge.install(FS)` runs after model bytes and district installation, before
  `main.scm`. Missing helper fails explicitly instead of waiting forever for model 8.
- Native launch diagnostics identify **build 17**. The full application release is RC4.4.

## Static roadway audit

`check-rc44-road.py` reads the actual packaged `oceandrv.col` and `oceandrv.ipl`.
It checks 305 route/scene floor samples, then overlaps a conservative **2.4 × 5 metre**
car body with all district collision mesh/box faces and spheres at **0.5 metre** intervals.
The body spans **0.2–2.4 metres above the road**. Result: **833 car volumes, no missing
floor and no static body collision** against 7,297 transformed triangles/box faces.

The original audit used the wrong IPL quaternion direction. This placed a 1.17 metre
Colony Hotel step across the road. The corrected conjugate rotation matches the native
FileLoader's negative axis-angle and DragonFF's negative `rotW`. The step is included
in the complete obstacle audit, at x177.16–187.60 on the western pavement. An independent
agent's clipped-geometry calculation put its nearest surface 16.69 metres from the last
waypoint connector. No route relocation was required.

Rotation references:

- [Native FileLoader source](https://git.shihaam.dev/archivemirrors/re3/src/commit/50f0c7a1dcad33ac3d38d6e37faca3d16d222aaa/src/core/FileLoader.cpp)
- [DragonFF map importer](https://github.com/Parik27/DragonFF/blob/master/ops/map_importer.py)

The JSON evidence is saved beside this report in `RC44-ROAD-AUDIT.json`.
This checks the intended waypoint corridor in the packaged district. It does not simulate
suspension, off-route steering, native AI, traffic or additional scripted props.

## Verification

Command run:

```sh
node --test tests/rc2-native-contract.test.cjs tests/vice-port.test.cjs tests/rc44-native-road.test.cjs
```

**65 passed, 0 failed**: 17 SCM/ABI tests, 46 startup/bridge/asset/input VM tests, 2 roadway
tests. The startup VM executes the actual human/Pudge installers with initial IDE and
directory bytes from the real package; it does not execute WASM or render the model.

The SCM tests supply independent native observations for landing, vehicle exit, damage,
health and driver/zone state. Issuing a task alone never counts as completing it. They
cover blocked landing, blocked doors, missing crew, invalid target, early valid target
destruction, immutable completed scores, absent courier, sequential driving gates and
one-target RPG guidance.

Final generated SCM:

- File length: **48,065 bytes**
- Instruction count: **1,546**
- SHA-256: `0399988ed5f9420ce88770cea8c02e0ed3c8a78632bad17fe81a02c6755daa39`

## Remaining device checks

Native WebGL/physics were unavailable in this agent's environment. Real-device verification
is still required for helicopter touchdown/door animation, foreground visibility, Pudge
skinning and the feel of steering on the longer route. Static geometry and SCM/VM checks
do not prove those visual or physical outcomes.
