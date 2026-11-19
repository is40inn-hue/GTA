# RC4.7 — one helicopter, four arrivals

This package uses the project's existing Vice City engine and RenderWare assets.
It adds one separate human extra and mounts an already bundled club dancer.
Original Tommy, ordinary pedestrians, vehicles, Pudge and Steve are preserved.

| Native slot | Actor | Origin |
| --- | --- | --- |
| 108 | White-top, blue-jeans extra | The bundled male01 mesh, original skin and skeleton; project-authored 128×128 colour atlas |
| 107 | Steve | The existing RC4.6 six-part native block pedestrian |
| 8 | Pudge | The existing RC4.6 conversion with corrected shoulder sockets |
| 109 | Club dancer | Original bundled stripa DFF/TXD, unchanged; assigned to unused special01 |

The first actor is a CJ-like nod in a white top, not an original San Andreas
model. The native mesh retains its original shirt geometry. In a quiz option,
“Парень в белом” describes the actual asset more precisely than “Си-Джей”.

Only egecj.dff and egecj.txd are additional downloads: **92,160 bytes** together.
The original stripa files are already in the data chunks. No new engine,
asset pack or remote fetch outside the project's manifest is introduced.

## Build and install

```sh
python scripts/arrival-cast/build-arrival-cast.py --install
```

Load `arrival-cast-models.js` before `native.js`. After verified files are
mounted in Emscripten FS, call `GTAExamArrivalCast.install(FS)` after the Pudge
and Steve installers. The installer validates file types, sizes, directory
capacity and both native slots before editing either IDE or DIR. It is
idempotent. The model manifest now contains 96 entries.

The helicopter has one pilot and three passengers. SCM uses pilot slot 0 of
the cast for model108, then passenger seats0,1,2 for Steve, Pudge and stripa.
No actor is created outside the helicopter as a substitute for an exit.

## Verification

- The actual bundled IDE and DIR pass mounting and repeated mounting.
- Original actor definitions, original directory entries and dancer bytes are
  unchanged; collisions and incomplete files fail before writes.
- The new extra preserves all 941 original vertices,970 triangles, skin
  indices, weights and semantic inverse transforms. Only material/UVs change;
  unused RenderWare matrix padding is normalized by the established writer.
- `output/CPU-cast-inspection.png` is a Blender CPU inspection of these meshes
  with a synthetic neutral arm pose. It is **not** a Vice City screenshot or
  proof of native animation, door geometry, lighting or GPU behaviour.
- `output/model-report.json` and the runtime provenance contain file hashes
  and exact source bytes. No original San Andreas model was available among
  the checked bundled assets.

Run the focused asset check:

```sh
node --test tests/rc47-arrival-cast.test.cjs
```
