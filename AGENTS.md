# AGENTS.md — Rules for Codex

Project: **FAST Lahore 3D Campus Game** — a single-player, realistic, browser-playable 3D walkthrough of the FAST NUCES Lahore campus (Faisal Town, Block-B) with NPCs, tasks and mini-games.

## Read first (in order)
1. `docs/PRD.md` — what we are building and what we are NOT building
2. `docs/ARCHITECTURE.md` — stack, folders, systems, performance budget
3. `docs/CAMPUS_SPEC.md` — world data schema and coordinate system
4. `docs/GAMEPLAY_SPEC.md` — registration, controls, time, tasks, mini-games, NPCs
5. `docs/MILESTONES.md` — work through milestones **in order, one at a time**
6. `docs/OPEN_QUESTIONS.md` — unresolved facts; do not guess them

## Hard rules
1. **Data-driven world.** No building, room, gate or task coordinates in code. Everything comes from `data/campus.json` (seeded from `data/campus.seed.json`) and `data/tasks.json`.
2. **Never invent facts about the real campus.** If a measurement, room position or floor count is missing, use a clearly marked placeholder (`confidence: "placeholder"`) and add an entry to `docs/OPEN_QUESTIONS.md`. Placeholders must be visually obvious in debug mode.
3. **Units are meters.** Y is up. See `docs/CAMPUS_SPEC.md` for axes and origin.
4. **One milestone at a time.** Stop when a milestone's acceptance checks pass. Do not start the next milestone unprompted.
5. **Before finishing any task run:** `npm run typecheck && npm run lint && npm test && npm run validate:campus`. Fix failures; do not disable checks.
6. **No progression systems.** No XP, levels, unlocks, achievements or persistent scores. Mini-game scores exist only within a session.
7. **No multiplayer, no backend, no accounts.** Registration is fictional and stored in `localStorage` only.
8. **Desktop only.** Keyboard + mouse. Do not spend time on touch or gamepad.
9. **Third-party content.** Everything under `reference/` is private study material: it is gitignored (except `reference/maps/student-map.png`, which is the project's own site-plan input), must never be imported by the app, and must never be copied into `public/`. Every asset that ships must be logged in `docs/ASSET_LICENSES.md` with source and license (CC0 / CC-BY / own work). No ripping the Panora panoramas into the build.
10. **Performance budget is a requirement**, not a nice-to-have (see ARCHITECTURE.md). Check FPS and draw calls in the dev overlay after each rendering change.
11. **Commits:** small, one logical change each, message format `M<n>: <what>`.
12. **Ask rather than assume** when a decision would be expensive to reverse (stack changes, schema changes). Otherwise decide, note it in `docs/DECISIONS.md`, and continue.

## Conventions
- TypeScript strict, no `any` without a comment explaining why.
- React Three Fiber components are thin; logic lives in plain TS modules under `src/systems/` so it can be unit tested.
- Schema validation with Zod at load time; fail loudly with the offending path.
- Dev-only tools live under `src/dev/` and are tree-shaken from production.
- Prefer instancing and shared materials; no per-frame allocations in hot loops.
- Every system exposes a debug toggle in the dev overlay (collision shapes, navmesh, room labels, confidence colors).

## Definition of done (any task)
Typecheck, lint, tests and campus validation pass; the dev server runs without console errors; the feature is demonstrable in the browser; docs updated if behaviour or schema changed.
