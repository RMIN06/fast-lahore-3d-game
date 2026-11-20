# ARCHITECTURE

## 1. Stack (decided)
| Concern | Choice |
|---|---|
| Build | Vite, TypeScript (strict), Node 20+ |
| UI shell | React 18 |
| 3D | three.js via @react-three/fiber + @react-three/drei |
| Physics | Rapier via @react-three/rapier (WASM) |
| Character control | Kinematic capsule controller (Rapier) |
| Navigation | recast-navigation (`@recast-navigation/three`) navmesh + crowd |
| State | Zustand (game state), plain TS modules for logic |
| Validation | Zod |
| Audio | Howler.js + Web Audio positional zones |
| Sky/lighting | Procedural sky shader, sun + moon directional lights, hemisphere light |
| Tests | Vitest (unit), Playwright (smoke + screenshot) |
| Hosting | Vercel (static) |

No backend. Persistence is `localStorage`.

## 2. Repo layout
```
/AGENTS.md
/data/            campus.seed.json, campus.json (generated/curated), tasks.json, npcs.json, dialogue/*.json
/docs/            these documents
/reference/       private study material (gitignored except maps/student-map.png)
/public/          shipped assets only: models/, textures/, audio/, draco/
/scripts/         validate-campus.ts, build-navmesh.ts, bake tools, tour-recon (see TOUR_RECON.md)
/src/
  app/            App shell, routes: Title, Register, Game
  world/          loaders and builders (campus loader, footprint->mesh, interior generator, props, terrain)
  systems/        pure TS logic: time, npc-schedule, tasks, interaction, save, input-map, audio-zones
  game/           R3F components: Player, CameraRig, Campus, Interiors, Npcs, Sky, MiniGames
  minigames/      one folder per mini-game (futsal, cricket, basketball, badminton, tabletennis, bookhunt, labdebug, quiz)
  ui/             HUD, Phone, Pause, Registration, Dialogue, Prompts
  dev/            debug overlay, tracer tool, confidence view, navmesh viewer
  state/          zustand stores
  types/          shared types generated from the Zod schema
```

## 3. Data flow
`campus.seed.json` -> (tracer + recon + curation) -> `campus.json` -> Zod validation -> world builders -> scene graph + Rapier colliders + navmesh.
Gameplay data (`tasks.json`, `npcs.json`, `dialogue/`) references campus IDs (anchors, rooms, buildings); the validator checks every reference resolves.

## 4. World construction
- **Terrain:** flat ground plane with grass/paved/road zones from polygons in the spec. Real campus is near-flat; elevation is 0 except basement ramps.
- **Buildings (exterior):** footprint polygon extruded by `floors x floorHeight`, facade material by building, window/door placement from `entries` and generated rhythm, parapet/domes added where the spec says (`features: ["marble_dome"]`). Hero upgrades via glTF override per building.
- **Interiors:** generated per floor from the floor spec: a corridor spine plus rooms on `left/right/front/middle` sides. Stairs and lifts connect floors at spec'd anchors. Room labels are real signage meshes (`NB-201`). A glTF override per floor is allowed.
- **Interior streaming:** interiors are separate chunks. Load a building's interior when the player is within 25 m of an entry or inside; unload when 60 m away. Only the player's building (and the floor above/below) is fully active.
- **Props:** benches, trees, lamp posts, bike racks, signage via instanced meshes from a placement list in the spec.
- **Collision:** simplified static colliders generated from footprints, walls and room partitions (never from render meshes). Trimesh only for hero models and only when necessary.
- **Navmesh:** built offline by `scripts/build-navmesh.ts` from collider geometry, as one multi-level navmesh: floors connect through the walkable stair ramps and doorways, with no off-mesh links (DECISIONS M9). The output is `public/navmesh/campus.bin`, checked against an input hash by a unit test.

## 5. Rendering and lighting
- Day/night: `timeOfDay` (0-24) drives sun/moon angle and color, sky shader, fog, exposure, street/interior lights, window emissives.
- Shadows: sun shadows with 2 cascades near the player, interiors use cheap contact shadows or baked AO.
- Baked AO/lightmaps are added in the realism milestone for hero spaces only.
- Materials: shared PBR atlas materials (brick, marble, tiles, paint, glass). KTX2/Basis textures, Draco/meshopt for models.
- LOD: far buildings use simplified meshes; far props culled; NPCs have 3 LOD levels.

## 6. Core systems
- **Time:** one in-game day = 24 real minutes by default (configurable). Exposes `timeOfDay`, `weekday`, pause and speed.
- **Input map:** single mapping table (see GAMEPLAY_SPEC) with context layers (explore, dialogue, minigame, menu). Pointer lock in explore.
- **Interaction:** raycast from camera center + proximity zones -> a prompt (`E`) with a typed action (open door, sit, talk, use, start task).
- **Tasks:** declarative definitions (`tasks.json`) executed by a small state machine; tasks have start conditions (place, time window), steps and completion events. No rewards, only completion state within a session.
- **NPCs:** agent = archetype + schedule + current goal. Near the player: full navmesh agents with animation (cap ~60). Far away: abstract state (location + timer) that materializes when the player approaches.
- **Audio:** ambient zones (outdoor lawn, Highway, cafe, library hush, corridors, masjid area, night crickets), footsteps by surface, positional one-shots, Azaan/Jummah cue near the masjid at Jummah time.
- **Save:** `{ version, profile, position, timeOfDay, settings }` in `localStorage`; versioned migrations.

## 7. Performance budget
| Metric | Budget |
|---|---|
| Frame rate | 60 FPS target, 30 FPS floor on low preset |
| Draw calls (visible) | <= 400 outdoors, <= 250 indoors |
| Triangles (visible) | <= 1.5 M outdoors, <= 800 k indoors |
| Active physics bodies | < 150 dynamic |
| Active NPC agents | <= 60 |
| JS heap | < 800 MB |
| Initial download | < 40 MB; total streamed < 300 MB |

A dev overlay shows FPS, draw calls, triangles, memory and active chunk list. Regressions against the budget fail the milestone.

## 8. Dev tools (under `src/dev/`)
- **Tracer:** top-down page that overlays a satellite image, lets the owner click polygon corners/doors/gates, and exports `campus.json` fragments in meters (see ASSET_PIPELINE).
- **Confidence view:** colors geometry by `confidence`.
- **Collision/navmesh viewers**, **room label overlay**, **teleport-to-anchor** list, **time scrubber**.

## 9. Build and deploy
`npm run dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `validate:campus`, `build:navmesh`. Vercel deploys the static `dist/`. `reference/` and `scripts/` are never deployed.
