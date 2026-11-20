# Decisions

## M0 — 2026-10-25

- Follow the decided React 18 / R3F stack. Install only dependencies used by M0; physics, navigation, audio, and campus schemas arrive in their owning milestones.
- Ground and cube are technical test primitives, not representations of campus entities. No campus facts or coordinates were added.
- `validate:campus` currently checks only seed JSON readability and object shape, explicitly reporting that M1 owns semantic validation. Do not interpret M0 passing as validated campus data.
- Expose `build:navmesh` now but fail with an actionable M9 notice rather than generate a misleading artifact.
- The development overlay is dynamically imported only in Vite development mode and removed from production builds. Its metrics update twice per second; the spin control uses Zustand.
- Keep only `reference/maps/student-map.png` eligible for Git. All other reference files remain private, including future files under `reference/maps/`.
- No deployment or Git commit is included in this scaffold task; the supplied planning pack was initially untracked.

## M1 — 2026-10-25

- Validate the supplied seed without rewriting map-derived entries. Preserve its documented provenance and metadata fields in a strict Zod schema; shared types are inferred from it. Boundary/gate nulls and absent gate headings reflect the actual seed. They are unresolved warnings in seed mode and errors in curated mode.
- Self-only stairs with null positions are explicit inventory placeholders. Missing reciprocal links warn only for that undeveloped seed case. Otherwise missing links are errors; curated data always requires links. No stairs or floor positions were invented.
- Geometry checks run on every supplied polygon, even in seed mode. Null geometry does not bypass schema, ID, reference, supplied-polygon or area errors. Use polygon-clipping for complete polygon intersection/difference tests, including concave boundaries and contained footprints; shared edges may touch without positive-area overlap. Test geometry is synthetic and lives in a fixture, not campus data.
- Floors are unique per building; entry IDs per building; connector IDs per floor. Gates, buildings, areas, departments, anchors and space IDs are globally unique. This matches the seed's recurring G/B1 floors and stairs-G connectors.
- No PropGroup contract exists in CAMPUS_SPEC. Accept the existing empty list; reject nonempty opaque prop data until the contract is agreed. Record the question rather than inventing a permanent schema.
- Audit explicit reference keys recursively in optional task/NPC documents, without implementing their behavior schemas or creating fictional content. Supported keys are documented in M1_VERIFICATION.md; later schemas must declare any additional reference-bearing fields.
- Load the validated seed into development diagnostics only at M1. World builders will consume curated campus.json in later milestones. No reference file is fetched or imported by the app.
- Tour host access succeeded. Use literal AST parsing of the observed 3DVista config and locale labels, never eval downloaded scripts. Extract explicit adjacency and hotspot playlist targets; do not use tour distances as measurements or playlist order as walking connectivity.
- Add only the unambiguous named Gate-2 discovery to the seed, with source tour, estimated confidence and null position. Map other scenes conservatively and report conflicts; no floor counts, numbered room matches, cafe locations or gate equivalences were guessed.
- Collect up to eight small thumbnail previews per uniquely mapped entity at no more than one request per 1.1 seconds. Keep all config, previews and reports under ignored reference directories; manifests mark unknown licenses and prohibit texture reuse. Previews are not counted as adequate detail photos.

## M2 — 2026-10-25 (in progress; source correction needed)

- Implement the independent tracer workflow while source geometry is being checked. Do not manufacture a metric campus by uniformly scaling the schematic to the expected acreage or assigning OSM labels without corroboration.
- The owner authorized searching OSM. Its current boundary fails the area check and separately identified D/F outlines and gate positions are missing. Keep this snapshot as private reference; no ODbL-derived geometry ships or overwrites the seed.
- Use an explicit site-plan validation stage for M2: exterior geometry/calibration is required, interior geometry remains a reported warning until M7. The complete-campus mode and all semantic checks remain available. This corrects M1's premature requirement that a first exterior export already contain every interior polygon and stair position.
- Preserve the established campus schema. Trace evidence uses existing meta.calibration fields; browser files remain local object URLs. Draft downloads and final accepted exports are separate actions. Only a validated CLI operation writes data/campus.json, with a backup and atomic replacement.
- The initial debug view shows seed pixel boxes rather than synthetic meter coordinates. Missing geometry remains missing. Placeholder is the tracing confidence default; the owner must explicitly choose stronger confidence from their evidence.
- Reuse the scaffold's dark palette and plain controls; no component library or stack changes. 21st context/search/review were attempted; catalog search was unauthorized (HTTP 401), so no external components were retrieved.

## M2 — 2026-11-20 (site plan traced and accepted)

- **Metric source.** Use a north-up Esri World Imagery z19 mosaic as the calibrated image and register the OpenStreetMap (ODbL) snapshot on it to identify buildings.
  - Google Maps imagery is not traced, because its terms prohibit it.
  - Scale comes from three great-circle reference distances on the tile georeference (map-ruler equivalent). OSM's own coordinates give an independent area check (42,482 m² vs 42,484 m²).
  - The mosaic and raw OSM files stay private.
