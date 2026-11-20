# M4 — Player controller: accepted

Date: 2026-11-20. **M4 acceptance passed. M5 has not started.**

## What was built

| Item                  | Implementation                                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Physics               | Rapier (`@dimforge/rapier3d-compat` 0.21) world built from the M3 static colliders: a ground slab, side-wall triangle meshes for each building footprint, boxes for wall segments, and closed barriers across the gate openings. `src/systems/physics.ts`                 |
| Kinematic capsule     | `PlayerController`: radius 0.3 m, 1.75 m tall, eye height 1.65 m (GAMEPLAY_SPEC §3). Uses Rapier's character controller, which sweeps the capsule shape so it cannot tunnel. Walk 1.6 m/s, sprint 4.8 m/s, jump 3.6 m/s, gravity 9.81. `src/systems/player-controller.ts` |
| Fixed timestep        | `FixedStepper` runs at 60 Hz with at most 5 catch-up steps, so movement doesn't depend on frame rate                                                                                                                                                                      |
| Steps and ramps       | Autostep up to 0.30 m (minimum tread 0.20 m) and slopes up to 40°. Gravity handles going down                                                                                                                                                                             |
| Input map             | `src/systems/input-map.ts`: one control table with layers for explore, dialogue, mini-game and menu, matching GAMEPLAY_SPEC §2. Key presses fire once, and changing layer clears held keys                                                                                |
| Pointer lock and look | Click the canvas to lock the mouse; the mouse turns and tilts the view; Esc releases it                                                                                                                                                                                   |
| First/third person    | **V** switches instantly and keeps the facing direction. First person: FOV 75 with a crosshair. Third person: FOV 65, a shoulder-follow camera arm that is shortened by a ray cast so it doesn't go through walls, and the capsule is visible                             |
| Placeholder character | A capsule at the real player height. Character models come in M8                                                                                                                                                                                                          |
| Spawn                 | 4 m inside Gate-5 (the origin gate), facing into campus, computed from gate data. M6 replaces it with the department spawn anchor                                                                                                                                         |
| Debug                 | Dev overlay: a "Free camera (orbit)" toggle (the M3 overview) and readouts of camera mode, position, grounded and sprinting                                                                                                                                               |

`src/game/PlayerRig.tsx` connects all of this to React Three Fiber. Player state reaches React only about 10 times a second (`src/state/player-store.ts`).

## Block entrances (placeholders)

"Walk from Gate-5 to each block entrance" needs entrances, and the site plan had none. One `main` entrance per block was added to `data/campus.json` with `confidence: "placeholder"`. Each sits at the midpoint of the longest facade on the side where the student map shows that block's entry markers:

- A: south, facing the courtyard
- B: west, facing the Highway
- C: east, facing the courtyard
- D: north, facing the courtyard
- E: west, facing the Highway
- F: north, facing the Gate-3 path

The exact door positions are unknown (OPEN_QUESTIONS #39). Entries gained optional `confidence` and `notes` fields.

## Acceptance

| Check (MILESTONES.md)                                           | Result                                                                                                                                                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The player cannot pass through buildings or the boundary        | Unit tests. In each campus walk, every step stays inside the boundary, outside every footprint and on the ground. Sprinting back out through Gate-5 is blocked, both in physics tests and in the browser |
| V switches the camera instantly                                 | The e2e test checks the mode readout, that the image changes (capsule visible), and the crosshair                                                                                                        |
| Sprint and jump work                                            | Unit tests (sprint more than 2.5× walk distance; the jump rises above 0.4 m and lands) and the e2e test (sprint more than 1.8× walk distance; height rises above 0.2 m, then grounded)                   |
| Walk from Gate-5 to each block entrance                         | Headless physics test: from the Gate-5 spawn, a grid path (test-only; the navmesh is M9) is followed at **sprint speed** to each of the six entrances. All six arrive within 2.2 m of the entrance point |
| A Playwright test drives movement and asserts a position change | `tests/player.spec.ts`                                                                                                                                                                                   |
| No tunnelling at sprint speed                                   | Covered by the campus walks at sprint speed. Also, a capsule at **400 m/s** cannot pass a 0.25 m wall                                                                                                    |

Further tests:

- a player standing still for 10 s does not sink;
- climbs a 0.25 m step but not a 0.6 m ledge;
- walks up a 25° ramp;
- the camera arm shortens in front of a wall;
- the input map layers are separate.

## Verification

- Typecheck, ESLint, 104 unit tests, campus validation (`campus.json`: 0 errors) and the production build pass.
- All three Chromium e2e tests pass in three consecutive runs: the player test, the scene smoke test (now using the free camera for the M3 overview), and the tracer. They now run one at a time with a 90 s limit, because parallel software-rendered WebGL pages starved each other of CPU and timed out.
- Fixed during testing: a jump press is kept until a physics step actually runs (it was being dropped on frames with no step), and the fixed stepper allows 10 catch-up steps, so the simulation keeps real time down to about 6 FPS.
- Draw calls stay under budget: 29 in third person, 1,626 triangles.
- Headless software rendering ran at about 13–25 FPS. The reference-laptop 60 FPS target is still unverified on real hardware.
- The production bundle is about 5.5 MB (2.0 MB gzip) including the embedded Rapier WASM, well under the 40 MB initial-download budget. Dev tools are excluded.
