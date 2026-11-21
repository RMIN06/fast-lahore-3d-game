# OPEN_QUESTIONS

Codex: do not guess these. Use placeholders (`confidence: "placeholder"`), add the item to the relevant milestone notes, and keep going. Owner: answer in this file.

## Blockers for spatial accuracy
1. **Map orientation (assumed, verify).** Owner states the cricket ground is in the south of the campus, so the student map's top is south. Assumed: 180-degree rotation (map left = east, map right = west), not a mirror. Confirm against the satellite image in M2; if the layout only fits as a mirror, record it and update `meta.mapToWorld`.
2. **Satellite capture.** Provide a top-down screenshot at max zoom with the Google Maps scale bar visible, or confirm OSM footprints may be used.
3. **Gates.** The map shows Gate-3, Gate-5 and a Masjid-side gate (opens only for Jummah). Where are Gates 1, 2 and 4? Which gates do students actually use?
4. **Unlabeled structures on the map:** the orange/grey structure north of the Library (E block) at the top of the Highway side; two blue squares on the lawns (fountains or water features?); a small brown rectangle and a beige rectangle on the lawn near Block A; two light-green boxes beside the car-parking label; the small box at the top-right corner of Block D.
5. **Upper floors:** Block A (only ground-floor rooms are given) and Block E / Library (floors and layout unknown).
6. **Highway:** is the central grey path a pedestrian road, and does it carry vehicles at any time?

## Department and program list
7. Official department list for registration. The map shows Computer Science (C), Civil (B), Electrical and Management (D). Where do Software Engineering, AI, Data Science, Cyber Security and Business programs sit?
8. Roll number format: is `NNL-NNNN` correct for all batches?

## Interiors
9. Meaning of "(On Right)/(On Left)/(On Front)/(Middle)" in the map notes: relative to which stair or entry?
10. Where are stairs, lifts and washrooms in each block? (Only "Girls Washroom" and "Boys Washroom" in B ground floor are mentioned.)
11. Library details: reading halls, shelves layout, issue desk, discussion rooms.
12. Auditorium and seminar hall capacity and layout.
13. Cafe interiors (F-block cafe on ground floor; New Cafe near the badminton court).
14. Floor heights, corridor widths: any measurements or photos? (Defaults used: floor 3.6 m, basement 3.4 m, corridor 2.4 m.)

## Content and legal
15. Permission from FAST for using the campus likeness, name and logo in a public game.
16. Permission from Panora if any of their imagery is used beyond private reference.
17. Is the student map's author (Abdul Moiez, FAST CS'22) fine with it being used as a design input? Credit him in the credits screen.

## Gameplay
18. Class timetable template per department (or use a generic generated one).
19. Friend NPC names and personalities (or use generated defaults).
20. Preferred start time and day for new players (default Monday 08:30).

## M1 findings — 2026-10-25

21. **Tour Gate-2 identity and access.** The reachable Panora config labels scene `panorama_08304C62_13DE_37F4_41B1_0273D3A1D9E6` as "Campus Gate 2". Added G2 as an estimated, unlocated entity (source: tour). Confirm position, heading, student access and relationship to Gate-3/Gate-5. No equivalence inferred.
22. **Block A floor conflict.** Tour labels explicitly mention Block A basement corridors and first-floor corridors; the map-derived seed contains only ground-floor rooms. Confirm the block naming, real floor count and plans before adding floors or moving existing rooms.
23. **Library inventory conflict.** Tour scenes label a Library first floor, conference rooms, research room, entrances and study halls. The seed is a placeholder single ground-level hall. Confirm floor assignment and room plan; do not infer that the tour title "first floor" fixes the entire floor count.
24. **Unmapped tour scenes.** 34 scenes remain NEW/unresolved, including unnamed basement sections, gym, Love Garden, fountain plaza, examination hall, laboratories and cafes. The complete title/ID list and conservative mappings are in `reference/tour/locations.md`. Confirm building/floor and numbered-room identities. The fountain-plaza label alone does not identify either unlabeled blue square on the student map.
25. **Stair topology and headings.** Seed connectors are unpositioned and link only to their own floor; gate headings are absent. Supply actual stair/lift links, positions and gate headings during curation. Validation warns for these seed gaps and rejects them in curated data.
26. **PropGroup contract missing.** CAMPUS_SPEC refers to PropGroup but never defines its fields. The seed has no props. Agree on the placement/instancing contract before adding prop records; the M1 schema deliberately rejects nonempty undefined prop data.
27. **Reference detail coverage.** M1 collected 44 private tour thumbnail previews, with manifests and coverage for 132 seed locations. These are insufficient for accurate materials, signage and room layouts. Owner photos (5–10 useful views per location) are still needed; see `reference/photos/COVERAGE.md`. No owner photo collection was present.

## M2 source review — 2026-10-25

28. **OSM boundary discrepancy.** Owner authorized OSM research. Way 323166057 covers approximately 42,483 m², below the required 42,997.85 m² lower bound. Which campus edges or parcels are missing/stale? Provide a scaled satellite capture or corrected surveyed boundary. Do not stretch the polygon just to hit 12.5 acres.
29. **OSM block conflicts.** The snapshot independently names Civil, Library, Admin and CS outlines, but not D/F. The CS outline and surrounding arrangement do not directly match the seed's narrow C block. Confirm block identities against a current overhead view; OSM level/height tags were not imported.
30. **Metric origin and gates.** No named OSM node establishes Gate-5 or the other three gates. Confirm each location and observed heading, including tour-only Gate-2. M2's tracer is ready at `/dev/tracer`; accepted campus.json remains pending real tracing input.

## M2 site plan — 2026-11-20

