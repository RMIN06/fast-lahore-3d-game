import type { Building, Campus, Confidence, Vec2 } from '../types/campus';
import { edgeOutward, floorStack, pointInPolygon } from './campus-geometry';
import type { StaticCollider } from './campus-geometry';

// M7 interior generator (ARCHITECTURE §4): per floor, a corridor spine with
// rooms on its sides, an entrance hall with a stair shaft linking all floors,
// and a vestibule from the main entrance. Pure maths, no rendering.
//
// Exact floor plans do not exist (PRD §7), so every generated position is a
// PLACEHOLDER layout. Room identity (code, name, floor) comes from campus data.

/** Building-local frame: world = origin + u·U + v·V (U along the longest edge). */
export interface Frame {
  origin: Vec2;
  u: Vec2;
  v: Vec2;
}
export interface Rect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}
export interface RoomLayout {
  spaceId: string;
  code?: string;
  name: string;
  kind: string;
  /** Confidence of the room's existence/floor (from data). */
  confidence: Confidence;
  floorId: string;
  level: number;
  rect: Rect;
  /** Door centre on the corridor side (local). */
  door: { u: number; v: number };
  /** Unit vector (local) from the door into the corridor. */
  doorFacing: { u: number; v: number };
  /** Centre of the room at floor level, world [x, y, z]. */
  anchor: [number, number, number];
  polygon: Vec2[];
}
/** Wall segment in local coordinates, from y0 to y1. */
export interface Wall {
  a: [number, number];
  b: [number, number];
  y0: number;
  y1: number;
  thickness: number;
}
export interface Slab {
  rect: Rect;
  /** Top surface height. */
  top: number;
  thickness: number;
}
/** Straight ramp in the stair shaft rising from u0 (y0) to u1 (y1). */
export interface Ramp {
  rect: Rect;
  y0: number;
  y1: number;
  fromFloor: string;
  toFloor: string;
}
export interface FloorLayout {
  floorId: string;
  level: number;
  label: string;
  base: number;
  top: number;
  rooms: RoomLayout[];
  corridor?: Rect;
}
export interface InteriorLayout {
  buildingId: string;
  frame: Frame;
  /** Usable interior rectangle (local). */
  interior: Rect;
  vestibule: Rect;
  hall: Rect;
  shaft: Rect;
  /** v of the walking lane beside the shaft. */
  lane: number;
  /** Main door on the facade: world centre, footprint edge index, width, height. */
  door: { position: Vec2; edge: number; width: number; height: number };
  floors: FloorLayout[];
  walls: Wall[];
  slabs: Slab[];
  ramps: Ramp[];
  /** Everything here is generated: layout confidence is placeholder. */
  layoutConfidence: 'placeholder';
}

const WALL = 0.2;
const SLAB = 0.2;
export const DOOR_WIDTH = 1.4;
/** Room door leaf height (M10). */
export const DOOR_LEAF_HEIGHT = 2.1;
/** Rooms whose doorway has a door leaf (not parking or open seating). */
export const hasDoorLeaf = (room: { kind: string }) =>
  !['parking', 'open_seating'].includes(room.kind);
const ENTRY_WIDTH = 3;
const ENTRY_HEIGHT = 2.7;
const SHAFT_WIDTH = 2.4;
const SHAFT_LENGTH = 6.6;
const LANDING = 2;
const MIN_ROOM_DEPTH = 4;
const RAIL_HEIGHT = 1.1;

export const toWorld = (f: Frame, u: number, v: number): Vec2 => [
  f.origin[0] + f.u[0] * u + f.v[0] * v,
  f.origin[1] + f.u[1] * u + f.v[1] * v,
];
export const toLocal = (f: Frame, p: Vec2): [number, number] => {
  const dx = p[0] - f.origin[0],
    dz = p[1] - f.origin[1];
  return [dx * f.u[0] + dz * f.u[1], dx * f.v[0] + dz * f.v[1]];
};
export const rectPolygon = (f: Frame, r: Rect): Vec2[] => [
  toWorld(f, r.u0, r.v0),
  toWorld(f, r.u1, r.v0),
  toWorld(f, r.u1, r.v1),
  toWorld(f, r.u0, r.v1),
];
export const inRect = (r: Rect, u: number, v: number, pad = 0) =>
  u >= r.u0 - pad && u <= r.u1 + pad && v >= r.v0 - pad && v <= r.v1 + pad;

