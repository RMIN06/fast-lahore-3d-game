# Asset licenses

| Asset                                                                           | File path                                            | Source URL         | License  | Attribution text                     | Date added |
| ------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------ | -------- | ------------------------------------ | ---------- |
| Procedural campus greybox (ground, surfaces, extruded blocks, wall, gate posts) | src/game/CampusScene.tsx, src/world/campus-meshes.ts | Local project code | Own work | FAST Lahore Campus Game contributors | 2026-11-20 |

The M0 test ground and cube (own work, 2026-10-25) were removed in M3. No external models, textures, audio, fonts, or files ship in `public/`. The private student map is not loaded by the app.

## Data sources (shipped from M3)

`data/campus.json` (the M2 site plan) contains geometry derived from the sources below. Since M3 the app bundles it and renders it. The scene footer shows the attribution. **Review these terms before any public release** (OPEN_QUESTIONS #36).

| Data                                                                                            | File path        | Source URL                                                                                            | License / terms                                                                          | Attribution text                                                       | Date added |
| ----------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| Boundary; A, B and E outlines; badminton; Masjid; C/D outline (split); Highway centreline guide | data/campus.json | https://www.openstreetmap.org/ (ways 323166057, 841040144–841040147, 841040150, 561233052, 561233053) | ODbL 1.0 (attribution and share-alike for derived databases)                             | © OpenStreetMap contributors                                           | 2026-11-20 |
| F outline, grounds, courts, parking, lawns, paths, gates (traced positions)                     | data/campus.json | https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer                          | Esri World Imagery terms of use; licence review required for tracing in a public release | Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community | 2026-11-20 |
