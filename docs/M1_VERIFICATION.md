# M1 data foundation — 2026-10-25

M1 only. No calibration, tracer, campus geometry generation, player, or later gameplay was implemented.

## Acceptance

- Strict Zod campus schema and inferred TypeScript types cover the source inventory, including its existing provenance and metadata. `loadCampus` and `loadCampusJson` fail with offending paths for bad data. Development diagnostics load the seed and expose its warning list with the Campus data toggle.
- `validate:campus` passes the supplied seed with **0 errors and 182 warnings**. Inventory: 6 blocks, 20 floor records, 106 spaces, 4 gates, 16 areas, 4 departments and 4 unpositioned spawn anchors. Warnings describe missing geometry/headings/links and explicitly marked placeholders, not validation success for a finished campus.
- 57 unit tests pass, including the M0 store test. Deliberately broken fixtures cover schema errors, duplicate IDs/levels, typed and nested references, polygon self-intersection/degeneracy, overlaps, boundary and room containment, missing or mismatched reciprocal floor connectors, area limits, incomplete curated data, and loader error paths. All test coordinates are synthetic, isolated in a JSON fixture.
- Standard typecheck, lint, tests and campus validation pass. Formatting and production build pass. Chromium smoke test confirms the rendered scaffold, live counters, pause/resume image behavior, validated seed summary and warning details with no console errors or uncaught exceptions.
- The scene remains the M0 technical cube/ground (2 draw calls, 14 triangles). Headless smoke sample was 27 FPS during screenshot operations; the 1080p reference-laptop performance target remains unverified, as in M0. No campus meshes were added.
- `reference/tour/locations.md`, `reference/tour/tour_graph.json`, `reference/photos/COVERAGE.md` and 132 per-location manifests exist. Both reference workflows completed without an access block; no blocked report was needed.

## Tour and reference findings

Panora viewer: https://tours.panoraproperties.com/FAST-LHR/index.htm

The same host's robots.txt returned 404. Headless Chromium reached the viewer (HTTP 200), followed the observed script/locale config paths, and saved the raw files privately. Requests were rate limited to at most one per 1.1 seconds. Downloaded scripts were parsed as literal AST data, never evaluated by the extraction scripts.

- **94 named scenes, 231 unique directed links**, every target resolving. Links come from explicit scene adjacency and hotspot playlist actions, not playlist order. Raw adjacency includes duplicate targets; the final graph deduplicates them. Config extraction does not require full scene screenshots or a UI crawl.
- **17 distinct seed entities mapped**, including all six blocks. **34 scenes remain NEW/unresolved**, and **115 seed entities have no uniquely mapped scene**. A block-level match does not establish room-level coverage. Scene titles are source assertions, not measurements.
- Only **G2 (Campus Gate 2)** was appended to the seed: confidence estimated, source tour, position null, heading unknown. Existing map-derived entities were preserved. No gate equivalence or coordinates were inferred.
- Tour titles mention Block A basement/first-floor corridors and Library first floor/research/conference rooms, beyond the seed's limited inventory. These are questions for owner confirmation, not invented floor counts or layouts. Unnamed basements, laboratories, cafes, gym, Love Garden and fountain plaza remain unresolved.
- **44 small tour thumbnail previews** were collected and inspected in a private contact sheet. Manifests record exact source URL, unknown license, reference-only use, and `usable_for_textures: false`. No panorama tile sets were downloaded or shipped. Thumbnails are not counted as adequate detail photographs: all **132 locations** are flagged `needs_owner_photo: true` with a shot list.
- All raw config, reports and previews remain in ignored reference directories. No reference imports, photos, tour config or source scripts are included in the application build. The repository still permits only `reference/maps/student-map.png` as a tracked reference input.

## Validation contract and limits

`npm run validate:campus` always checks the seed, and also checks `data/campus.json` in curated mode when that file exists. An explicit path is curated by default; append `--seed` to validate an incomplete inventory. Invalid JSON/schema or any semantic error returns exit code 1.

Seed mode permits null geometry, absent gate headings, room polygons not yet supplied, and unpositioned self-only seed stairs as warnings. It does **not** downgrade invalid supplied polygons, overlaps, out-of-bounds spaces/buildings, area violations, duplicate IDs or unresolved references. Curated mode rejects incomplete spatial data and missing floor links. Placeholder confidence remains a warning, consistent with CAMPUS_SPEC; public release acceptance is a later decision.

Floors are scoped by building, entries by building and connector IDs by floor; other entity IDs and space IDs are global. Adjacent floor records require reciprocal connectors of the same kind. Polygon checks accept implicit closure and boundary contact but reject repeated closing points, self-intersections and positive-area overlaps. Complete polygon difference tests catch concave-boundary excursions. Room polygons follow the spec's shared world X/Z coordinate frame. Boundary area uses 12.5 acres ±15% whenever the boundary exists; M2 still owns supplying/calibrating it.

Optional `data/tasks.json` and `data/npcs.json` do not exist yet. When present, the CLI audits unique record IDs and recursively checks explicit campus-reference keys: `refs`, `location`, `locations`, `anchor`, `anchors`, `locationAnchor(s)`, `spawnAnchor(s)`, `targetAnchor(s)`, and `anchorId(s)`, `buildingId(s)`, `roomId(s)`, `departmentId(s)`. `location` objects may contain nested reference keys. Full task/NPC behavior schemas belong to their later milestones; any new reference fields must be added to the audit when those schemas are authored.

CAMPUS_SPEC names PropGroup without defining it. M1 accepts the existing empty props list and rejects nonempty prop records with an explicit contract error. No arbitrary fields or coordinates were invented. The question is recorded in OPEN_QUESTIONS #26.

## Reproduce the private reference workflow

Run each step only after inspecting the preceding result. Stop if access fails or a blocked report is written; do not try alternate routes.

```sh
node scripts/tour-recon.mjs
node scripts/tour-fetch-config.mjs
node scripts/tour-fetch-config.mjs --device
node scripts/tour-parse-config.mjs
node scripts/tour-inventory.mjs
node scripts/collect-reference-previews.mjs
node scripts/review-reference-previews.mjs
```

The network scripts stop and write a private blocked report if access fails. `tour-recon.mjs` also conservatively stops if a robots file contains restrictions requiring review. Inventory insertion is idempotent: it does not duplicate G2. Photo coverage counts downloaded files only. M1's committed report records the outcome because private outputs remain gitignored.

Additional evidence: `test-results/m1-data-foundation.png` (generated and ignored). The production bundle retains Vite's existing chunk-size advisory; download size remains below the architecture budget.