/** Frame aligned with the footprint's longest edge. */
export function buildingFrame(footprint: Vec2[]): Frame {
  let best = 0,
    bestLength = 0;
  footprint.forEach((a, i) => {
    const b = footprint[(i + 1) % footprint.length]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > bestLength) [best, bestLength] = [i, l];
  });
  const a = footprint[best]!,
    b = footprint[(best + 1) % footprint.length]!;
  const u: Vec2 = [(b[0] - a[0]) / bestLength, (b[1] - a[1]) / bestLength];
  return { origin: a, u, v: [-u[1], u[0]] };
}

const segmentDistance = (p: Vec2, a: Vec2, b: Vec2) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz),
    ),
  );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};
const insideInset = (p: Vec2, polygon: Vec2[], inset: number) =>
  pointInPolygon(p, polygon) &&
  polygon.every(
    (a, i) =>
      segmentDistance(p, a, polygon[(i + 1) % polygon.length]!) >= inset,
  );

/** Largest frame-aligned rectangle inside the footprint (grid + histogram). */
export function largestInnerRect(
  footprint: Vec2[],
  frame: Frame,
  cell = 0.5,
  inset = 0.4,
): Rect {
  const local = footprint.map((p) => toLocal(frame, p));
  const us = local.map((p) => p[0]),
    vs = local.map((p) => p[1]);
  const u0 = Math.min(...us),
    v0 = Math.min(...vs);
  const nu = Math.ceil((Math.max(...us) - u0) / cell),
    nv = Math.ceil((Math.max(...vs) - v0) / cell);
  // ok[i][j]: cell (i along u, j along v) fully inside (all four corners).
  const corner = Array.from({ length: nu + 1 }, (_, i) =>
    Array.from({ length: nv + 1 }, (_, j) =>
      insideInset(
        toWorld(frame, u0 + i * cell, v0 + j * cell),
        footprint,
        inset,
      ),
    ),
  );
  const heights = new Array<number>(nv).fill(0);
  let best = { area: 0, i0: 0, i1: 0, j0: 0, j1: 0 };
  for (let i = 0; i < nu; i += 1) {
    for (let j = 0; j < nv; j += 1) {
      const ok =
        corner[i]![j]! &&
        corner[i + 1]![j]! &&
        corner[i]![j + 1]! &&
        corner[i + 1]![j + 1]!;
      heights[j] = ok ? heights[j]! + 1 : 0;
    }
    // Largest rectangle in histogram `heights` (cells along u ending at row i).
    const stack: number[] = [];
    for (let j = 0; j <= nv; j += 1) {
      const h = j < nv ? heights[j]! : 0;
      while (stack.length && heights[stack.at(-1)!]! >= h) {
        const top = stack.pop()!;
        const height = heights[top]!;
        const left = stack.length ? stack.at(-1)! + 1 : 0;
        const area = height * (j - left);
        if (area > best.area)
          best = { area, i0: i - height + 1, i1: i + 1, j0: left, j1: j };
      }
      stack.push(j);
    }
  }
  if (!best.area) throw new Error('No interior rectangle fits the footprint');
  return {
    u0: u0 + best.i0 * cell,
    u1: u0 + best.i1 * cell,
    v0: v0 + best.j0 * cell,
    v1: v0 + best.j1 * cell,
  };
}

const wallSeg = (
  a: [number, number],
  b: [number, number],
  y0: number,
  y1: number,
  thickness = WALL,
): Wall => ({ a, b, y0, y1, thickness });

