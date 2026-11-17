# PRD — FAST Lahore Campus Game

## 1. Vision
A realistic, single-player 3D simulation of student life at FAST NUCES Lahore, playable in a desktop browser. The player registers with a roll number and department, spawns at that department, and can freely walk the whole campus — outdoors and inside every block — doing everyday campus activities.

The defining quality is **location fidelity**: layout, block placement, paths, gates, room numbering and floor contents should match the real campus as closely as the available source data allows.

## 2. Scope (v1)
**In**
- Whole campus: Blocks A (Admin), B (Civil), C (CS), D (Electrical & Management), E (Library), F (New Building), Masjid, gates, Highway path, lawns, cricket ground, futsal, basketball, badminton, table tennis, parking, cafes, shops.
- Walkable interiors for every block (basements, floors, corridors, labs, classrooms, common rooms, library, auditorium, seminar hall, medical centre, cafes).
- First- and third-person camera, switchable at any time.
- Day/night cycle with matching lighting, lamps and NPC behavior.
- NPC students, faculty and staff with timetable-driven behavior.
- All task types in `GAMEPLAY_SPEC.md` (educational and fun) and campus mini-games.
- Custom male and female characters; campus audio.
- Fictional registration (roll number, department, avatar) with local save.

**Out (explicit non-goals)**
- Progression of any kind: XP, levels, unlocks, achievements, persistent scores.
- Multiplayer, backend, real authentication, real FAST student data.
- Mobile, touch, gamepad, VR.
- Off-campus areas.

## 3. Platform and targets
- Desktop browsers: current Chrome, Edge, Firefox. WebGL2.
- Performance: 60 FPS on a mid-range laptop (integrated GPU such as Intel Iris Xe, 1080p, medium preset). A low preset must hold 30 FPS.
- First playable load: under 15 s on 50 Mbps; interiors stream in on demand.

## 4. Fidelity policy (honesty about the data)
Every spatial element carries a `confidence`:
| Level | Meaning |
|---|---|
| `measured` | Taken from drawings or on-site measurement |
| `traced` | Traced from satellite imagery at known scale |
| `estimated` | Derived from the student map, tour, or standard dimensions |
| `placeholder` | Invented to keep the build playable; must be replaced |

Dev mode can color the world by confidence so gaps are visible. Release readiness requires no `placeholder` in publicly visible areas, or an explicit decision to accept it.

## 5. Player flow
1. Title screen -> Register (roll number, display name optional, department, avatar male/female + simple customization).
2. Loading -> spawn at the chosen department's main entrance (outdoors, ground level) at the saved/start time.
3. Free exploration with context prompts, phone menu (map, timetable, messages, task list), and interactable places/NPCs.
4. Pause menu: save, settings (graphics preset, volume, controls), time controls (pause/speed/set time), exit to title.
5. Returning player: Continue restores position, time and settings.

## 6. Success criteria
- A student who knows the campus can walk from Gate-5 to their department and recognize the route.
- Every room/lab named on the source map exists, is reachable, and carries the correct label.
- Every task in `tasks.json` can be started and completed in-game.
- All milestones' acceptance checks pass; performance targets hold.

## 7. Risks
- **Spatial data gap:** the student map is schematic and not to scale; the tour is imagery only. Mitigation: satellite-based calibration, tracer tool, confidence levels, OPEN_QUESTIONS.
- **Interiors:** exact floor plans do not exist in the sources. Mitigation: generate corridor-and-rooms layouts from the left/right/front/middle notes; replace with real plans or photos when available.
- **Legal:** FAST name/logo and Panora imagery. Mitigation: private reference only; ask permission before public release.
- **Scope size:** whole campus with all interiors is large. Mitigation: milestone order delivers a playable exterior first, then interiors block by block.
