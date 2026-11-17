# CAMPUS_SPEC — World data schema

The campus is data. `data/campus.json` (curated from `data/campus.seed.json`) is the single source of truth for geometry, rooms, anchors, gates and areas.

## 1. Coordinate system
- Units: meters. Axes: **+X east, +Y up, +Z south** (three.js: -Z is north).
- Origin: the center of **Gate-5** at ground level (`gates.G5`). Change only by editing `meta.origin` and re-basing.
- Polygons: counter-clockwise when viewed from above, closed implicitly.
- Georeferencing: `meta.geo` stores lat/lng of the origin and a rotation so satellite imagery can be overlaid. **Student map orientation:** the map's top is SOUTH (cricket ground lies in the south). Assuming a 180-degree rotation: `X_east = (775 - px_x) * m_per_px`, `Z_south = (752 - px_y) * m_per_px`, with the origin at Gate-5's pixel position (775, 752). Example: the cricket ground (px ~873, 241) lands south and slightly west of Gate-5. Verify during M2 (see OPEN_QUESTIONS #1).

## 2. Calibration (how the schematic map becomes real meters)
1. The student map (`reference/maps/student-map.png`, 1320x891 px) is **not to scale**; use it for topology, labels, relative placement and floor contents.
2. Metric scale comes from satellite imagery. Method: take a top-down capture at known zoom with the Google Maps scale bar visible, or measure two or more long known distances with the Google Maps ruler (cricket ground length, Highway length, campus boundary edges). Fit pixels-per-meter; for Web Mercator tiles: `metersPerPixel = 156543.03392 * cos(latitude) / 2^zoom` (divide by device pixel ratio for screenshots). Lahore latitude is about 31.5 N.
3. Trace footprints with the tracer tool (`src/dev/tracer`). OSM building footprints for the area may be used if available and accurate (attribute OpenStreetMap contributors, ODbL).
4. **Sanity check:** the official campus area is about 12.5 acres (about 50,600 m²). The traced boundary polygon must land within about +/-15% of that or calibration is wrong.
5. Record the calibration in `meta.calibration` (method, reference distances, pixels-per-meter, date, residual error).

## 3. Top-level shape (`campus.json`)
```ts
type Confidence = "measured" | "traced" | "estimated" | "placeholder";
type Vec2 = [number, number];              // [x, z] meters
type Vec3 = [number, number, number];      // [x, y, z] meters

interface Campus {
  meta: {
    name: string; origin: string;            // gate id
    geo?: { lat: number; lng: number; rotationDeg: number };
    calibration?: { method: string; metersPerPixel?: number; refs: string[]; residualPct?: number; date: string };
    defaults: { floorHeight: number; basementHeight: number; wallThickness: number; corridorWidth: number; doorWidth: number; doorHeight: number };
    schematicMap: { file: string; sizePx: [number, number]; northDirection?: string };
  };
  boundary: { polygon: Vec2[]; confidence: Confidence };
  gates: Gate[];
  buildings: Building[];
  areas: Area[];            // outdoor zones: lawns, courts, grounds, parking, paths, roads
  props: PropGroup[];       // benches, trees, lamps, bike racks (instanced)
  departments: Department[];
  anchors: Anchor[];        // named points: spawns, interaction spots, seats, NPC waypoints
}

interface Gate { id: string; label: string; position: Vec2; heading: number; opens?: { days?: string[]; fromTime?: string; toTime?: string }; notes?: string; confidence: Confidence }

interface Building {
  id: string;                 // "A".."F"
  label: string;              // "Admin Block"
  aliases: string[];          // "A-Block", "Admin"
  footprint: Vec2[] | null;   // null until traced
  schematicBoxPx?: [number, number, number, number]; // x,y,w,h on the student map
  features?: string[];        // "marble_dome", "brick_facade"
  entries: Entry[];
  floors: Floor[];
  roomCodePrefix?: string;    // e.g. "NB", "CE", "E&M", "CS"
  confidence: Confidence;
}

interface Entry { id: string; position: Vec2 | null; floor: string; kind: "main" | "side" | "stair" | "ramp"; label?: string }

interface Floor {
  id: string;                // "B2","B1","G","1","2","3"
  level: number;             // -2,-1,0,1,2,3
  height?: number;
  label: string;             // "Basement", "Ground Floor", "1st Floor", "2nd Floor (Management Floor)"
  layout: "corridor_spine" | "open_hall" | "parking" | "custom";
  spaces: Space[];
  connectors: Connector[];   // stairs/lifts to other floors
  glb?: string;              // optional hand-modeled override
}

interface Space {
  id: string;                // "F-2-NB201"
  code?: string;             // "NB-201"
  name: string;
  kind: "classroom" | "lab" | "office" | "common_room" | "washroom" | "library" | "cafe" | "auditorium" | "seminar_hall" | "medical" | "recreation" | "parking" | "open_seating" | "student_centre" | "stairs" | "other";
  side?: "left" | "right" | "front" | "middle";  // relative to arrival from the main stair/entry (see notes)
  order?: number;            // order along the corridor within the side
  polygon?: Vec2[];          // when known
  capacity?: number;
  notes?: string;
  confidence: Confidence;
}

interface Connector { id: string; kind: "stairs" | "lift"; position: Vec2 | null; connects: string[] }  // floor ids

interface Area { id: string; label: string; kind: "lawn"|"ground"|"court"|"parking"|"path"|"road"|"plaza"|"shop"|"cafe"|"masjid"|"water_feature"|"other"; polygon: Vec2[] | null; schematicBoxPx?: [number,number,number,number]; surface?: "grass"|"asphalt"|"paving"|"clay"|"turf"|"concrete"; notes?: string; confidence: Confidence }

interface Department { id: string; name: string; buildingIds: string[]; spawnAnchor: string; aliases: string[] }
interface Anchor { id: string; kind: "spawn"|"seat"|"interact"|"npc_wp"|"camera"; position: Vec3 | null; heading?: number; refs?: string[] }
```
Notes:
- `side` values come from the student map ("On Right", "On Left", "On Front", "Middle"). Their reference frame is unconfirmed (assumed: standing at the top of the main stair/entry looking into the floor). Treat as `estimated`.
- `null` footprints/positions are legal in the seed but `validate:campus` reports them; milestone gates require them filled.

## 4. ID conventions
- Buildings: `A`..`F`. Floors: `B2,B1,G,1,2,3`. Spaces: `<building>-<floor>-<code-without-spaces>` e.g. `F-2-NB201`, `D-B1-EM3`, `C-G-AUDITORIUM`. Anchors: `spawn.<dept>`, `seat.library.12`, `npc.cafe.counter`.
- Room code naming from the source map: F `NB-###`, B `CE-##`, D `E&M-##`, C `CS-##`, CS labs `CS LAB-##`, Eng labs `ENG LAB-#`.

## 5. Validation (`npm run validate:campus`)
Fails on: schema errors, duplicate IDs, unresolved references (tasks, NPCs, departments, anchors), polygons that self-intersect, footprints overlapping each other or the boundary exterior, spaces outside their building, missing floor connectors between adjacent floors, boundary area outside 12.5 acres +/-15%.
Warns on: `null` footprints, `placeholder` confidence, rooms without polygons.

## 6. What the sources give us (seed summary)
| Block | Name | Source detail |
|---|---|---|
| A | Admin | Ground floor labs/rooms only (CS LAB-1..4, Eng Lab, Student Centre). Upper floors unknown. |
| B | Civil Dept | Basement to 2nd floor, full room list. |
| C | CS Dept | Basement to 2nd floor; auditorium, medical centre, seminar hall, table tennis. |
| D | Electrical & Management | Basement to 2nd floor (Management floor), full room list. |
| E | Library | Footprint and label only. Floors/interior unknown. |
| F | New Building | Basement 2 to 3rd floor, parking, cafe, offices, classrooms. |
Full detail is in `data/campus.seed.json`.
