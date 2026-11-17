# M2 — Tracer implemented; metric site plan awaiting source correction

Date: 2026-10-25. **M2 acceptance has not passed. M3 has not started.**

## Implemented

- Development-only route `/dev/tracer`, linked from the scene overlay. Uses existing project colors, typography and React controls. The 21st design-context init succeeded; catalog search returned HTTP 401. Its review found informational hardcoded-color notices consistent with the existing untokenized scaffold; no automatic styling changes were applied.
- Unscaled schematic preview draws all six blocks, areas and known schematic gates directly from seed pixel metadata. It explicitly says pixels/not to scale and marks the assumed south-up orientation as unverified. It does not import or fetch the student-map image.
- Local PNG/JPEG/WebP image input. Image bytes stay in an object URL in the current browser; they are neither uploaded nor bundled. The owner can load the student map for visual reference, but it is explicitly unsuitable for metric calibration.
- Gate-5 origin picker; configurable image-to-world rotation; two or more measured distance references; least-squares meters-per-pixel fit and residual error. Source label, reference endpoints, distances, rotation and date are recorded using the existing calibration schema.
- Boundary/building/area polygons and gate/entry points; draggable draft vertices; point undo/clear; applied-trace undo; existing geometry editing; explicit confidence; required gate heading input. Shared world axes remain +X east, +Y up, +Z south. Polygons export counter-clockwise as viewed from above. Calibration controls lock after applying traces to prevent accidental mixed transforms.
- Schematic/image/world-plan modes, zoom/pan controls, labels and confidence colors; placeholder polygons are dashed and labelled. Live validation reports missing exterior geometry, schema/reference errors, polygon errors, overlap/containment errors and area sanity.
- Campus JSON import, draft export, and a final `campus.json` download enabled only after M2 validation passes. Draft imports may retain an incorrect boundary area for editing; the area error still blocks final export.
- `npm run apply:site-plan -- <path>` validates an exported site plan before writing `data/campus.json` atomically. Existing data receives a `.backup`. An invalid draft is rejected before any write. No fabricated `data/campus.json` has been created.
- Stage-specific validation: `site-plan` requires exterior geometry, headings and calibration, while retaining interior gaps as warnings for their owning milestones. `curated` remains the stricter complete-campus mode. Existing checks were not removed; new site-plan requirements include calibration evidence. The default command checks the seed and any campus.json at the M2 stage; explicit paths remain complete-mode by default unless `--site-plan` or `--seed` is given.

## Source review

The user supplied the Panora project page again and authorized looking for usable OpenStreetMap footprints.

- Panora page: <https://www.panora.com.pk/work/fast-lahore>. It links to the same 360° viewer inventoried in M1 (94 scenes, 231 links). M1's parsed config contains no latitude/longitude/GPS/floorplan coordinate fields. Tour labels and images support topology/appearance; they do not supply a verified metric site plan or all numbered room locations.
- OpenStreetMap API was reachable. Private raw snapshots and a north-up vector review are saved under `reference/osm/`, with exact API URLs in SOURCES.json. No OSM geometry was imported into app data or shipped output.
- Campus boundary: way **323166057**, approximately **42,483 m²**, using a local east/south metric projection. The project requires **42,997.85–58,173.56 m²** (12.5 acres ±15%). The difference is small but real; no arbitrary scale factor was applied to force acceptance.
- Available named building outlines: Civil **841040144**, Library **841040145**, Admin **841040146**, CS **841040147**, plus Cafeteria **841040148** and other facilities. There are **no independently identified D and F outlines** in this snapshot. The CS outline appears to encompass more than the student map's narrow C block; the surrounding arrangement and labels need reconciliation before block assignment.
- The snapshot also labels Football Ground, Basketball/Volleyball/Batminton courts and parks differently from the student map. OSM floor/height tags conflict with seed/tour information. None of those tags overwrote campus facts.
- No named gate nodes establish Gate-5's absolute location or the Gate-2/3/Masjid-side gate positions. No gate location was guessed from unnamed nodes.
- OSM data is ODbL 1.0, attributed to OpenStreetMap contributors. It remains private study material, not a shipped asset. Any future accepted OSM-derived dataset must record source and licensing obligations before release.

## Remaining acceptance work / owner input

1. Provide a top-down satellite capture with visible scale bar, or a reliable plan with **two measured distances and identifiable endpoints**. A useful capture must include all campus edges, D/F and the Masjid-side boundary. The source image needs a confirmed north direction.
2. Confirm the Gate-5 origin and positions/headings of all four inventoried gates, particularly tour-only Gate-2. Reconcile the source boundary with the 12.5-acre expectation; an actual corrected boundary is preferable to resizing an inaccurate one.
3. Trace the actual boundary, A–F footprints and all grounds/courts/parking/lawn/path areas. Review against the student map and tour, then export/apply campus.json. Unknown elements must retain placeholder confidence with an open question.

The incomplete OSM source is **not** an environmental access block; it is an accuracy/completeness blocker. A synthetic test boundary passing the area check is not evidence that the real campus meets M2 acceptance.

## Verification

- 73 unit tests cover prior validation plus metric fitting, invalid references, rotation/origin round trips, nonmutating data edits, bad traces, provenance, stage validation and final-export blockers.
- Chromium tests cover local image input, two synthetic reference measurements, scale fitting, tracing a synthetic 50,600 m² boundary, world preview, draft download, final-export blocking and undo, without browser console errors. The existing scene smoke test remains passing. Screenshots are generated under `test-results/m2-tracer-*.png` and were visually reviewed.
- Typecheck, ESLint, all 73 unit tests, both Chromium tests, campus validation, formatting and production build passed. Production JS was checked: tracer and private-reference content are excluded. A fixture lacking calibration was intentionally submitted to apply:site-plan and rejected with exit code 1 before writing data/campus.json. The existing cube/ground render remains 2 draw calls and 14 triangles (28 FPS during the screenshot smoke run); the tracer is SVG/DOM and adds no WebGL scene geometry. Reference-hardware FPS remains unverified as documented in M0/M1.

## Commands

```sh
npm run dev
# Open http://127.0.0.1:5173/dev/tracer
npm run validate:campus -- path/to/export.json --site-plan
npm run apply:site-plan -- path/to/export.json
npm run validate:campus
# Complete-campus checks, including interiors:
npm run validate:campus -- --complete
```

Private source review can be reproduced with `node scripts/fetch-osm.mjs` and `node scripts/review-osm.mjs`. These fetch a small OSM bounding box and render a local study diagram; they do not write game data.
