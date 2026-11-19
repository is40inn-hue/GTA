# Native block pedestrian — RC4.6

The project-authored low-poly model adapts the supplied character reference to the
existing Vice City runtime. It is an actual `DFF`/`TXD` ped with the existing
24-bone HAnim hierarchy, not a JavaScript billboard.

- Dedicated free slot: **107**, name **egesteve**.
- Slot **9 is occupied by HFYST** in the actual packaged `default.ide` and is
  deliberately preserved. Slot 8 remains Pudge.
- 6 rigid cubes, 144 face-split vertices, 72 triangles, one material.
- One 128 × 128 nearest-filtered, project-authored pixel atlas.
- Sector-padded DFF 14,336 B; TXD 18,432 B; **32 KiB total**.
- Arms and legs use one bone per cuboid to keep the block silhouette during the
  existing walk/run cycle. The CPU bind transform check is below 0.00000005.

## Rebuild

Run `python3 scripts/block-ped/build-block-ped.py` from the project checkout.
It reads only the shipped male01 skeleton and the verified original data chunk
containing `default.ide`. It writes its own `output/` directory. The reference
PNG is not modified, copied into the texture, or needed to recreate geometry.

Only the integration owner should run
`python3 scripts/block-ped/build-block-ped.py --install` **after the Pudge build
has finished**. This adds the two files to the ordinary manifest preload and
writes `runtime/block-ped-provenance.json`. It does not change the bundled game
data, native binary, scene script, player, or other original ped assets.

Include `block-ped-model.js` with the other native preload scripts and call
`GTAExamBlockPed.install(FS)` after verified model assets are in native FS, before
starting the engine. The installer appends the two IMG directory entries and the
slot 107 row in the in-memory IDE. It checks both changes before either write,
rejects occupied slots, and can be called again safely.

## Visual inspection

`blender -b -t 2 --python scripts/block-ped/render-block-ped.py` renders a neutral
portrait to `output/steve-choice.png` (transparent 480 × 640) and a neutral/stride
comparison to `output/CPU-pose-check.png`. These are CPU illustrations of the
actual geometry and atlas, **not gameplay screenshots or native GPU evidence**.

The browser runtime still requires an actual phone/WebGL2 playthrough to confirm
native animation and placement on the street.