- **Geometry sources.**
  - OSM outlines are used where they match the imagery: the boundary, A, B, E, badminton and the Masjid.
  - Imagery is traced where OSM is missing or stale: F, the cricket ground, courts, parking, lawns, paths and gates.
  - OSM's single "CS Block" L-shape is split into C (west wing) and D (south wing) along the wing's east wall line. Both are marked `estimated`.
  - Placeholder confidence is used for anything not identifiable in the imagery: New Cafe, Fresh Friez, Book PhotoCopy and Gate-2.
- **Boundary-area band widened from ±15% to ±20%.** This was approved by the contributor running M2, and the project owner should confirm it (OPEN_QUESTIONS #31).
  - The walled campus measures 10.5 acres; the published figure is 12.5 acres.
  - The check exists to catch a wrong scale, and ±20% still does. The boundary was not stretched to fit.
  - Changed in `src/systems/campus-validation.ts` (`BOUNDARY_AREA_MIN`/`MAX`), with a unit test of both edges.
- **Gate heading convention.** `heading` is the compass bearing (degrees clockwise from true north) a person faces when walking into campus through the gate.
- **Orientation.** The student map's top is south, and it is a 180° rotation of the real layout, not a mirror. `mapToWorld` is kept for schematic display only; metric positions come from `meta.calibration`.
- **No structural changes to the seed.** Seed labels, IDs and the room inventory are unchanged. Map-relative names (for example "South lawns", which lie north of A) are explained in `notes` rather than renamed.

## M3 — 2026-11-20

- **Greybox, not final looks.** Buildings are extruded floor by floor, with a thin gap that makes the floor count readable. Basements stay underground and are not drawn. Facades, materials and shadows belong to M5 and M13.
- **Additive schema fields** (optional, so existing data stays valid):
  - `buildings[].floorsConfidence` lets the data say that A's and E's floor counts are unknown. Without it, the M3 rule "A: unknown → placeholder" could not be shown.
  - `meta.defaults.boundaryWallHeight` (2.5 m) and `gateWidth` (6 m) are rendering placeholders. They live in data rather than code (OPEN_QUESTIONS #38).
- **Pure logic in `src/systems/campus-geometry.ts`** covers floor stacks, wall segments with gate openings, colliders and camera framing. The three.js geometry builders are in `src/world/campus-meshes.ts`, and `CampusScene.tsx` stays thin.
- **Colliders as data now, physics in M4.** `staticColliders()` returns simplified shapes built from footprints and wall segments, never from render meshes: building prisms and wall boxes. Rapier is not installed until M4, which owns movement and collision. A debug toggle draws the shapes.
- **Confidence colours are on by default** in the dev overlay, so placeholders (A and E floor counts, placeholder areas and gates) stay obvious. A block shows the weaker of its footprint confidence and its floor-count confidence. The inner campus ground stays neutral so traced areas remain visible.
- **Labels use drei `Html`** (DOM elements, no extra draw calls), so no font file has to be fetched.
- **The M0 test scene and its spin toggle were removed.** The smoke test now checks the M3 acceptance criteria instead.

## M4 — 2026-11-20

- **Rapier is used directly (`@dimforge/rapier3d-compat`), not through `@react-three/rapier`.**
  - It is the same physics engine that `@react-three/rapier` wraps.
  - Calling it directly keeps the controller and world in plain TypeScript (`src/systems/`). The "walk from Gate-5 to every block without passing through anything" check can then run as a fast headless unit test.
  - The R3F component only wires input and the camera.
- **Building colliders are side-wall triangle meshes generated from footprints**, not from render meshes, so concave footprints are exact. The boundary wall and the closed gate barriers are boxes.
  - Gates are closed for now: there are no off-campus areas (PRD §2).
  - Opening the Masjid gate at Jummah belongs to M5 and M12.
- **Player numbers** not given by GAMEPLAY_SPEC:
  - capsule radius 0.3 m, height 1.75 m;
  - walk 1.6 m/s, sprint 4.8 m/s, jump 3.6 m/s;
  - autostep 0.30 m, slopes up to 40°;
  - a 60 Hz fixed timestep.

  The eye height of 1.65 m comes from the spec.

- **Rapier's snap-to-ground is disabled.** In rapier3d-compat 0.21 it made a resting capsule sink through the ground slab; a regression test reproduces this. Gravity alone handles stepping down.
  - The controller also takes one world step on creation, because Rapier's scene queries don't see new colliders until then.
  - While sprinting the capsule settles up to about 7 cm into the ground slab, then recovers. Tests allow 10 cm; falling through would be metres.
- **Placeholder block entrances.** One `main` entrance per block, on the side the student map marks with entry points, at the midpoint of the longest facade there, marked `confidence: "placeholder"`. Entries gained optional `confidence` and `notes` fields.
- **The camera starts in first person.** The M3 orbit overview stays available as the dev overlay's "Free camera".