/** Wall along u at fixed v from u0 to u1, leaving openings [from, to] along u. */
const wallAlongU = (
  v: number,
  u0: number,
  u1: number,
  y0: number,
  y1: number,
  openings: [number, number][] = [],
): Wall[] => {
  const walls: Wall[] = [];
  let cursor = u0;
  for (const [a, b] of [...openings].sort((x, y) => x[0] - y[0])) {
    if (a > cursor + 0.05) walls.push(wallSeg([cursor, v], [a, v], y0, y1));
    cursor = Math.max(cursor, b);
  }
  if (u1 > cursor + 0.05) walls.push(wallSeg([cursor, v], [u1, v], y0, y1));
  return walls;
};
const wallAlongV = (
  u: number,
  v0: number,
  v1: number,
  y0: number,
  y1: number,
  openings: [number, number][] = [],
): Wall[] =>
  wallAlongU(0, v0, v1, y0, y1, openings).map((w) => ({
    ...w,
    a: [u, w.a[0]],
    b: [u, w.b[0]],
  }));

/** Split rect r minus hole h into up to four rects. */
const subtract = (r: Rect, h: Rect): Rect[] =>
  [
    { u0: r.u0, u1: h.u0, v0: r.v0, v1: r.v1 },
    { u0: h.u1, u1: r.u1, v0: r.v0, v1: r.v1 },
    { u0: h.u0, u1: h.u1, v0: r.v0, v1: h.v0 },
    { u0: h.u0, u1: h.u1, v0: h.v1, v1: r.v1 },
  ].filter((x) => x.u1 - x.u0 > 0.05 && x.v1 - x.v0 > 0.05);

type Space = Building['floors'][number]['spaces'][number];

/** Divide [a, b] into n equal slots. */
const slots = (a: number, b: number, n: number) =>
  Array.from({ length: n }, (_, i) => [
    a + ((b - a) * i) / n,
    a + ((b - a) * (i + 1)) / n,
  ]) as [number, number][];