Items 1, 2 and 28–30 are now answered by imagery: orientation is a 180° rotation (not a mirror); the walled boundary measures 42,484 m²; D and F were traced; Gate-5, Gate-3 and the Masjid-side gate were located. See `docs/M2_STATUS.md`. Please confirm or correct the items below.

31. **Official area vs the walled campus.** FAST publishes 12.5 acres, but the walled campus measures about 10.5 acres in both the imagery and OSM. Does 12.5 acres include land outside the wall (the Masjid, staff housing or other plots)? The area check was widened to ±20% so that M2 could pass. **Owner: confirm this decision.**
32. **Gate-2.** It is placed as a placeholder at a road opening in the south wall, south of the car park beside F Block. Is this the tour's "Campus Gate 2"? If not, where is Gate-2? Please also confirm Gate-5's position (the Love Garden west path at the north-west wall) and Gate-3's (the road entering north of F Block).
33. **C/D boundary.** OSM draws Blocks C and D as one L-shaped outline. The split is drawn along the west wing's east wall line. Where does the CS block actually end and the Electrical & Management block begin?
34. **Placeholder shops and cafes.** New (Open) Cafe, Fresh Friez and Book PhotoCopy could not be identified in the imagery. Their positions come from the student map only. Please give their real locations (photos or a description).
35. **Unlabelled building south of the Library.** OSM labels it "Cafeteria" (way 841040148). It is the unlabelled grey/orange structure on the student map, and the seed has no entity for it. What is it, and should it become a building or area?
36. **Licensing of derived geometry.** Geometry is derived from OSM (ODbL, which requires attribution and share-alike for the database) and traced from Esri World Imagery. Review both licences before any public release (see `docs/ASSET_LICENSES.md`).
37. **Map-relative names.** The seed's "South lawns (below Block A)" is the lawn north of Block A (the "Love Garden"). The "north" and "south" fountain labels are map-relative too. Should these be renamed?

## M3 greybox — 2026-11-20

38. **Boundary wall height and gate widths.** The greybox uses placeholder values from `meta.defaults`: a 2.5 m wall and 6 m gate openings. What are the real wall height and the width of each gate?

## M4 player — 2026-11-20

39. **Block entrances.** Each block has one placeholder main entrance: A on its south side (courtyard), B west (Highway), C east (courtyard), D north (courtyard), E west (Highway) and F north (Gate-3 path), at the midpoint of the longest facade on that side. Where are the actual main and side doors of each block?

## M5 time and lighting — 2026-11-20

40. **Lamp posts and outdoor lights.** About 20 placeholder lamps are placed procedurally: outside each entrance, inside each gate, and every 22 m along the Highway and Gate-3 path. Where are the real lamp posts and wall lights? What time do they switch on?
41. **Campus hours.** Do gates open and close at fixed times, and is the campus open at night or on Sundays? Right now, only the Masjid-side gate has a schedule (Friday Jummah).

## M6 registration — 2026-11-20

42. **Avatar options.** The placeholder avatar offers 4 skin tones, 4 hair styles (short, long, tied, covered) and 6 outfit colours. Which options should the M8 characters support, for example uniforms or hijab and cap variants?

## M7 interiors — 2026-11-20

43. **Floor plans.** Every interior is a generated placeholder: corridor spines, room sizes, one stair ramp shaft per block, and no lifts. Plans, fire-exit maps or photos of any floor (especially stairs, washrooms and corridor directions) would replace the guesses. Which blocks have lifts?
44. **Block entrances inside.** Each block is entered only through its one placeholder main door. Which side doors exist, and does the vestibule/hall arrangement match the real entrance halls?

## M8 characters — 2026-11-20

45. **Character models.** The characters are procedural placeholders (own work). Will the owner supply male and female glTF models with a shared skeleton (ASSET_PIPELINE §5), or approve a specific CC0 source (for example MakeHuman exports or Quaternius) for download? Real clips would replace the procedural idle, walk, run, jump, sit, kick and swing.

## M9 NPCs — 2026-11-20

46. **Daily life on campus.** The NPC numbers and hours are placeholders: about 110 students on campus at once on a weekday, 8 faculty, the cafe open 07:30–21:00, the library 08:00–20:00, the medical room 08:00–17:00, and shops 08:00–20:00 (closed Sunday). What are the real opening hours of the cafe, library, medical room and shops, the class timings (slots, lunch break), and roughly how busy is the campus at different times? Is Saturday a teaching day?
47. **Staff and guards.** One guard is placed inside each gate around the clock. Where do guards actually stand (gate cabins?), and are there more posts? Fresh Friez is modelled as a street-side shop outside the wall near Gate-5. Is that correct, and are there more shops or kiosks?

## M10 interaction and tasks — 2026-11-20

48. **Academic calendar details.** The timetable is generated (#18): five slots a day starting 08:30, 10:00, 11:30, 14:00 and 15:30, with lunch 12:50–14:00, generic course names and rooms from the department's blocks. Also placeholders: faculty office hours (10:00–16:00), when the Academic Office accepts submissions (09:00–16:00), society events in the Auditorium (Tue/Thu afternoons) and seminars in the Seminar Hall (Wednesday late morning). What are the real ones?
49. **Furniture and fixtures.** Seats, lab PCs, lecterns, library shelves (codes A1–F6), the library issue desk, cafe counter and tables, office counters, benches, prayer spaces and parking bays are all placed by a generator. Room furniture layouts, the library's shelf layout and call-number scheme, and where counters and benches really are would replace them.
50. **Access outside the wall.** The player can't leave through the gates. The Masjid is reachable only when its gate opens at Jummah, and Fresh Friez not at all. Is there a prayer room inside the campus, is the Masjid used for other prayers by students, and is Fresh Friez served through a window from inside Gate-5?

