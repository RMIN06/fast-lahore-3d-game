# M3 — Exterior greybox: accepted

Date: 2026-11-20. **M3 acceptance passed. M4 has not started.**

## What was built

The main page (`/`) now renders the whole campus from `data/campus.json` instead of the M0 test cube. No coordinates are written in code.

| Item                 | Implementation                                                                                                                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terrain and surfaces | A ground plane outside the campus, a neutral ground layer inside the boundary, and every area polygon at a fixed small height per kind (lawns, then grounds/courts/parking, then paths) so surfaces never overlap visually. Colours come from `surface`, or from `kind` when there is no surface. |
| Boundary wall        | Oriented boxes along the boundary, merged into one mesh. A gap of `meta.defaults.gateWidth` is left at every gate that lies on the boundary.                                                                                                                                                      |
| Buildings            | Each footprint is extruded floor by floor at `floor.height` or the `meta.defaults` height. A thin gap between slabs makes the floor count visible. Basements are part of the floor stack data but stay underground and are not drawn.                                                             |
| Gates                | Two posts per gate, placed across the opening using the gate's heading.                                                                                                                                                                                                                           |
| Paths and Highway    | Area polygons of kind `path` (Highway, Gate-3 path).                                                                                                                                                                                                                                              |
| Entry markers        | A cone at each entry with a position. No entrances have positions yet (they belong to M6/M7), so none are drawn.                                                                                                                                                                                  |
| Labels               | HTML labels for each block (name and floor summary) and each gate. Placeholders are named as placeholders.                                                                                                                                                                                        |
| Confidence colours   | Blocks are coloured by the weaker of footprint confidence and the new `floorsConfidence`; areas by their confidence. Placeholders are red. On by default in the dev overlay.                                                                                                                      |
| Static colliders     | `staticColliders()` builds collision shapes from footprints and wall segments, never from render meshes: one prism per building and one oriented box per wall segment. The "Collision shapes" debug toggle draws them as a wireframe. M4 feeds them to Rapier.                                    |
| Orbit camera         | drei `OrbitControls`. The starting view frames the whole boundary (`campusCamera()`).                                                                                                                                                                                                             |

**Code:**

- `src/systems/campus-geometry.ts`: pure TypeScript for floor stacks, masses, wall segments, colliders and camera framing, with unit tests.
- `src/world/campus-meshes.ts`: three.js geometry builders.
- `src/game/CampusScene.tsx`: the thin React Three Fiber scene.
- `src/state/debug-store.ts`: the debug toggles.
- `src/dev/DevOverlay.tsx`: the toggles UI, legend, metrics and campus data panel.

The M0 test scene (`ScaffoldScene.tsx`) and its spin toggle were removed.

## Acceptance

| Check (MILESTONES.md)                   | Result                                                                                                                                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The orbit camera shows the whole campus | The starting view frames the boundary. The e2e test checks that dragging changes the view. Screenshots: `test-results/m3-greybox.png`, `test-results/m3-neutral-colliders.png`                           |
| Correct floor count per block           | A: 1 above ground, **floors unknown (placeholder)**. B: 3 + 1 basement. C: 3 + 1 basement. D: 3 + 1 basement. E: 1, **floors unknown (placeholder)**. F: 4 + 2 basements. Checked in unit and e2e tests. |
| Draw calls within budget                | **26 draw calls, 954 triangles** (budget: ≤ 400 calls, ≤ 1.5 M triangles outdoors). 27 with collision shapes shown.                                                                                      |

## Data and schema additions

These are additive and optional; existing data stays valid.

- `buildings[].floorsConfidence`: confidence in the floor count. A and E are `placeholder` (OPEN_QUESTIONS #5, #22, #23); B, C, D and F are `estimated` (from the student map).
- `meta.defaults.boundaryWallHeight` = 2.5 m and `meta.defaults.gateWidth` = 6 m. These are rendering placeholders until measured (OPEN_QUESTIONS #38).

## Verification

- Typecheck, ESLint, 82 unit tests, campus validation (seed 0 errors; `campus.json` 0 errors in site-plan mode) and the production build pass.
- Both Chromium e2e tests pass. The smoke test checks the heading, live metrics, the draw-call and triangle budgets, every block's floor label, that each debug toggle changes the image, label hiding, orbit dragging, the campus data panel, and that there are no console errors.
- The production bundle is about 1.17 MB (330 kB gzip), with the development overlay, tracer and sampler excluded. Campus data now ships.
- Headless Chromium (software rendering, 1600 × 1000) measured about 25 FPS. As in M0–M2, this is not the reference-laptop benchmark: the 60 FPS target on an Iris Xe at 1080p is still unverified on real hardware.
