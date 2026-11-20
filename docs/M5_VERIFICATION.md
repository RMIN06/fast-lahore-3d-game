# M5 — Time, sky, lighting: accepted

Date: 2026-11-20. **M5 acceptance passed. M6 has not started.**

## What was built

| Item              | Implementation                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Game clock        | `GameClock` in `src/systems/time.ts`: one game minute per real second at ×1, so a full day takes 24 real minutes (GAMEPLAY_SPEC §4). Speeds ×0.5, ×1, ×2 and ×4; pause; set time and day. Starts Monday 08:30 (OPEN_QUESTIONS #20 default). One shared clock (`src/state/clock-store.ts`) is advanced by the renderer and published to React 4 times a second                        |
| Weekday logic     | Day rolls over at midnight, Sunday to Monday. The day type is classes (Mon–Fri), light activity (Sat) or campus quiet (Sun), shown in the HUD. `isGateOpen()` reads each gate's `opens` rule from campus data: the Masjid-side gate opens only Friday 12:45–14:00 (Jummah). Its leaf hides and its physics barrier is disabled while open. Gates without an `opens` rule stay closed |
| Sun and moon      | Sunrise 06:00 in the east, due south at midday, sunset 18:30 in the west (spec). Noon elevation 58° (equinox at Lahore). The moon and moonlight are opposite the sun at night                                                                                                                                                                                                        |
| Sky               | drei `Sky` (a physically based sky shader) follows the sun. drei `Stars` and a moon sphere appear at night                                                                                                                                                                                                                                                                           |
| Fog and exposure  | Fog and tone-mapping exposure blend between day, dusk and night colours                                                                                                                                                                                                                                                                                                              |
| Shadows           | The sun casts shadows (2048² map, an 80 m box that follows the player, snapped to an 8 m grid to avoid shimmer). Buildings, walls, gate leaves and lamp poles cast them; ground surfaces receive them. Sun shadows switch off at night                                                                                                                                               |
| Lamp posts        | Placed procedurally from campus data, about 20 lamps: outside each entrance, inside each gate, and along the edges of path areas every 22 m. They switch on at dusk (sun below 3°) with glowing heads and soft light pools on the ground. **Positions are placeholders** (OPEN_QUESTIONS #40). Three instanced draw calls                                                            |
| Window glow       | Procedural window bands, one per facade edge per above-ground floor, with a pane pattern. Dark glass by day, warm light at dusk. No windows on shared walls (such as the C/D split). One draw call                                                                                                                                                                                   |
| Night readability | A moonlit blue ambient light, moonlight, lit windows and lamp pools                                                                                                                                                                                                                                                                                                                  |
| Time panel (T)    | `src/ui/TimePanel.tsx`: pause/resume, ×0.5–×4, and set day and time. **T** or **Esc** closes it. While it is open, input switches to the menu layer (no movement) and the mouse is released                                                                                                                                                                                          |
| HUD               | `src/ui/Hud.tsx`: weekday and time, speed or "paused", and the day type                                                                                                                                                                                                                                                                                                              |

The lighting maths is pure and unit tested (`lightingAt()`, `sunAt()`). `src/game/Environment.tsx` applies it, recomputing only when game time moves on by a quarter minute, with no allocation per frame.

## Acceptance

| Check (MILESTONES.md)                      | Result                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A full cycle runs in 24 real minutes at ×1 | Unit test: 24 real minutes advance exactly one day. E2E: about 6 game minutes pass in 6 real seconds                                                                                                                                                             |
| Pause, speed and set-time work             | Unit tests, plus an e2e test through the panel: pause holds the clock, ×4 moves at least 10 game minutes in 4 s, and setting Fri 13:10 updates the HUD                                                                                                           |
| Night is readable with lights              | E2E brightness check of the overview at 21:30: mean brightness **0.059** (noon 0.46), above the 0.04 "not black" floor. Bright pixels (windows, lamps) cover 0.43% of the frame. Reviewed visually: moonlit facades, lit windows, lamp pools, stars and the moon |
| Frame budget holds with shadows            | 35–43 draw calls and about 7,000–8,000 triangles across noon, dusk and night, in both first-person and overview views (budget: 400 calls / 1.5 M triangles)                                                                                                      |

## Bugs found and fixed

- **Keyboard after clicking an overlay checkbox:** the player's key handler ignored keys whose target was any `<input>`, so T and WASD stopped working after clicking an overlay checkbox. It now ignores only text-entry fields.
- **Stale time panel:** the panel's fields were filled once at app start. The panel body now mounts only while open, so it always shows the current game time.

## Verification

- Typecheck, ESLint, 114 unit tests, campus validation (0 errors) and the production build (5.5 MB, 2.0 MB gzip) pass.
- All four Chromium e2e tests pass: time, player, scene overview and tracer.
- Headless software rendering runs at about 9–18 FPS with shadows. The 60 FPS target on the reference laptop at 1080p is still unverified on real hardware.
