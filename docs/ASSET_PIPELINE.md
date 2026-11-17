# ASSET_PIPELINE

How raw material becomes shipped assets. Codex builds the code and procedural pieces; models, textures and audio that need creative tools are split between Codex (procedural/automated) and the owner (Blender, recording).

## 1. Site plan -> footprints (Codex + owner)
1. Owner supplies a satellite capture (see OPEN_QUESTIONS) or OSM export is used.
2. Codex builds `src/dev/tracer`: loads an image, takes two or more reference-distance clicks to set scale, lets the owner click polygon corners for the boundary, each block, courts/grounds, paths, lawns, gates and entry points, and exports meters-based JSON merged into `campus.json`.
3. `validate:campus` checks the area sanity range and overlaps.
4. Compare against the student map's relative layout; fix mismatches by consulting the owner.

## 2. Buildings
- **Exterior (procedural):** extrusion from footprint, facade materials from shared atlas (brick, marble trim, glass, concrete), windows by rhythm, entry doors from `entries`, marble domes/parapets from `features`.
- **Hero upgrades (owner/Blender, optional):** replace the exterior of F Block, the C Block entrance, the Masjid and the Library with modeled glTF. Export glTF 2.0, meters, Y-up, origin at building footprint centroid, named nodes (`walls`, `glass`, `roof`), Draco/meshopt compressed, KTX2 textures.
- **Interiors (procedural first):** per floor, corridor spine plus rooms by side and order from the spec; stairs at connectors; door plates with real codes; ceiling lights; classroom/lab furniture instanced. Replace per floor via `Floor.glb` when real plans/photos exist.

## 3. Props and nature
Instanced benches, lamp posts, trees, shrubs, bike racks, car/bike models, goalposts, hoops, nets, table tennis table, library shelves and desks, cafe counters. Source from CC0 libraries (e.g. Poly Haven, Kenney, Quaternius) or build simply in code/Blender. Log every one in `docs/ASSET_LICENSES.md`.

## 4. Textures
Tileable PBR sets (brick, marble, floor tile, grass, asphalt, paving, concrete, paint, wood) from CC0 sources (Poly Haven, ambientCG) or own photography of campus surfaces taken by the owner (best for authenticity: brick and floor tile close-ups). Convert to KTX2. Never use scraped photos as textures.

## 5. Characters
- Two base bodies, male and female, realistic proportions, around 15-25k triangles with 2 LODs, shared skeleton.
- Options: model/rig in Blender, or start from a permissively licensed base (e.g. MakeHuman CC0 output, or other assets whose license allows redistribution in a web game), clothing/hair variants as swappable meshes.
- Animations: idle, walk, run, jump, sit, stand-up, talk gestures, kick, swing, throw, wave, eat/drink. Retarget from a license-compatible library (check terms; Mixamo animations are permitted in games under Adobe's terms but cannot be redistributed as standalone assets) or author in Blender.
- Export glTF with the shared skeleton; NPC variety via outfit/hair/skin variants rather than new bodies.
- Until delivered, M4-M7 use a capsule placeholder with the correct height.

## 6. Audio
- Ambient loops and one-shots: birds, crickets, footsteps (grass, paving, tile, stairs), doors, cafe chatter, library hush, ball impacts, bell, Azaan/Jummah cue.
- Sources: CC0 (Freesound CC0 filter, Sonniss GDC bundles are royalty-free), procedural Web Audio for wind and room tone, and real campus recordings by the owner (phone recordings of lawn, Highway, cafe, corridor, courts give the most authentic result).
- Encode to Ogg/MP3; loop-safe; normalize to -16 LUFS; keep total under 40 MB.
- Religious audio (Azaan): use properly licensed or own recordings, and treat it respectfully (no looping gimmicks, correct timing).

## 7. Licensing log
`docs/ASSET_LICENSES.md` columns: asset, file path, source URL, license, attribution text, date added. CI check fails if a file in `public/` is not listed.

## 8. Optimization checklist
Merge static meshes per material, instance repeated props, KTX2 textures, meshopt/Draco compression, texture atlases for facades, LODs for characters and far buildings, baked AO only for hero spaces, test against the performance budget in ARCHITECTURE.
