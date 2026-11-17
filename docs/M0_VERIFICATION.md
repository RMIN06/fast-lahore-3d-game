# M0 verification — 2026-10-25

- Read AGENTS.md, its six ordered documents, and the remaining asset/reference workflow documents before implementation.
- Added Vite, React 18, strict TypeScript, React Three Fiber, Drei, Zustand, Vitest, Playwright, ESLint, and Prettier with an npm lockfile.
- Added the architecture's folder layout and commands, a procedural ground/cube test scene, and a development-only renderer sampler and overlay with a spin toggle.
- Standard checks pass: typecheck, lint, unit tests, and the explicitly limited M0 seed-readability check. Formatting and the production build pass.
- Chromium smoke test checks canvas rendering, live draw calls/triangles, the spin checkbox, actual image changes when rotation resumes, stable pixels while paused, and absence of console errors and uncaught exceptions.
- Screenshot: `test-results/m0-scaffold.png` (generated, ignored by Git); inspected visually.
- Renderer sample: 30 FPS, 2 draw calls, 14 triangles in headless full Chromium using ANGLE / Intel UHD Graphics / Direct3D11, 1280 × 720. Browser screenshot operations reduce measured FPS; this is not the specified 1080p Iris Xe reference-laptop benchmark. The 60 FPS target remains unverified on that hardware.
- Production JS excludes the development overlay and sampler. The initial JS bundle is about 967 kB uncompressed / 268 kB gzip; Vite reports its default 500 kB chunk advisory. It is well below the initial download budget.
- Git ignore rules exclude private references, including additional map files, while allowing only the supplied student-map input. No external runtime assets ship. npm audit reports zero vulnerabilities.
- M1 schemas, spatial validation, tour recon, and reference collection were not started. Navmesh generation explicitly exits with an M9 notice. No campus facts were assumed or edited; scaffold decisions are recorded in DECISIONS.md.