export function generateInterior(
  building: Building,
  defaults: Campus['meta']['defaults'],
): InteriorLayout {
  const footprint = building.footprint;
  if (!footprint) throw new Error(`${building.id} has no footprint`);
  const entry = building.entries.find((e) => e.id === 'main')?.position;
  if (!entry) throw new Error(`${building.id} has no main entrance position`);
  const frame = buildingFrame(footprint);
  const interior = largestInnerRect(footprint, frame);
  const corridorWidth = defaults.corridorWidth;

  // Door: the facade edge nearest the entrance point.
  let edge = 0,
    edgeDistance = Infinity;
  footprint.forEach((a, i) => {
    const d = segmentDistance(entry, a, footprint[(i + 1) % footprint.length]!);
    if (d < edgeDistance) [edge, edgeDistance] = [i, d];
  });
  const outward = edgeOutward(footprint, edge);
  const inwardLocal = toLocal({ origin: [0, 0], u: frame.u, v: frame.v }, [
    -outward[0],
    -outward[1],
  ]);
  const [eu, ev] = toLocal(frame, entry);
  // Vestibule from the door straight into the interior rectangle (snapped to an axis).
  const alongU = Math.abs(inwardLocal[0]) > Math.abs(inwardLocal[1]);
  const half = ENTRY_WIDTH / 2;
  let vestibule: Rect;
  if (alongU) {
    const v = Math.min(Math.max(ev, interior.v0 + half), interior.v1 - half);
    vestibule =
      inwardLocal[0] > 0
        ? { u0: eu, u1: interior.u0, v0: v - half, v1: v + half }
        : { u0: interior.u1, u1: eu, v0: v - half, v1: v + half };
  } else {
    const u = Math.min(Math.max(eu, interior.u0 + half), interior.u1 - half);
    vestibule =
      inwardLocal[1] > 0
        ? { u0: u - half, u1: u + half, v0: ev, v1: interior.v0 }
        : { u0: u - half, u1: u + half, v0: interior.v1, v1: ev };
  }
  if (vestibule.u1 < vestibule.u0)
    [vestibule.u0, vestibule.u1] = [vestibule.u1, vestibule.u0];
  if (vestibule.v1 < vestibule.v0)
    [vestibule.v0, vestibule.v1] = [vestibule.v1, vestibule.v0];

  // Entrance hall: a band across the interior at the vestibule, holding the shaft.
  const hallLength = SHAFT_LENGTH + LANDING * 2;
  const centreU = alongU
    ? inwardLocal[0] > 0
      ? interior.u0
      : interior.u1
    : (vestibule.u0 + vestibule.u1) / 2;
  const hu0 = Math.min(
    Math.max(centreU - hallLength / 2, interior.u0),
    interior.u1 - hallLength,
  );
  const hall: Rect = {
    u0: hu0,
    u1: hu0 + hallLength,
    v0: interior.v0,
    v1: interior.v1,
  };
  // Shaft on the side away from a v-side vestibule.
  const shaftOnHighV = alongU || inwardLocal[1] > 0;
  const shaft: Rect = shaftOnHighV
    ? {
        u0: hu0 + LANDING,
        u1: hu0 + LANDING + SHAFT_LENGTH,
        v0: interior.v1 - SHAFT_WIDTH,
        v1: interior.v1,
      }
    : {
        u0: hu0 + LANDING,
        u1: hu0 + LANDING + SHAFT_LENGTH,
        v0: interior.v0,
        v1: interior.v0 + SHAFT_WIDTH,
      };
  const lane = shaftOnHighV ? shaft.v0 - 1.2 : shaft.v1 + 1.2;

  const stack = floorStack(building, defaults);
  const lowest = stack[0]!,
    highest = stack.at(-1)!;
  const walls: Wall[] = [];
  const slabs: Slab[] = [];
  const ramps: Ramp[] = [];
  const floors: FloorLayout[] = [];

  // Segments of the interior outside the hall, where corridors and rooms go.
  const segments = [
    { u0: interior.u0, u1: hall.u0 },
    { u0: hall.u1, u1: interior.u1 },
  ].filter((s) => s.u1 - s.u0 >= 3);
  const width = interior.v1 - interior.v0;
  const doubleLoaded = width >= corridorWidth + 2 * MIN_ROOM_DEPTH;

  stack.forEach((slab, index) => {
    const floor = building.floors.find((f) => f.id === slab.floorId)!;
    const y0 = slab.base,
      y1 = slab.top - SLAB;
    const isLowest = slab === lowest,
      isHighest = slab === highest;
    const rooms: RoomLayout[] = [];

    // Floor slab: whole interior on the lowest floor, minus the shaft above it.
    for (const r of isLowest ? [interior] : subtract(interior, shaft))
      slabs.push({ rect: r, top: slab.base, thickness: SLAB });
    if (isHighest)
      slabs.push({ rect: interior, top: slab.top, thickness: SLAB }); // roof
    if (slab.level === 0)
      slabs.push({ rect: vestibule, top: 0, thickness: SLAB });

    // Perimeter walls (opening into the vestibule on the ground floor).
    const vestibuleOpening = (axis: 'u' | 'v'): [number, number][] =>
      slab.level === 0
        ? [
            axis === 'u'
              ? [vestibule.u0, vestibule.u1]
              : [vestibule.v0, vestibule.v1],
          ]
        : [];
    const touches = (side: 'u0' | 'u1' | 'v0' | 'v1') =>
      slab.level === 0 &&
      (side === 'u0'
        ? Math.abs(vestibule.u1 - interior.u0) < 0.01
        : side === 'u1'
          ? Math.abs(vestibule.u0 - interior.u1) < 0.01
          : side === 'v0'
            ? Math.abs(vestibule.v1 - interior.v0) < 0.01
            : Math.abs(vestibule.v0 - interior.v1) < 0.01);
    walls.push(
      ...wallAlongU(
        interior.v0,
        interior.u0,
        interior.u1,
        y0,
        y1,
        touches('v0') ? vestibuleOpening('u') : [],
      ),
      ...wallAlongU(
        interior.v1,
        interior.u0,
        interior.u1,
        y0,
        y1,
        touches('v1') ? vestibuleOpening('u') : [],
      ),
      ...wallAlongV(
        interior.u0,
        interior.v0,
        interior.v1,
        y0,
        y1,
        touches('u0') ? vestibuleOpening('v') : [],
      ),
      ...wallAlongV(
        interior.u1,
        interior.v0,
        interior.v1,
        y0,
        y1,
        touches('u1') ? vestibuleOpening('v') : [],
      ),
    );
    if (slab.level === 0) {
      // Vestibule side walls up to the facade.
      if (alongU) {
        walls.push(
          wallSeg(
            [vestibule.u0, vestibule.v0],
            [vestibule.u1, vestibule.v0],
            0,
            y1,
          ),
          wallSeg(
            [vestibule.u0, vestibule.v1],
            [vestibule.u1, vestibule.v1],
            0,
            y1,
          ),
        );
      } else {
        walls.push(
          wallSeg(
            [vestibule.u0, vestibule.v0],
            [vestibule.u0, vestibule.v1],
            0,
            y1,
          ),
          wallSeg(
            [vestibule.u1, vestibule.v0],
            [vestibule.u1, vestibule.v1],
            0,
            y1,
          ),
        );
      }
      slabs.push({
        rect: vestibule,
        top: ENTRY_HEIGHT + SLAB,
        thickness: SLAB,
      });
    }

    // Shaft rails: along the hall side always; across the near end on the top
    // floor (drop) and across the far end on the lowest floor (low headroom).
    const railV = shaftOnHighV ? shaft.v0 : shaft.v1;
    walls.push(
      wallSeg([shaft.u0, railV], [shaft.u1, railV], y0, y0 + RAIL_HEIGHT, 0.12),
    );
    if (isHighest)
      walls.push(
        wallSeg(
          [shaft.u0, shaft.v0],
          [shaft.u0, shaft.v1],
          y0,
          y0 + RAIL_HEIGHT,
          0.12,
        ),
      );
    if (isLowest)
      walls.push(
        wallSeg(
          [shaft.u1, shaft.v0],
          [shaft.u1, shaft.v1],
          y0,
          y0 + RAIL_HEIGHT,
          0.12,
        ),
      );
    const next = stack[index + 1];
    if (next)
      ramps.push({
        rect: shaft,
        y0: slab.base,
        y1: next.base,
        fromFloor: slab.floorId,
        toFloor: next.floorId,
      });

    // Rooms.
    const spaces = [...floor.spaces];
    const open = floor.layout !== 'corridor_spine' || spaces.length === 1;
    if (open) {
      // One open room: the largest segment (the hall stays open floor).
      const seg = [...segments].sort((a, b) => b.u1 - b.u0 - (a.u1 - a.u0))[0];
      const rect: Rect = seg
        ? { u0: seg.u0, u1: seg.u1, v0: interior.v0, v1: interior.v1 }
        : { ...hall };
      spaces.forEach((space, i) => {
        const part = slots(rect.u0, rect.u1, spaces.length)[i]!;
        const r = { ...rect, u0: part[0], u1: part[1] };
        rooms.push(
          roomOf(
            space,
            floor,
            slab.base,
            r,
            { u: seg && seg.u0 > hall.u0 ? r.u0 : r.u1, v: (r.v0 + r.v1) / 2 },
            { u: seg && seg.u0 > hall.u0 ? -1 : 1, v: 0 },
            frame,
          ),
        );
      });
      // Partitions between multiple open rooms with a wide opening.
      for (let i = 1; i < rooms.length; i += 1) {
        const u = rooms[i]!.rect.u0;
        walls.push(
          ...wallAlongV(u, interior.v0, interior.v1, y0, y1, [
            [interior.v0 + 1, interior.v0 + 4],
          ]),
        );
      }
    } else {
      // Corridor spine through each segment; rooms in strips beside it.
      const corridorV = doubleLoaded
        ? [
            (interior.v0 + interior.v1) / 2 - corridorWidth / 2,
            (interior.v0 + interior.v1) / 2 + corridorWidth / 2,
          ]
        : shaftOnHighV
          ? [interior.v1 - corridorWidth, interior.v1]
          : [interior.v0, interior.v0 + corridorWidth];
      const strips: { side: 'left' | 'right'; rect: Rect }[] = [];
      for (const seg of segments) {
        if (doubleLoaded || !shaftOnHighV)
          strips.push({
            side: 'right',
            rect: {
              u0: seg.u0,
              u1: seg.u1,
              v0: corridorV[1]!,
              v1: interior.v1,
            },
          });
        if (doubleLoaded || shaftOnHighV)
          strips.push({
            side: 'left',
            rect: {
              u0: seg.u0,
              u1: seg.u1,
              v0: interior.v0,
              v1: corridorV[0]!,
            },
          });
      }
      const usable = strips.filter((s) => s.rect.v1 - s.rect.v0 >= 2.5);
      // Order spaces: by declared side preference, then data order.
      const want = (s: Space) =>
        s.side === 'left' ? 'left' : s.side === 'right' ? 'right' : undefined;
      const byOrder = (a: Space, b: Space) => (a.order ?? 99) - (b.order ?? 99);
      const queue: Record<string, Space[]> = { left: [], right: [], any: [] };
      for (const s of spaces.sort(byOrder)) queue[want(s) ?? 'any']!.push(s);
      // Assign to strips proportionally to strip length.
      const total = usable.reduce((t, s) => t + (s.rect.u1 - s.rect.u0), 0);
      const capacity = new Map(
        usable.map((s) => [
          s,
          Math.max(
            1,
            Math.round((spaces.length * (s.rect.u1 - s.rect.u0)) / total),
          ),
        ]),
      );
      const assigned = new Map<(typeof usable)[number], Space[]>(
        usable.map((s) => [s, []]),
      );
      const place = (space: Space, side?: 'left' | 'right') => {
        const candidates = usable.filter(
          (s) =>
            !side || s.side === side || !usable.some((x) => x.side === side),
        );
        const strip =
          candidates.find((s) => assigned.get(s)!.length < capacity.get(s)!) ??
          [...candidates].sort(
            (a, b) =>
              assigned.get(a)!.length / capacity.get(a)! -
              assigned.get(b)!.length / capacity.get(b)!,
          )[0]!;
        assigned.get(strip)!.push(space);
      };
      queue.left!.forEach((s) => place(s, 'left'));
      queue.right!.forEach((s) => place(s, 'right'));
      queue.any!.forEach((s) => place(s));
      for (const [strip, list] of assigned) {
        const facing = strip.side === 'right' ? -1 : 1; // toward the corridor
        const corridorEdge =
          strip.side === 'right' ? strip.rect.v0 : strip.rect.v1;
        const outerEdge =
          strip.side === 'right' ? strip.rect.v1 : strip.rect.v0;
        const doors: [number, number][] = [];
        slots(strip.rect.u0, strip.rect.u1, Math.max(list.length, 1)).forEach(
          ([a, b], i) => {
            const space = list[i];
            if (i > 0)
              walls.push(
                ...wallAlongV(
                  a,
                  Math.min(corridorEdge, outerEdge),
                  Math.max(corridorEdge, outerEdge),
                  y0,
                  y1,
                ),
              );
            if (!space) return;
            const r = { u0: a, u1: b, v0: strip.rect.v0, v1: strip.rect.v1 };
            const mid = (a + b) / 2;
            doors.push([mid - DOOR_WIDTH / 2, mid + DOOR_WIDTH / 2]);
            rooms.push(
              roomOf(
                space,
                floor,
                slab.base,
                r,
                { u: mid, v: corridorEdge },
                { u: 0, v: facing },
                frame,
              ),
            );
          },
        );
        walls.push(
          ...wallAlongU(
            corridorEdge,
            strip.rect.u0,
            strip.rect.u1,
            y0,
            y1,
            doors,
          ),
        );
        // Close the strip ends against the hall.
        walls.push(
          ...wallAlongV(
            strip.rect.u0,
            Math.min(corridorEdge, outerEdge),
            Math.max(corridorEdge, outerEdge),
            y0,
            y1,
          ),
        );
        walls.push(
          ...wallAlongV(
            strip.rect.u1,
            Math.min(corridorEdge, outerEdge),
            Math.max(corridorEdge, outerEdge),
            y0,
            y1,
          ),
        );
      }
      floors.push({
        floorId: floor.id,
        level: floor.level,
        label: floor.label,
        base: slab.base,
        top: slab.top,
        rooms,
        corridor: {
          u0: interior.u0,
          u1: interior.u1,
          v0: corridorV[0]!,
          v1: corridorV[1]!,
        },
      });
      return;
    }
    floors.push({
      floorId: floor.id,
      level: floor.level,
      label: floor.label,
      base: slab.base,
      top: slab.top,
      rooms,
    });
  });

  return {
    buildingId: building.id,
    frame,
    interior,
    vestibule,
    hall,
    shaft,
    lane,
    door: {
      // Centre of the vestibule's facade end (aligned with the opening).
      position: alongU
        ? toWorld(
            frame,
            inwardLocal[0] > 0 ? vestibule.u0 : vestibule.u1,
            (vestibule.v0 + vestibule.v1) / 2,
          )
        : toWorld(
            frame,
            (vestibule.u0 + vestibule.u1) / 2,
            inwardLocal[1] > 0 ? vestibule.v0 : vestibule.v1,
          ),
      edge,
      width: ENTRY_WIDTH,
      height: ENTRY_HEIGHT,
    },
    floors,
    walls,
    slabs,
    ramps,
    layoutConfidence: 'placeholder',
  };
}

