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

## M5 — 2026-11-20

- **Clock rate:** one game minute per real second at ×1 (24 real minutes per day, GAMEPLAY_SPEC §4).
  - Monday 08:30 is the start for new players until the owner answers OPEN_QUESTIONS #20.
  - A single shared clock is advanced in the render loop and published to React 4 times a second.
- **Simplified sun path:** rises at 06:00 due east, sets at 18:30 due west, with a 58° noon elevation (equinox at Lahore).
  - Seasonal variation is a stretch goal in the spec.
  - The moon is simply opposite the sun.
- **Gates follow campus data.** A gate with an `opens` rule is open only in that window: the Masjid-side gate, Fri 12:45–14:00. While open, its leaf hides and its collider is disabled. Gates without a rule stay closed (no off-campus areas).
- **Lamp posts are procedural placeholders** placed from campus data (entrances, gates, path edges), because no lamp positions exist and the PropGroup format is still undefined (OPEN_QUESTIONS #26, #40).
  - Lamp light is faked with additive ground pools rather than many real point lights, to keep within the frame budget.
- **Window bands are procedural** (one band per floor, panes 3 m apart) until the M13 realism pass. Shared walls get no windows.
- **One sun shadow map** (2048², an 80 m box following the player) rather than two cascades. It is simpler, and it holds the budget at about 40 draw calls. Cascades can be added in M14 if needed.
- **Night readability** comes from a moonlit blue ambient light, moonlight, lit windows and lamp pools. An e2e test checks that the night frame is darker than noon but not black.
- **Overlay checkboxes no longer swallow game keys.** Keyboard input is ignored only in text-entry fields.

## M6 — 2026-11-20

- **Spawn anchors** are derived from data: 3 m outside each department block's main entrance, facing it, with `confidence: "placeholder"`, because the entrances are placeholders. Anchors gained optional `confidence` and `notes` fields. Department-to-block mapping follows the seed: CS uses C, Civil uses B, EE and Management use D.
- **Save versions.** v1 is the shape ARCHITECTURE §6 describes (`timeOfDay` only). v2 (current) stores the weekday and minutes that M5 introduced, plus camera yaw and `savedAt`.
  - The key is versioned (`fast-lahore.save.v2`). Legacy keys are migrated forward and removed.
  - Unknown, future or corrupt saves never crash: the title screen reports them, and New game still works.
- **Autosave** runs every 60 s, when the page is hidden or closed, and on Exit to title, so "reload + Continue" works even without a manual save.
- **Settings** are stored separately (`fast-lahore.settings.v1`) and also inside each save.
  - Graphics presets change resolution and sun shadows only, for now.
  - Volume is stored ahead of M12 audio.
- **Overlays** (pause, settings, time, phone, map) share one state. Any open overlay switches input to the menu layer and releases the mouse. The pause menu and Settings also pause game time; the time panel, phone and map don't.
- **Avatar heights:** eye height comes from GAMEPLAY_SPEC (1.65 m male, 1.58 m female), and the capsule is 0.10 m taller than the eyes.
  - Skin tone, hair, and outfit options are a small placeholder set until the M8 character models.
  - Hair is stored but not yet visible.
- **Department list** is limited to the four departments in campus data (OPEN_QUESTIONS #7).

## M7 — 2026-11-20

- **Interiors are generated at load time from campus data, not stored.** No real floor plans exist.
  - Writing generated room polygons and stair positions into `data/campus.json` would make it look curated when it isn't. So the generator (`src/systems/interior.ts`) runs from the floor and room lists, footprint and entrance.
  - Its output is treated as **placeholder layout** everywhere: debug tint, docs and HUD context.
- **Layout recipe:** the largest building-aligned rectangle inside the footprint; a vestibule from the main door; an entrance hall with the stair shaft; and a corridor spine with rooms in strips on both sides (one side when narrow).
  - "left" and "right" from the map notes choose the strip, with `order` running along it.
  - "front", "middle" or no side are balanced across strips: the reference frame for those notes is unknown (OPEN_QUESTIONS #9).
  - Open-hall, parking and custom floors become one open room.
- **Stairs are stacked straight ramps (about 30°) in one shaft per block, with rails.** No stair positions exist in the data, and ramps are robust with the M4 kinematic controller (steps up to 0.3 m, slopes up to 40°). Real stair geometry, and lifts if any, can replace them once plans or photos arrive (OPEN_QUESTIONS #10).
- **Basements need the ground to have holes.** The ground collider becomes a triangle mesh with holes under each interior rectangle. The facade collider gets a 3 m × 2.7 m opening at the main door; the rest of each block stays solid.
- **Door plates are a canvas texture atlas, one per block.** This avoids runtime font downloads and costs one draw call per block.
- **Interior rendering streams in** within 25 m of the door or while inside, and out beyond 60 m. Physics for all interiors stays loaded, because the colliders are cheap.
- **Entry transition:** a 0.45 s fade, hiding the block's exterior shell, and indoor ambient light.
- **Delivery order F, D, C, B, A, E** is enforced with `INTERIOR_BLOCKS` in `src/world/interiors.ts`, one commit per block. Blocks not yet listed stay solid.
- **Library (E):** its floors and layout are unknown (OPEN_QUESTIONS #5, #11, #23), so it gets the same placeholder treatment as an open hall. The "hero treatment" (real reading halls, shelves, issue desk) waits for owner input and the M13 realism pass.
- **Test tooling:**
  - The Vite dev server ignores `test-results/`, `playwright-report/`, `reference/` and `docs/`. A mid-run reload sent a long e2e test back to the title screen.
  - Interior e2e tests run on the Low preset in an 800 × 450 viewport, because headless software rendering is fill-rate bound.

## M8 — 2026-11-20

- **Procedural characters (own work) instead of waiting for owner models.**
  - Third-party downloads need explicit approval of a specific source.
  - A code-built skeleton with rigid-skinned primitives and procedural clips meets the acceptance checks, and owner glTF models can replace it in `CharacterRig` later (OPEN_QUESTIONS #45).
- **Animation runs in pure TypeScript** (`src/systems/character.ts`), not three.js `AnimationMixer`. This keeps it unit-testable: the foot-sliding test runs forward kinematics headless.
- **Walk and run use leg IK, with the phase driven by distance moved**, so feet stay planted at any speed. Gaits are sized to the leg's reach, including hip bounce.
- **One merged SkinnedMesh per LOD (one draw call),** sharing one skeleton, so NPC crowds in M9 stay within the draw-call budget.
- **First person uses the hidden-body policy.** First-person arms would need hand animation that real models will provide.
- **Sit, kick and swing are triggered from the dev overlay** until seats (M10) and mini-games (M11) exist.
