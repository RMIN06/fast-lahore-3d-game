# GAMEPLAY_SPEC

Tone: realistic simulation. No progression (no XP, levels, unlocks, achievements, persistent scores).

## 1. Registration and spawn
Fields: **Roll number** (required), **Display name** (optional), **Department** (required dropdown), **Avatar** (male/female + skin tone, hair, outfit color).
- Roll number is cosmetic and fictional. Soft-validate against the FAST pattern `^\d{2}L-\d{4}$` (e.g. `23L-1234`) and warn, do not block, if it differs.
- Nothing leaves the browser. Stored in `localStorage` under a versioned key.
- Department -> `Department.spawnAnchor` in `campus.json`: the player spawns outdoors at that department's main entrance, ground level, at the start time (default 08:30 on a weekday).
- Proposed mapping (confirm in OPEN_QUESTIONS): Computer Science and related programs -> C Block; Civil -> B Block; Electrical -> D Block; Management -> D Block (2nd floor is the Management floor).

## 2. Controls (desktop)
| Input | Action |
|---|---|
| W A S D | Move |
| Mouse | Look (pointer lock) |
| Shift | Sprint (hold) |
| Space | Jump (small, disabled indoors) / context action where a mini-game says so |
| V | Toggle first/third person |
| E | Interact (doors, sit/stand, talk, use, start task) |
| Left mouse | Primary action in mini-games (kick, swing, shoot, serve) |
| Right mouse | Secondary action (pass, aim, block) |
| Hold Left mouse | Charge power in mini-games |
| F | Flashlight/phone light at night |
| P | Phone (map, timetable, messages, tasks) |
| M | Campus map (full screen) |
| T | Time panel (pause, speed, set time) |
| Esc | Pause menu / release pointer lock / exit mini-game |
| 1-9 | Dialogue options / menu choices |
Controls live in one table in `src/systems/input-map.ts`, layered by context (explore, dialogue, minigame, menu); inputs never conflict across layers. Rebinding is a stretch goal.

## 3. Cameras
- First person: eye height 1.65 m (male) / 1.58 m (female), head bob subtle, FOV 75.
- Third person: shoulder-follow, collision-aware spring arm, character visible, FOV 65.
- Switch is instant, preserves facing. Indoors the third-person arm shortens to avoid clipping walls.

## 4. Time and day/night
- 24 in-game hours = 24 real minutes by default (1 real minute = 1 in-game hour). Adjustable in the time panel (pause, x0.5, x1, x2, x4, set time).
- Sunrise ~06:00, sunset ~18:30 (adjustable by season setting, stretch). Dusk/dawn transitions, stars/moon at night.
- Lights: lamp posts, corridor lights and window glow switch on at dusk; interiors keep consistent artificial lighting.
- Weekdays matter: Monday-Friday classes; Saturday light activity; Sunday campus quiet (guards only).
- **Jummah:** Fridays around 13:10 (per the campus map) the gate by the Masjid opens, the Azaan plays, and NPCs flow toward the Masjid. At other times that gate is closed.
- Night: very few NPCs (guards, a few late students), cafes closed.

## 5. HUD and phone
- HUD: crosshair/dot (first person), interaction prompt, time and weekday, small compass, active task line.
- Phone (P): **Map** (current position, block labels), **Timetable** (generated class schedule for the player's department), **Messages** (friend NPCs invite you to meet), **Tasks** (list of available/active tasks), **Settings shortcut**.

## 6. Tasks (all data-driven in `data/tasks.json`)
Each task: id, title, description, location anchor(s), time window, steps, completion condition. Completion is session state only.

**Educational / daily life**
- Attend a class: go to your timetable room, sit, a short NPC lecture with a quick multiple-choice question.
- Library visit: find a book by shelf code, borrow it at the desk, study at a desk (quiet zone rules).
- Library book hunt: timed search by call number (also a mini-game).
- CS lab session: sit at a lab PC, solve a short debugging puzzle.
- Submit an assignment at the Academic Office (F Block, 1st floor).
- Visit a faculty office (F Block, 1st floor) during office hours.
- Print/photocopy notes at the Book PhotoCopy shop.
- Medical Centre visit (C Block, ground floor) - short scripted interaction.
- Attend a society event or talk in the Auditorium (C Block, ground floor).
- Seminar hall session (C Block, 2nd floor).

**Social / fun**
- Meet a friend: a friend NPC messages a time and place; show up and chat (dialogue tree), optional hangout actions (sit on lawn bench, grab a drink).
- Eat/drink: order at the F Block cafe, the New Cafe, or Fresh Friez (Gate-5 side); sit and eat.
- Play mini-games at the courts and grounds (below).
- Pray at the Masjid; attend Jummah on Fridays.
- Relax on lawn benches, wander the Highway path, people-watch.
- Arrive by bike/car: enter via Gate-3 and park (Basement-2 student car parking, bike parking).
- Campus explorer: visit named landmarks (no rewards, just a checklist in the phone).

## 7. Mini-games (all session-only scoring)
- **Futsal / football** (futsal court): 3v3 or 5v5 vs NPCs, 5-minute halves; penalty shootout variant. Left mouse charge-kick, right mouse pass, Shift sprint. Rapier ball physics.
- **Cricket** (cricket ground): batting vs a bowling NPC; timing-based swing, 2 overs.
- **Basketball** (court): free-throw and 60-second shootout.
- **Badminton** (court): 1v1 vs NPC rally, simple timing/aim.
- **Table tennis** (C Block basement): 1v1 vs NPC.
- **Library book hunt**, **CS lab debugging puzzle**, **class quiz**: described under tasks.
Each mini-game is an isolated module under `src/minigames/<name>/` with a start/stop interface, its own input layer, and its own tests for rule logic.

## 8. NPCs
- Archetypes: student (various looks), faculty, guard, cafe staff, librarian, medical staff, shopkeeper, friends (named, 4-6, with dialogue trees).
- Schedules derive from the timetable and campus hours: arrive via gates, walk between blocks via the Highway and paths, attend classes, eat, hang out, play, pray, leave.
- Density by time: peak between classes (10:00-13:00), light at early morning/evening, minimal at night.
- Behavior near the player: avoid collisions, queue at the cafe/library desk, idle animations (talking groups, phone use, sitting).
- Dialogue is scripted JSON trees; no live AI dependency in v1.

## 9. Audio
- Ambient layers by zone and time (birds in the day, crickets at night, Highway foot traffic, cafe chatter, library hush, corridor reverb, court sounds, ball impacts).
- Footsteps by surface (grass, paving, tile, stairs, carpet).
- Azaan/Jummah cue; class bell; door sounds; UI sounds.
- Sources: CC0/own recordings, plus procedural Web Audio for wind/room tone. The owner can record real campus ambience on a phone for authenticity; see ASSET_PIPELINE.

## 10. Characters
Two base bodies (male, female) with simple customization, a shared humanoid skeleton and animation set: idle, walk, run, jump, sit, stand-up, talk gestures, kick, swing (bat/racket), throw, wave, eat/drink. Characters are also reused for NPC archetypes via outfit/hair variants. See ASSET_PIPELINE.
