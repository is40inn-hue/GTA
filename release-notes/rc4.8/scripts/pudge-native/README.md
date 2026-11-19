# Pudge native cameo · RC4.6

The project now has a dedicated **Vice City native ped in slot 8**, named
`egepudge`. The player, `male01`, police, existing runtime binary and ordinary
city models remain unchanged. This is a fresh conversion of the project's
inspected GLB, not a recovered pre-existing DFF export.

## Rebuild

Python 3, NumPy and Pillow are required only for authoring, not for playing:

```bash
python3 scripts/pudge-native/build-pudge-native.py --install
python3 scripts/pudge-native/validate-pudge-native.py
python3 scripts/pudge-native/native-pose-validation.py
node --test tests/rc44-pudge-model.test.cjs tests/rc46-pudge-shoulders.test.cjs
```

The source GLB is bundled in `source/pudge-candidate.glb`. The native skeleton
template is the existing `dist/native-vc/runtime/remote/models/gta3.img/male01.dff`.
Rebuilding does not access the internet. `--install` writes both assets and
updates their existing manifest records. The converter output is deterministic.

## Geometry and shoulders

All **9 character meshes, 3,895 vertices and 5,266 triangles** are retained.
The previous GLB preparation had already removed the unskinned display pedestal.
No character mesh is removed in this release. The hook and cleaver are cosmetic
parts of the source model; SCM does not grant a firearm or scoring event for them.

The converter first bakes the source's authored skin pose, including inverse-bind
matrices. It maps 58 source joints to the original **24 Vice City HAnim channels**.
Both clavicles and upper arms have explicit side-correct anchors. Limb lengths
are fitted along their axes to the native skeleton; thick body/limb cross
sections remain. Fingers and toe endpoints inherit their parent orientation.
All native frame names, hierarchy indices, rest orientations and atomic plugins
are retained. RC4.6 corrects the remaining mismatch between Pudge's broad body
and the male01 template's narrow shoulder sockets: the two upper-arm sockets
move 0.125 units outward and 0.060 down. Their total width becomes 0.6613 units,
instead of 0.4113. Every forearm/hand segment keeps its original length.

This correction updates the actual frame translations and all inverse-bind
matrices together. Merely moving the visible shoulder vertices would leave
the native animation pivot inside the thick torso. Only the two local upper-arm
translations change; no other local frame position is altered. The input
male01 DFF is untouched.

The authoring validator reads the game's **shipped `ped.ifp`** from the existing
data chunks. All 231 right upper-arm channels and 228 left upper-arm channels
are `KR00` (rotation only), so they do not overwrite the fitted socket
translations. Two clips contain translated clavicle channels; the clavicle
translations are not changed by this repair.

Seven diffuse textures become one 1024 × 512 PAL8 atlas with padded tiles.
The body stands at the native pedestrian foot height. The native bind-pose
height including the raised cosmetic hook is about 2.48 units; the head/body
without held props is about 1.96 units. No second renderer is added to the app.

## Loading and installation

`pudge-model.js` is loaded before `native.js`. For the current native sequence,
`GTAExamPudge.install(FS)` runs after the existing model payload has been written
and before native main. It validates availability of DFF/TXD, adds the single
ped definition and adds IMG directory entries with correct sector capacity.
It rejects an occupied slot instead of overwriting another model. Reinstalling
the same definitions is idempotent.

The two assets total **839,680 bytes**. TXD is split into 512 KiB and 2 KiB leaves;
DFF is one 313,344-byte leaf. They are part of the existing manifest and verified
background preload, not requested upon activation of C. Every leaf is within
the 512 KiB budget. There are no new cross-origin requests.

## Verification and limits

Ten Node tests cover the real installer, preserving unrelated records,
idempotence, occupied-slot failures, incomplete assets, offset typed-array inputs,
native geometry/weights and preloaded chunk integrity. The Python check decodes
the exported DFF and checks all 24 inverse-bind matrices, reconstructed vertices,
left/right anchors and skin weights. The additional animation validator samples
20 poses from `IDLE_stance`, `WALK_civi`, `run_civi` and `FIGHTIDLE`; 1,007
coincident UV-vertex pairs remain joined, with a largest sampled gap below
0.000005 units. Arm segment lengths, unchanged animation axes and unchanged
texture bytes are also checked. An independent unmodified DragonFF parser
also read the DFF and TXD successfully; its result is in
`output/independent-validation.json`.

`output/CPU-geometry-inspection.png` was rendered with Blender/Cycles on CPU.
Its two panels show a bind pose and a deliberately synthetic arm pose.
`output/CPU-shoulder-before-after.png` compares RC4.5 and RC4.6 using sampled
idle/run rotation channels from the bundled IFP. Root movement is normalized;
these previews do not reproduce engine blends or IK. They are **not in-game
screenshots** and do not establish native runtime success.
Actual Vice City playback, helicopter passenger exits, collisions, clipping,
combat animation and mobile frame rate still require game/device verification.

Optional CPU-only reproduction:

```bash
blender -b -t 4 --python scripts/pudge-native/render-pudge-check.py
blender -b -t 4 --python scripts/pudge-native/render-shoulder-comparison.py
```

## Source and attribution

Original model: **Pudge by muddyriversoff**.
Source recorded by the uploaded GLB:
https://sketchfab.com/3d-models/pudge-8dbdff217f074b8ba13e1473c113bdfd

License recorded by that asset: **CC BY 4.0**,
https://creativecommons.org/licenses/by/4.0/ .
The earlier project preparation reduced diffuse textures and omitted normal
maps/display pedestal. This release changes the pose/rig mapping, atlas,
texture resolution/palette and file format as described above. Attribution is
also included in `runtime/pudge-model-provenance.json`.

The existing GTA native skeleton template retains its original project
provenance in `runtime/human-models-provenance.json`.

Format references used for independent validation:

- https://github.com/Parik27/DragonFF/blob/master/gtaLib/dff.py
- https://github.com/Parik27/DragonFF/blob/master/gtaLib/txd.py
- https://github.com/aap/librw/blob/master/src/skin.cpp
- https://github.com/aap/librw/blob/master/src/d3d/d3d8.cpp

Those tools are not runtime dependencies. The project's converter is a small
standalone writer using the known-working native skeleton as a template.
