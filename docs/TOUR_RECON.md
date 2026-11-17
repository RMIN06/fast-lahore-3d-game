# TOUR_RECON — Extracting the campus inventory from the Panora tour

Goal: produce an exact inventory and connectivity graph of what the 360 tour shows (blocks, departments, labs, outdoor areas, and how scenes connect). This gives topology and a checklist for coverage, not metric geometry.

Tour page: https://www.panora.com.pk/work/fast-lahore
Tour viewer: https://tours.panoraproperties.com/FAST-LHR/index.htm

## Note
Panora's project page contains no spatial or department data (marketing text and the viewer link only), so the inventory must come from the tour viewer itself. Panora contact for permission questions: contact@panora.com.pk.

## Rules
- Private reference only. Output goes to `reference/tour/` (gitignored). Never copy panoramas, thumbnails or tour assets into `public/` or the app.
- Be polite: one request per second at most, identify with a normal browser user agent, respect `robots.txt`, stop if blocked.
- If the sandbox cannot reach the tour host, stop and report; the owner will export the scene list manually. Do not work around network restrictions.

## Steps
1. Install Playwright (`npx playwright install chromium`). Open the viewer URL headless.
2. **Look for a scene config first.** Tour viewers of this kind usually load a config file (XML/JSON) that lists every scene/node with a title and its links. Watch network requests for `.xml`/`.json` files, and inspect the page's JS globals. If found, parse scene IDs, titles and link targets directly; save the raw config to `reference/tour/config.raw.*`.
3. **Fallback: UI crawl.** If no config is accessible, drive the viewer: open its scene list/menu if present, otherwise click navigation hotspots breadth-first. Record, per scene: title (as shown), an ID you assign, outgoing hotspot labels/targets, and a screenshot saved to `reference/tour/scenes/<id>.jpg`.
4. Build `reference/tour/tour_graph.json`:
```json
{ "scenes": [{ "id": "s017", "title": "CS Lab 3", "outgoing": ["s016","s018"], "screenshot": "scenes/s017.jpg" }],
  "edges": [["s016","s017"]] }
```
5. Produce `reference/tour/locations.md`: a table mapping every scene to a campus entity (block, floor, room, outdoor area), using `data/campus.seed.json` IDs. Mark scenes that match nothing in the seed as `NEW`, and seed entities with no scene as `UNCOVERED`.
6. Update `data/campus.seed.json` **only by adding** entries marked `confidence: "estimated"` and `source: "tour"`; never delete or overwrite map-derived data. Record conflicts between the tour and the student map in `docs/OPEN_QUESTIONS.md`.
7. Report: scene count, blocks/departments found, coverage vs seed, conflicts, scenes worth turning into reference photos for specific rooms.

## Acceptance
- `tour_graph.json` exists and every edge refers to existing scenes.
- `locations.md` lists every scene with a mapped entity or `NEW`.
- No tour imagery exists outside `reference/`.
