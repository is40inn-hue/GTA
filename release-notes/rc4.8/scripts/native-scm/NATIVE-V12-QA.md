# Native v12 QA, 2026-11-11
Local Chrome at 127.0.0.1:9033, native-vc edition9. No deploy.

Verified through actual visible gameplay:
- C1 driver model7 native CREATE_CHAR + WARP_CHAR_INTO_CAR. Button Enter triggered native walk, carjacking and sitting in Landstalker. HUD read hijacked/inCar.
- Holding upper part of touch joystick for 5s drove away and showed completion, both native milestones required. No JS teleport or synthetic scoring.
- C1 -> C2 prepared inside same loaded WASM session without file download.
- C2 at health350 (220 caused fire before shooting, corrected): 12 Uzi rounds spent, native vehicle explosion/wreck, completion shown with 28/40 ammo. Aiming at tires did not immediately destroy; adjusted aim to body.
- C3 logic retained from prior version, not replayed this QA.

Blocker: police spawning causes numeric WASM exception (56204136), after carjacking. Constructor0129 initially caused remainder-by-zero at driver creation; replaced with CREATE_CHAR + WARP. Police alternative still fails after hijack. Police disabled in main builder pending diagnosis; full failing variant saved as build-native-exam-police-pending.py. Do not represent police or iPhone as tested.

Fixed ammo-exhaustion fallthrough into C1. Preserved v8 legacy SCM/config, edition7 legacy. v3 result milestones nested. Added local male01/cop/police assets; parent chunked oversized police models.

Remaining: native police crash/data, driver texture generic appears pale, cozy location selection, real iPhone controls, C3 live regression, full outer exam scoring walkthrough. No release claim.
