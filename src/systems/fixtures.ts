import type { Campus, Vec2 } from '../types/campus';
import { pointInPolygon } from './campus-geometry';
import { centroid } from './geometry-utils';
import type { InteriorLayout, RoomLayout } from './interior';
import { hasDoorLeaf, toWorld } from './interior';

// M10 fixtures: the things the player can use (seats, PCs, shelves, counters,
// benches, lecterns, prayer spots, parking, doors). Their positions are
// GENERATED from room and area geometry, like the M7 interiors, so they are
// placeholders (real furniture plans do not exist). Tasks refer to them by
// kind and place, never by coordinates.

export type FixtureKind =
  | 'seat'
  | 'pc'
  | 'lectern'
  | 'shelf'
  | 'counter'
  | 'desk'
  | 'bench'
  | 'prayer'
  | 'bay'
  | 'rack'
  | 'door';

/** Kinds you sit on (E sits, E or a movement key stands). */
export const SEATING: readonly FixtureKind[] = [
  'seat',
  'pc',
  'bench',
  'prayer',
];

export type Vec3 = [number, number, number];

export interface Fixture {
  id: string;
  kind: FixtureKind;
  /** Floor point to stand or sit at (feet), world metres. */
  position: Vec3;
  /** Facing (three.js yaw: 0 faces -Z) when using it. */
  yaw: number;
  /** Where it is: a room (space) in a building, or an outdoor area. */
  spaceId?: string;
  buildingId?: string;
  floorId?: string;
  areaId?: string;
  /** Shelf code (library) and other short labels for the prompt. */
  code?: string;
  label: string;
}

const yawOf = (dx: number, dz: number) => Math.atan2(-dx, -dz);

/** Library shelves: codes A1..F6 in reading order. */
export const SHELF_LETTERS = 'ABCDEF';

interface Ctx {
  layout: InteriorLayout;
  room: RoomLayout;
  footprint?: Vec2[];
  out: Fixture[];
}

/** Room-local helpers: d = depth from the door wall inward, w = across. */
function roomAxes(room: RoomLayout) {
  const into = { u: -room.doorFacing.u, v: -room.doorFacing.v };
  const across = { u: -into.v, v: into.u };
  const r = room.rect;
  const depth = Math.abs(into.u) > 0.5 ? r.u1 - r.u0 : r.v1 - r.v0;
  const width = Math.abs(into.u) > 0.5 ? r.v1 - r.v0 : r.u1 - r.u0;
  // Door-wall centre line (local), then step inward.
  const cu = (r.u0 + r.u1) / 2,
    cv = (r.v0 + r.v1) / 2;
  const wallU = Math.abs(into.u) > 0.5 ? (into.u > 0 ? r.u0 : r.u1) : cu;
  const wallV = Math.abs(into.v) > 0.5 ? (into.v > 0 ? r.v0 : r.v1) : cv;
  return { into, across, depth, width, wallU, wallV };
}

function place(
  ctx: Ctx,
  kind: FixtureKind,
  d: number,
  w: number,
  face: 'front' | 'back',
  index: number,
  extra: Partial<Fixture> = {},
) {
  const { layout, room, footprint, out } = ctx;
  const a = roomAxes(room);
  const u = a.wallU + a.into.u * d + a.across.u * w;
  const v = a.wallV + a.into.v * d + a.across.v * w;
  const [x, z] = toWorld(layout.frame, u, v);
  // Generated room rectangles can run past an irregular footprint.
  if (footprint && !pointInPolygon([x, z], footprint)) return;
  const sign = face === 'front' ? 1 : -1;
  const [fx, fz] = toWorld(layout.frame, a.into.u * sign, a.into.v * sign);
  const [ox, oz] = toWorld(layout.frame, 0, 0);
  out.push({
    id: `${kind}:${room.spaceId}:${index}`,
    kind,
    position: [x, room.anchor[1], z],
    yaw: yawOf(fx - ox, fz - oz),
    spaceId: room.spaceId,
    buildingId: layout.buildingId,
    floorId: room.floorId,
    label: room.code ?? room.name,
    ...extra,
  });
}

