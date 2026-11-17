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
