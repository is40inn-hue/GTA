# RC4.6 — native arrivals and street encounters

This patch runs in the existing Vice City WASM through emitted native SCM.
The tests below validate bytecode control flow with explicit native-query
fixtures, plus shipped district collision geometry. They do not execute native
GPU gameplay, helicopter doors, character animation or autonomous driving.

## Arrival

After the original helicopter reaches road height and all three real occupants
have actually left their seats, each receives `SET_CHAR_OBJ_RUN_TO_COORD` toward
the player's observed coordinates. The destination updates at most once every
700 ms, so the crew follows a player who moves away. The running window is capped
at 4.8 seconds; a native proximity check can end it once Pudge reaches four metres.

The short mutual brawl, Uzi pickup, dispersion and guarded failure path remain.
No teleport relocates the crew or player. Retargeting never extends the deadline,
awards a target, resets ammunition or changes an immutable score record.
Hidden prepare holds the helicopter and crew; only the native start command
launches the landing and encounter.

## C2 street

- Two extra cars, a Landstalker and a taxi, are separate from exam target handles.
- They settle on the real road before being held for the briefing. The first
  begins its northbound native AI drive after the player really takes the
  designated driver's seat; the second begins after the first route gate.
- Cruise values are 6.5 and 7.5, with native cautious driving style 0 and
  `CAR_GOTO_COORDINATES_ACCURATE`. No population multiplier is raised.
- After 45 seconds an offscreen car and its driver are removed. A visible car
  stays until it leaves the camera or the scene finishes, avoiding visible pop-out.
- Three pedestrians walk on the eastern pavement: the original male01 (7),
  the separate cubic cameo egesteve (107), and the original officer model (1).
  HFYST model 9, player and all ordinary game models remain untouched.
- Every added car, driver and pedestrian is cleaned at scene terminal and on
  a new scene prepare. No actor spawns repeatedly while a gate is occupied.

The native driving score remains carjack 5 + route 5. The original five gates,
150-second limit and 412.87-metre one-direction route are preserved.

## Observation contract

`cameoSeen` is an unscored native observation. It becomes 1 only while the player
is the actual driver of the designated car, with the cameo alive, onscreen in
the native camera and within a 3D 18×18×5-metre radius for over 600 continuous ms.
Interrupted visibility resets the exposure window. A single glimpse or spawn
alone does not create the observation.

The complete C2 packet retains `cameoSeen`. It is also copied to the appended
`record2_cameoSeen` field so restoring the completed native scene restores the
same observation without spawning anything. A newly prepared scene resets only
the current observation, after the JS owner has had the terminal packet.

Original slots 0–176 and all native score record layouts remain unchanged.
New fields append at slots 177–192, with `cameoSeen` at 190 and its stored record
at 192. Protocol v3, native edition 10, scoring 12+10+14 and ammunition are intact.

## Verification

`tests/rc2-native-contract.test.cjs` now has 24 passing emitted-SCM tests.
The new cases exercise moving-player run retargeting, bounded blocked movement,
warmup dormancy, native driver gating, two one-time traffic starts, offscreen-only
retirement, continuous visible cameo exposure, cleanup and immutable restoration.
The pre-existing score/protocol hash and old ABI assertions still pass.

`check-rc46-street.py` reads the actual packaged Ocean Drive COL1/IPL collision:

- 430 conservative car-body volumes along the two incoming corridors.
- 106 pedestrian-body volumes along the three pavement paths.
- No missing ground and no static body obstruction in those samples.

The report is `RC46-STREET-AUDIT.json`. Native AI follows road nodes and can deviate
from the straight connector that this audit checks; dynamic traffic and visual
visibility still require a real-device pass.

Installed SCM: **51,796 bytes**, **1,988 instructions**, SHA-256
`16ec9a2813cd7b349ce9d17f0a428e5c85822b49157413954260135817f3adae`.
