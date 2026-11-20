# M2 — Calibrated site plan and tracer: accepted

Date: 2026-11-20. **M2 acceptance passed** (with the boundary-area band widened to ±20%, see [Decisions](DECISIONS.md#m2--2026-11-20-site-plan-traced-and-accepted)). **M3 has not started.**

## Result

`data/campus.json` now exists. It was written by `npm run apply:site-plan`, validates with **0 errors** in site-plan mode, and keeps the seed's full room inventory. Its 151 warnings are expected: missing interior geometry, entries, anchors and stair links (owned by M6/M7), plus explicitly marked placeholders.

| Acceptance check (MILESTONES.md)                             | Result                                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Boundary area within 12.5 acres ±20%                         | **42,484 m²** (10.50 acres, −16.0%). Passes ±20%. Would fail the original ±15% by 1.2% (see "Area" below).                           |
| All six block footprints non-null                            | A, B, C, D, E, F traced                                                                                                              |
| Gates non-null                                               | G5 (origin), G-MASJID, G3, G2 (G2 is a placeholder)                                                                                  |
| Ground, courts, parking, lawn and path polygons non-null     | All 16 areas have polygons (3 are placeholders)                                                                                      |
| Top-down view matches the student map's relative arrangement | Checked visually: the `/dev/tracer` world view with `data/campus.json` loaded, against `reference/maps/student-map.png` rotated 180° |

## How the site plan was made

1. **Imagery.** A north-up mosaic of Esri World Imagery tiles was built at zoom 19 (2048 × 2304 px, about 0.254 m/px, lon 74.3012–74.3057, lat 31.4786–31.4836). It was kept private and is not in Git. The OpenStreetMap snapshot (fetched 2026-11-20, ODbL) was overlaid on it to identify buildings and check alignment.
   - **Google Maps was not used for tracing.** Its terms prohibit tracing or creating datasets from its imagery.
2. **Calibration.** Gate-5 is the origin, the image-to-world rotation is 0° (the image is north-up), and three reference distances (an east–west, a north–south and a diagonal baseline of 203–367 m) are great-circle distances from the tile georeference, the same way a map ruler measures them. The least-squares fit gives **0.25435 m/px** with a residual of about 0.00003%.
   - This was cross-checked independently: the boundary polygon's area from OSM's own lat/lon is 42,482 m², and through this calibration it is 42,484 m².
3. **Tracing.** Every trace went through the project's `traceToCampus` (the same validation path as `/dev/tracer`), and the result was applied with `npm run apply:site-plan`. Each entity's `source` and `notes` record where its geometry came from.

## What was traced

| Item                                                          | Confidence      | Source / basis                                                                                                                            |
| ------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Boundary (walled campus)                                      | traced          | OSM way 323166057, checked against imagery                                                                                                |
| A Admin Block                                                 | traced          | OSM 841040146 (one vertex moved 0.5 m to remove a sliver overlap with C)                                                                  |
| B Civil Dept                                                  | traced          | OSM 841040144                                                                                                                             |
| C CS Dept / D Electrical & Management                         | estimated       | OSM 841040147 ("CS Block") covers both as one L-shape. It was split along the west wing's east wall line; the split position is estimated |
| E Library                                                     | traced          | OSM 841040145                                                                                                                             |
| F New Building                                                | traced          | Imagery (roof outline). OSM's courts on this site are stale                                                                               |
| Cricket ground, futsal, bike parking, car parking, both lawns | traced          | Imagery                                                                                                                                   |
| Basketball                                                    | estimated       | Paved court with a centre circle, identified from the student map's order along the south edge                                            |
| Highway, Gate-3 path                                          | estimated       | Visible paths; OSM way 561233053 guided the Highway centreline; the 5 m widths are estimated                                              |
| Badminton                                                     | estimated       | OSM 561233052; not clearly visible under the trees                                                                                        |
| Masjid                                                        | traced          | OSM 841040150. It lies outside the wall, north across the road                                                                            |
| Fountains 1 and 2                                             | estimated       | Circular features at path crossings; whether they are water features is unconfirmed                                                       |
| New Cafe, Fresh Friez, Book PhotoCopy                         | **placeholder** | Positions from the student map's relative layout; not identified in the imagery                                                           |
| Gate-5 (origin)                                               | estimated       | Where the Love Garden west path (through fountain-2) meets the north-west wall, matching the map's alignment                              |
| Masjid-side gate                                              | estimated       | North end of the Highway, facing the Masjid                                                                                               |
| Gate-3                                                        | estimated       | Where the paved road from the east street enters, north of F Block                                                                        |
| Gate-2                                                        | **placeholder** | A road opening in the south wall; its identity as the tour's "Campus Gate 2" is unconfirmed                                               |

Gate headings are compass bearings of the direction a person faces when walking into campus: 147.3° for the north-west wall gates, 249.4° for Gate-3 and 341.7° for Gate-2. `meta.geo` records the origin as lat 31.482092, lng 74.30282, rotation 0.

**Orientation verified.** The student map's top is south, and the map is a **180° rotation, not a mirror**:

- F Block is in the south-east, and Gate-3 is on the east wall.
- The cricket ground is in the south-west.
- The Masjid is north, across the road.

`meta.mapToWorld.status` and `meta.schematicMap.northDirection` were updated to say so.

## Area

FAST's website gives 12.5 acres (50,586 m²). The walled campus measures 42,484 m² (10.5 acres) in the imagery, and OSM independently gives 42,482 m². The published figure probably includes land outside the wall. The ±15% band (at least 42,998 m²) rejected the real campus by 1.2%. With the contributor's approval, the band was widened to **±20%** (40,469–60,703 m²). That still rejects a wrong scale, which is the check's purpose; nothing was stretched or rescaled to pass. The project owner should confirm this decision (OPEN_QUESTIONS #31).

## Still open (does not block M2)

OPEN_QUESTIONS #31–37:

- what the 12.5-acre figure covers;
- Gate-2's identity and location;
- where the C/D split falls;
- positions of the three placeholder shops/cafes;
- the unlabelled building south of the Library (OSM calls it "Cafeteria");
- licensing review of the derived geometry before public release;
- the seed's map-relative "South lawns" label.

Entrances, spawn anchors, interior polygons and stair positions remain warnings for M6/M7.

## Verification

- `npm run validate:campus`: seed 0 errors / 182 warnings; `data/campus.json` 0 errors / 151 warnings (site-plan mode).
- Unit tests include a new test of the ±20% band at both edges and at the measured campus area.
- `/dev/tracer` was opened in headless Chromium with `data/campus.json` loaded. The world view shows the full layout, and the readiness panel reports 0 errors. There were no console errors on the tracer or the scene page.
- Typecheck, ESLint, 74/74 unit tests, both Chromium e2e tests (scene smoke test and tracer), campus validation, Prettier (on the changed files) and the production build all pass.

## Commands

```sh
npm run dev
# Open http://127.0.0.1:5173/dev/tracer and use "Load campus JSON" with data/campus.json
npm run validate:campus
npm run validate:campus -- data/campus.json --site-plan
npm run apply:site-plan -- path/to/export.json
```

## History (2026-10-25)

- The tracer, calibration maths, stage-specific validation and `apply:site-plan` were implemented. Acceptance was then blocked because no metric source was available.
- The OSM review at that time found the 42,483 m² boundary, no separate D/F outlines and no named gates.
- Those findings are resolved above. The 2026-10-25 review's raw files remain private under `reference/osm/`.