function roomOf(
  space: Space,
  floor: Building['floors'][number],
  base: number,
  rect: Rect,
  door: { u: number; v: number },
  doorFacing: { u: number; v: number },
  frame: Frame,
): RoomLayout {
  const c = toWorld(frame, (rect.u0 + rect.u1) / 2, (rect.v0 + rect.v1) / 2);
  return {
    spaceId: space.id,
    ...(space.code ? { code: space.code } : {}),
    name: space.name,
    kind: space.kind,
    confidence: space.confidence,
    floorId: floor.id,
    level: floor.level,
    rect,
    door,
    doorFacing,
    anchor: [c[0], base, c[1]],
    polygon: rectPolygon(frame, rect),
  };
}

/** Which room (if any) contains a world point on a given floor. */
export function roomAt(
  layout: InteriorLayout,
  point: Vec2,
  floorId: string,
): RoomLayout | undefined {
  const [u, v] = toLocal(layout.frame, point);
  return layout.floors
    .find((f) => f.floorId === floorId)
    ?.rooms.find((r) => inRect(r.rect, u, v));
}

/** Floor the feet height belongs to inside this building. */
export function floorAt(layout: InteriorLayout, y: number): FloorLayout {
  let current = layout.floors[0]!;
  for (const f of layout.floors) if (y >= f.base - 0.6) current = f;
  return current;
}