/** Rows of seats facing the far (front) wall, centred across the room. */
function seatGrid(
  ctx: Ctx,
  kind: 'seat' | 'pc',
  maxRows: number,
  maxCols: number,
  pitch: number,
) {
  const a = roomAxes(ctx.room);
  const rows = Math.max(
    1,
    Math.min(maxRows, Math.floor((a.depth - 3.2) / pitch)),
  );
  const cols = Math.max(
    1,
    Math.min(maxCols, Math.floor((a.width - 1.6) / pitch)),
  );
  let n = 0;
  for (let r = 0; r < rows; r += 1)
    for (let c = 0; c < cols; c += 1)
      place(
        ctx,
        kind,
        1.4 + r * pitch,
        (c - (cols - 1) / 2) * pitch,
        'front',
        n++,
      );
}

function lectern(ctx: Ctx) {
  const a = roomAxes(ctx.room);
  place(ctx, 'lectern', a.depth - 1, 0, 'back', 0);
}

function roomFixtures(ctx: Ctx) {
  const { room } = ctx;
  const a = roomAxes(room);
  switch (room.kind) {
    case 'classroom':
      seatGrid(ctx, 'seat', 5, 6, 1.1);
      lectern(ctx);
      break;
    case 'lab':
      seatGrid(ctx, 'pc', 4, 5, 1.4);
      lectern(ctx);
      break;
    case 'auditorium':
    case 'seminar_hall':
      seatGrid(ctx, 'seat', 8, 10, 1.0);
      lectern(ctx);
      break;
    case 'library': {
      place(ctx, 'counter', 1.6, 0, 'back', 0, { label: 'Issue desk' });
      // Shelves in the far half, study seats near the desk.
      let n = 0;
      for (let r = 0; r < SHELF_LETTERS.length; r += 1)
        for (let c = 0; c < 6; c += 1)
          place(
            ctx,
            'shelf',
            a.depth * 0.55 + r * 1.8,
            (c - 2.5) * 2.4,
            'front',
            n++,
            {
              code: `${SHELF_LETTERS[r]}${c + 1}`,
              label: `Shelf ${SHELF_LETTERS[r]}${c + 1}`,
            },
          );
      n = 0;
      for (let r = 0; r < 2; r += 1)
        for (let c = 0; c < 6; c += 1)
          place(ctx, 'seat', 4 + r * 1.6, (c - 2.5) * 1.6, 'front', n++, {
            label: 'Study desk',
          });
      break;
    }
    case 'cafe': {
      place(ctx, 'counter', 1.6, 0, 'back', 0, { label: 'Cafe counter' });
      let n = 0;
      for (let r = 0; r < 4; r += 1)
        for (let c = 0; c < 6; c += 1)
          place(
            ctx,
            'seat',
            5 + r * 1.8,
            (c - 2.5) * 1.6,
            r % 2 ? 'back' : 'front',
            n++,
            {
              label: 'Cafe table',
            },
          );
      break;
    }
    case 'office':
    case 'medical': {
      const counterLabel =
        room.kind === 'medical' ? 'Reception' : `${room.name} counter`;
      place(ctx, 'counter', 1.6, 0, 'back', 0, { label: counterLabel });
      if (room.spaceId.endsWith('FACULTYOFFICES') || room.kind === 'medical')
        for (let c = 0; c < 4; c += 1)
          place(ctx, 'desk', a.depth - 1.4, (c - 1.5) * 2.2, 'back', c, {
            label: room.kind === 'medical' ? 'Doctor' : 'Faculty desk',
          });
      break;
    }
    case 'common_room':
    case 'student_centre':
    case 'open_seating':
      for (let c = 0; c < 4; c += 1)
        place(ctx, 'bench', a.depth / 2, (c - 1.5) * 2.2, 'front', c, {
          label: `Bench (${room.name})`,
        });
      break;
    case 'parking':
      for (let c = 0; c < 4; c += 1)
        place(ctx, 'bay', a.depth / 2, (c - 1.5) * 3, 'front', c, {
          label: `${room.name} bay ${c + 1}`,
        });
      break;
    default:
      break;
  }
  // Every room with a doorway gets a door leaf (open by default).
  if (hasDoorLeaf(room)) {
    const [x, z] = toWorld(ctx.layout.frame, room.door.u, room.door.v);
    const [fx, fz] = toWorld(
      ctx.layout.frame,
      room.doorFacing.u,
      room.doorFacing.v,
    );
    const [ox, oz] = toWorld(ctx.layout.frame, 0, 0);
    ctx.out.push({
      id: `door:${room.spaceId}`,
      kind: 'door',
      position: [x, room.anchor[1], z],
      yaw: yawOf(fx - ox, fz - oz),
      spaceId: room.spaceId,
      buildingId: ctx.layout.buildingId,
      floorId: room.floorId,
      label: `Door · ${room.code ?? room.name}`,
    });
  }
}

