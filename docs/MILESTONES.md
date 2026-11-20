# MILESTONES

Work in order. Each milestone ends when every acceptance check passes. Stop and report after each.
Standard check set: `npm run typecheck && npm run lint && npm test && npm run validate:campus`.

---
## M0 — Scaffold
**Do:** Vite + React + TS strict app; R3F scene with ground and a spinning cube; Zustand; Vitest; Playwright smoke test; ESLint/Prettier; dev overlay (FPS, draw calls, triangles); scripts from ARCHITECTURE section 9; `.gitignore` (reference/ except `reference/maps/`); folder layout.
**Accept:** `npm run dev` shows the scene with the overlay; standard checks pass; Playwright smoke test loads the page without console errors.

## M1 — Campus data foundation
**Do:** Zod schema from CAMPUS_SPEC; loader; `validate:campus` script; load `data/campus.seed.json`; run TOUR_RECON and REFERENCE_COLLECTION (report if blocked); generate `docs/OPEN_QUESTIONS.md` additions.
**Accept:** seed validates (warnings for null footprints allowed); a unit test proves each validation rule catches a deliberately broken fixture; `reference/tour/locations.md` and `reference/photos/COVERAGE.md` exist (or a blocked-report is written).

## M2 — Calibrated site plan and tracer
**Do:** `src/dev/tracer` per ASSET_PIPELINE; owner traces boundary, blocks, courts, grounds, gates; export to `data/campus.json`; add area sanity check.
**Accept:** boundary area within 12.5 acres +/-20% (widened from +/-15% on 2026-11-20: the walled campus measures about 10.5 acres; see DECISIONS.md); all six block footprints, gates, ground/courts/parking/lawn/path polygons are non-null; top-down debug view shows the layout and its relative arrangement matches `reference/maps/student-map.png`.
**Needs owner:** satellite capture and tracing session (about 30-60 minutes).

## M3 — Exterior greybox
**Do:** terrain/surfaces from areas; boundary wall; buildings extruded at `floors x height`; gates; paths/Highway; entry markers; labels; block color by confidence; static colliders generated from footprints.
**Accept:** orbit camera shows the whole campus; each block has the right floor count (A: unknown -> placeholder, B 3 above ground plus basement, C 3 plus basement, D 3 plus basement, F 4 above plus 2 basements); draw calls within budget.

## M4 — Player controller
**Do:** Rapier kinematic capsule; WASD/sprint/jump; pointer lock; first/third-person with V; collision-aware camera arm; stairs/ramp handling; capsule placeholder with correct heights; input-map with context layers.
**Accept:** player cannot pass through buildings or boundary; V switches camera instantly; sprint/jump work; walk from Gate-5 to each block entrance; Playwright test drives movement and asserts position change; no tunneling at sprint speed.

## M5 — Time, sky, lighting
**Do:** time system; sky, sun/moon, fog, exposure; lamp posts and window glow at dusk; time panel (T); weekday logic.
**Accept:** a full cycle runs in 24 real minutes at x1; pause/speed/set-time work; night is readable with lights; frame budget holds with shadows.

## M6 — Registration, save, spawn, HUD shell
**Do:** Title -> Register (roll no soft validation, name, department, avatar male/female + customization UI using placeholder body); spawn at department anchor; save/continue; HUD, pause menu, phone shell (map, timetable stub, tasks stub); settings (graphics preset, volume).
**Accept:** each department spawns at its anchor; reload + Continue restores position/time/settings; roll number format warning appears for invalid input without blocking; schema-versioned save with a migration test.

## M7 — Interiors (block by block)
**Do:** interior generator from floor specs; stairs/lifts; door plates; room labels; interior streaming; entry transitions. Order: **F, D, C, B, A, E (Library last, hero treatment)**. Each block is its own commit.
**Accept (per block):** every room in the seed exists with the right code and floor; every floor is reachable by stairs from the entrance; placeholders flagged in debug view; interior budget holds; Playwright test teleports to each room anchor and verifies the label.

## M8 — Characters and animation
**Do:** integrate male/female models and the animation set; outfit/hair/skin variants; first-person arms or hidden body policy; swap capsule placeholder; animation state machine (idle/walk/run/jump/sit/kick/swing).
**Accept:** both avatars play all required animations; no foot sliding beyond tolerance; 3 LODs; asset licenses logged.
**Needs owner:** the character models/animations (see ASSET_PIPELINE section 5).

## M9 — Navmesh and NPCs
**Do:** `build:navmesh` outdoors + per floor with door/stair links; NPC agents with archetypes and schedules; abstract far simulation; density by time; collision avoidance; queues at cafe/library desk; guard/shopkeeper/staff NPCs.
**Accept:** NPCs walk gate -> block -> class -> cafe without getting stuck over a simulated 24 h run (headless test); <= 60 active agents; frame budget holds at peak density.

## M10 — Interaction and tasks
**Do:** interaction raycast and prompts; doors, sit/stand, dialogue UI; task engine and `tasks.json` with all tasks in GAMEPLAY_SPEC section 6; phone Tasks/Timetable/Messages; friend NPC meetups.
**Accept:** each task can be started and completed in-game (scripted Playwright run per task); task references all validate; no progression/score persistence anywhere.

## M11 — Mini-games
**Do:** futsal/football (3v3/5v5 and penalties), cricket, basketball, badminton, table tennis, plus book hunt, lab puzzle, class quiz. Each isolated module with its own input layer.
**Accept:** each mini-game starts, plays, ends and exits cleanly; rule logic unit tested; Esc always exits; no leaked listeners or physics bodies after exit.

## M12 — Audio
**Do:** zone ambiences by time, footsteps by surface, positional one-shots, Jummah/Azaan cue at Friday Jummah time with the Masjid gate opening, mixer and volume settings.
**Accept:** audio changes with location/time; Jummah event triggers at the configured time; total audio payload under 40 MB; all files in the license log.

## M13 — Realism pass
**Do:** photo-informed facades and signage, shared PBR material sets, hero model swaps, props density, baked AO for hero spaces, decals (notice boards, posters), replace as many `placeholder` items as the owner's data allows.
**Accept:** side-by-side review with the Panora tour for each block; placeholder list reduced and documented; budget still holds.

## M14 — Performance, polish, release prep
**Do:** low/medium/high presets; LOD and streaming tuning; loading screen; error handling; credits (including map author); controls help screen; deployment to Vercel; release checklist.
**Accept:** 60 FPS target on the reference laptop at medium; 30 FPS at low; load time within budget; no console errors in a 30-minute soak; legal checklist (permissions, licenses, attributions) completed.
