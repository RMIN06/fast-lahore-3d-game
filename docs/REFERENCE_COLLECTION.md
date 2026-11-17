# REFERENCE_COLLECTION — Gathering appearance references per location

Purpose: collect photos so facades, signage, corridors and rooms can be modeled and textured to look right. Photos give appearance only; geometry and dimensions come from CAMPUS_SPEC calibration.

## Where things go
```
reference/
  maps/student-map.png            committed (project input)
  tour/                           from TOUR_RECON (gitignored)
  photos/<location-id>/           5-10 images per location (gitignored)
    manifest.json
```
`location-id` uses seed IDs: blocks `A`..`F`, spaces `F-2-NB201`, areas `cricket-ground`, `masjid`, `gate-5`, etc.

## What to collect per location
- **Buildings:** each facade, main entrance, a close-up of brickwork/marble/dome details, signage, windows/doors.
- **Interiors:** corridor looking both ways, a typical classroom, labs, stair/lift area, washroom doors/signage, floor and ceiling materials, notice boards, door number plates.
- **Outdoor:** lawns, benches, lamp posts, trees, boundary wall, gates, road/path surfaces, cricket ground, futsal/basketball/badminton courts, parking, cafes, Masjid exterior.
- Special: Library (shelves, desks, issue desk), Auditorium, Seminar Hall, Medical Centre, cafes.

## How to collect
- Prefer, in this order: (1) the owner's own phone photos (placed in `reference/photos/<id>/`), (2) the Panora tour screenshots from TOUR_RECON, (3) official FAST pages and Wikimedia Commons, (4) ordinary web image search results viewed for reference.
- Do not bulk-scrape Google Images programmatically (violates its terms). Searching and viewing results to identify reference material is fine; save only what you need for private study.
- Never ship any of it. Textures in the game are created or sourced separately (see ASSET_PIPELINE).

## manifest.json (per location)
```json
{
  "location": "F",
  "images": [
    { "file": "f-front.jpg", "source": "https://...", "license": "unknown|own|cc0|cc-by", "shows": "main entrance facade", "usable_for_textures": false }
  ],
  "needs_owner_photo": true,
  "notes": "no corridor photos found"
}
```
Rules: record the source URL for every image; set `license` honestly (`unknown` = reference only); set `needs_owner_photo` when coverage is insufficient (fewer than 3 useful images).

## Output
- `reference/photos/COVERAGE.md`: a table of locations vs number of useful images, with every `needs_owner_photo: true` location listed. The owner uses this as a photo shot list.