/** Points on a grid around an area's centroid that stay inside it (margin). */
function areaPoints(
  polygon: Vec2[],
  count: number,
  spacing: number,
  margin = 1.2,
) {
  const [cx, cz] = centroid(polygon);
  const inside = (x: number, z: number) =>
    [
      [0, 0],
      [margin, 0],
      [-margin, 0],
      [0, margin],
      [0, -margin],
    ].every(([dx, dz]) => pointInPolygon([x + dx!, z + dz!], polygon));
  const out: Vec2[] = [];
  for (let ring = 0; out.length < count && ring < 12; ring += 1)
    for (let i = -ring; i <= ring && out.length < count; i += 1)
      for (let j = -ring; j <= ring && out.length < count; j += 1) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
        const x = cx + i * spacing,
          z = cz + j * spacing;
        if (inside(x, z)) out.push([x, z]);
      }
  return out;
}

function areaFixtures(campus: Campus, out: Fixture[]) {
  for (const area of campus.areas) {
    if (!area.polygon) continue;
    const [cx, cz] = centroid(area.polygon);
    const add = (
      kind: FixtureKind,
      p: Vec2,
      i: number,
      label: string,
      face?: Vec2,
    ) =>
      out.push({
        id: `${kind}:${area.id}:${i}`,
        kind,
        position: [p[0], 0, p[1]],
        yaw: face ? yawOf(face[0] - p[0], face[1] - p[1]) : 0,
        areaId: area.id,
        label,
      });
    const centre: Vec2 = [cx, cz];
    switch (area.kind) {
      case 'lawn':
        areaPoints(area.polygon, 6, 4).forEach((p, i) =>
          add('bench', p, i, `Bench (${area.label})`, centre),
        );
        break;
      case 'cafe':
      case 'shop': {
        // Counter at the centre; seating around it.
        add('counter', centre, 0, `${area.label} counter`);
        areaPoints(area.polygon, 5, 1.8, 0.6)
          .slice(1)
          .forEach((p, i) =>
            add('bench', p, i, `Bench (${area.label})`, centre),
          );
        break;
      }
      case 'masjid':
        areaPoints(area.polygon, 9, 1.4).forEach((p, i) =>
          // Qibla from Lahore is roughly west (bearing ~263°); placeholder.
          add('prayer', p, i, 'Prayer space', [cx - 50, cz]),
        );
        break;
      case 'parking':
        areaPoints(area.polygon, 4, 2.5, 0.8).forEach((p, i) =>
          add(
            area.id.includes('bike') ? 'rack' : 'bay',
            p,
            i,
            `${area.label} ${i + 1}`,
          ),
        );
        break;
      default:
        break;
    }
  }
}

const cache = new WeakMap<Campus, Fixture[]>();

/** Every fixture on campus (deterministic; cached per campus). */
export function campusFixtures(
  campus: Campus,
  layouts: InteriorLayout[],
): Fixture[] {
  let all = cache.get(campus);
  if (all) return all;
  all = [];
  for (const layout of layouts) {
    const footprint =
      campus.buildings.find((b) => b.id === layout.buildingId)?.footprint ??
      undefined;
    for (const floor of layout.floors)
      for (const room of floor.rooms)
        roomFixtures({ layout, room, footprint, out: all });
  }
  areaFixtures(campus, all);
  cache.set(campus, all);
  return all;
}
