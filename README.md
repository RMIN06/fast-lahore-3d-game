# FAST Lahore Campus Game — Planning Pack

## Run the app (M2 accepted: calibrated site plan in `data/campus.json`)

Requires Node 20.19+ (or Node 22.12+ on the Node 22 line) and npm.

```sh
npm ci
npx playwright install chromium
npm run dev
```

Open the local URL printed by Vite. The development scene shows a ground plane,
spinning cube, and an overlay with FPS, draw calls, triangles, and a spin toggle.
These are technical primitives, not campus geometry. Enable **Campus data** in
the development overlay to inspect the loaded seed inventory and validation warnings.

Open `/dev/tracer` for local image calibration, polygon/gate/entry tracing,
confidence-colored world preview, undo and JSON export. The initial schematic
preview is in pixels and is explicitly not a measured campus. Use **Load campus
JSON** with `data/campus.json` to see the accepted metric site plan. See
[M2 status](docs/M2_STATUS.md).

```sh
npm run typecheck
npm run lint
npm test
npm run validate:campus
npm run test:e2e
npm run build
npm run preview
```

`npm run format` formats the scaffold and `npm run format:check` checks it.
The browser smoke test verifies a rendered canvas, live metrics, the debug toggle,
and absence of console errors or uncaught exceptions. Its screenshot is saved to
`test-results/m0-scaffold.png`.

`validate:campus` runs Zod, ID/reference, polygon, containment, connector and area
checks. The supplied seed allows explicit warnings for unfinished geometry and
unlinked, unpositioned seed stairs. Curated `data/campus.json`, when present, must
pass M2 site-plan checks (exterior geometry and calibration). Complete interior
checks remain available with `--complete`. See [current validation details](docs/M2_STATUS.md)
and [the M1 baseline](docs/M1_VERIFICATION.md).

```sh
npm run validate:campus -- path/to/campus.json
npm run validate:campus -- path/to/seed.json --seed
npm run validate:campus -- path/to/export.json --site-plan
npm run apply:site-plan -- path/to/export.json
```

Task/NPC files are checked for campus references when present; their gameplay
schemas and content belong to later milestones. `build:navmesh` remains an M9
notice. The M2 site plan (boundary, six block footprints, gates, grounds, courts,
parking, lawns and paths) was traced from satellite imagery and OpenStreetMap
and applied with `apply:site-plan`. Its sources are logged in `docs/ASSET_LICENSES.md`.

M1 tour outputs are private under `reference/tour/` (graph, raw config, locations)
and `reference/photos/` (previews, manifests, coverage and contact sheet).
See [the M1 report](docs/M1_VERIFICATION.md) for findings and script usage.

The folder layout follows `docs/ARCHITECTURE.md`; empty folders contain `.gitkeep`.
Development tools are removed from production builds. No private reference material
is imported or copied into shipped output.

Written for Codex (coding agent). Planner: Claude. Owner: Muhammad Ibrahim.

## Layout of this pack

```
AGENTS.md                      -> copy to repo root
docs/                          -> copy to repo /docs
  PRD.md
  ARCHITECTURE.md
  CAMPUS_SPEC.md
  GAMEPLAY_SPEC.md
  MILESTONES.md
  TOUR_RECON.md
  REFERENCE_COLLECTION.md
  ASSET_PIPELINE.md
  OPEN_QUESTIONS.md
data/campus.seed.json          -> copy to repo /data
reference/maps/student-map.png -> copy to repo /reference/maps (only reference file that is committed)
```

## Source material

- Student-drawn campus map (not to scale): `reference/maps/student-map.png` — gives blocks, departments, rooms, gates, outdoor areas and relative layout.
- Panora 360° tour (Panora's page is marketing text only; it has no department list): https://www.panora.com.pk/work/fast-lahore (tour: https://tours.panoraproperties.com/FAST-LHR/index.htm) — gives scene topology and appearance, not metric geometry.
- Google Maps / satellite imagery — gives real footprints and scale (see CAMPUS_SPEC calibration).
- Official figure: campus is about 12.5 acres (about 50,600 m²), used as a sanity check on calibration.

## First prompt to give Codex

> Read AGENTS.md and every file in docs/ in the order AGENTS.md lists. Then execute milestone M0 from docs/MILESTONES.md only. When its acceptance checks pass, stop and summarize what you did and anything you had to assume.

Then repeat with M1, M2, and so on. Milestones M1 and M2 need small inputs from the owner (see OPEN_QUESTIONS.md).

## What the owner must still supply

1. (Done in M2, 2026-11-20) Satellite-based site plan traced from Esri World Imagery and OpenStreetMap. The owner should confirm the items in `docs/OPEN_QUESTIONS.md` #31–37 (area decision, Gate-2, C/D split, placeholder shops).
2. (Verified in M2) Map top = south, as a 180-degree rotation rather than a mirror.
3. Answers to the blockers in `docs/OPEN_QUESTIONS.md` (department list, gates 1/2/4, upper floors of A and E blocks).
4. Phone photos for places the tour does not cover.
5. Permission from FAST (and Panora, if their imagery is used beyond private reference) before public release.