/** True when a world point is inside the interior (or vestibule) of the building. */
export function insideInterior(layout: InteriorLayout, point: Vec2): boolean {
  const [u, v] = toLocal(layout.frame, point);
  return inRect(layout.interior, u, v) || inRect(layout.vestibule, u, v, 0.05);
}

// ---- Colliders (simplified boxes; never from render meshes) ----

const yawOf = (f: Frame) => Math.atan2(-f.u[1], f.u[0]);

/** Box colliders for walls, slabs and stair ramps of one interior. */
export function interiorColliders(layout: InteriorLayout): StaticCollider[] {
  const f = layout.frame;
  const yaw = yawOf(f);
  const out: StaticCollider[] = [];
  layout.walls.forEach((w, i) => {
    const a = toWorld(f, w.a[0], w.a[1]),
      b = toWorld(f, w.b[0], w.b[1]);
    const dx = b[0] - a[0],
      dz = b[1] - a[1];
    out.push({
      kind: 'box',
      id: `interior:${layout.buildingId}:wall:${i}`,
      center: [(a[0] + b[0]) / 2, (w.y0 + w.y1) / 2, (a[1] + b[1]) / 2],
      // Extend by half the thickness so corners close.
      halfExtents: [
        Math.hypot(dx, dz) / 2 + w.thickness / 2,
        (w.y1 - w.y0) / 2,
        w.thickness / 2,
      ],
      rotationY: Math.atan2(-dz, dx),
    });
  });
  layout.slabs.forEach((s, i) => {
    const c = toWorld(
      f,
      (s.rect.u0 + s.rect.u1) / 2,
      (s.rect.v0 + s.rect.v1) / 2,
    );
    out.push({
      kind: 'box',
      id: `interior:${layout.buildingId}:slab:${i}`,
      center: [c[0], s.top - s.thickness / 2, c[1]],
      halfExtents: [
        (s.rect.u1 - s.rect.u0) / 2,
        s.thickness / 2,
        (s.rect.v1 - s.rect.v0) / 2,
      ],
      rotationY: yaw,
    });
  });
  // M10 room doors: one leaf per doorway. Physics enables the collider only
  // while the door is shut; the navmesh ignores "door:" colliders.
  for (const floor of layout.floors)
    for (const room of floor.rooms) {
      if (!hasDoorLeaf(room)) continue;
      const c = toWorld(f, room.door.u, room.door.v);
      const along = toWorld(f, -room.doorFacing.v, room.doorFacing.u);
      const dx = along[0] - f.origin[0],
        dz = along[1] - f.origin[1];
      out.push({
        kind: 'box',
        id: `door:${room.spaceId}`,
        center: [c[0], room.anchor[1] + DOOR_LEAF_HEIGHT / 2, c[1]],
        halfExtents: [DOOR_WIDTH / 2, DOOR_LEAF_HEIGHT / 2, 0.06],
        rotationY: Math.atan2(-dz, dx),
      });
    }
  layout.ramps.forEach((r, i) => {
    const t = 0.2;
    const run = r.rect.u1 - r.rect.u0,
      rise = r.y1 - r.y0;
    const angle = Math.atan2(rise, run);
    const uMid = (r.rect.u0 + r.rect.u1) / 2 + Math.sin(angle) * (t / 2);
    const yMid = (r.y0 + r.y1) / 2 - Math.cos(angle) * (t / 2);
    const c = toWorld(f, uMid, (r.rect.v0 + r.rect.v1) / 2);
    out.push({
      kind: 'box',
      id: `interior:${layout.buildingId}:ramp:${i}`,
      center: [c[0], yMid, c[1]],
      halfExtents: [
        Math.hypot(run, rise) / 2,
        t / 2,
        (r.rect.v1 - r.rect.v0) / 2,
      ],
      rotationY: yaw,
      tiltZ: angle,
    });
  });
  return out;
}

/** Everything the physics world needs for the campus with these interiors. */
export function campusPhysicsInput(
  campus: Campus,
  layouts: InteriorLayout[],
  staticCollidersFn: (
    campus: Campus,
    doors: Record<
      string,
      { edge: number; center: Vec2; width: number; height: number }
    >,
  ) => StaticCollider[],
) {
  const doors = Object.fromEntries(
    layouts.map((l) => [
      l.buildingId,
      {
        edge: l.door.edge,
        center: l.door.position,
        width: l.door.width,
        height: l.door.height,
      },
    ]),
  );
  return {
    colliders: [
      ...staticCollidersFn(campus, doors),
      ...layouts.flatMap(interiorColliders),
    ],
    groundHoles: layouts.map((l) => rectPolygon(l.frame, l.interior)),
  };
}
