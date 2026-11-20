import type { Campus, Vec2 } from '../types/campus';
import { centroid } from './geometry-utils';
import { gateSpawn, inwardOf, pointInPolygon } from './campus-geometry';
import type { InteriorLayout, RoomLayout } from './interior';
import { toWorld } from './interior';
import { DAYS } from './time';

// M9 NPC population and daily plans (GAMEPLAY_SPEC §8). Pure and seeded:
// the same day always produces the same plans.

export type Archetype =
  | 'student'
  | 'faculty'
  | 'guard'
  | 'cafe_staff'
  | 'librarian'
  | 'medical'
  | 'shopkeeper';

export type Vec3 = [number, number, number];

/** A place to go and when to leave it (game minutes after midnight). */
export interface Activity {
  kind: 'arrive' | 'class' | 'lunch' | 'library' | 'work' | 'prayer' | 'leave';
  label: string;
  position: Vec3;
  /** Earliest start (game minutes). */
  from: number;
  /** Leave for the next activity at or after this time. */
  until: number;
  /** Queue at a counter before dwelling (cafe, library desk). */
  queue?: 'cafe' | 'library';
  /** Sit while dwelling (classes, meals). */
  sit?: boolean;
  /** Room id when inside a block (for checks and labels). */
  spaceId?: string;
}

export interface NpcDay {
  id: string;
  archetype: Archetype;
  body: 'male' | 'female';
  /** Where the NPC appears (just inside a gate) and when. */
  spawn: Vec3;
  spawnAt: number;
  activities: Activity[];
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, list: readonly T[]): T =>
  list[Math.floor(r() * list.length)]!;
const between = (r: () => number, a: number, b: number) => a + r() * (b - a);

/**
 * Random point inside a room (inset from walls), at floor level. Room
 * rectangles can run past an irregular footprint, so with a footprint the
 * point (and a 1 m margin around it) must also be inside the building.
 */
export function pointInRoom(
  layout: InteriorLayout,
  room: RoomLayout,
  r: () => number,
  footprint?: Vec2[],
): Vec3 {
  const inset = 1;
  const inside = (x: number, z: number) =>
    !footprint ||
    [
      [0, 0],
      [inset, 0],
      [-inset, 0],
      [0, inset],
      [0, -inset],
    ].every(([dx, dz]) => pointInPolygon([x + dx!, z + dz!], footprint));
  let p: Vec2 = [room.anchor[0], room.anchor[2]];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const u = between(
      r,
      room.rect.u0 + inset,
      Math.max(room.rect.u0 + inset, room.rect.u1 - inset),
    );
    const v = between(
      r,
      room.rect.v0 + inset,
      Math.max(room.rect.v0 + inset, room.rect.v1 - inset),
    );
    const q = toWorld(layout.frame, u, v);
    if (inside(q[0], q[1])) {
      p = q;
      break;
    }
  }
  return [p[0], room.anchor[1], p[1]];
}

export interface NpcWorldInfo {
  campus: Campus;
  layouts: InteriorLayout[];
}

const roomsOf = (info: NpcWorldInfo, buildingIds: string[], kinds: string[]) =>
  info.layouts
    .filter((l) => buildingIds.includes(l.buildingId))
    .flatMap((l) =>
      l.floors.flatMap((f) =>
        f.rooms
          .filter((r) => kinds.includes(r.kind))
          .map((room) => ({ layout: l, room })),
      ),
    );
const footprintOf = (info: NpcWorldInfo, layout: InteriorLayout) =>
  info.campus.buildings.find((b) => b.id === layout.buildingId)?.footprint ??
  undefined;
const spotIn = (
  info: NpcWorldInfo,
  place: { layout: InteriorLayout; room: RoomLayout },
  r: () => number,
) => pointInRoom(place.layout, place.room, r, footprintOf(info, place.layout));
const roomById = (info: NpcWorldInfo, id: string) =>
  info.layouts
    .flatMap((l) =>
      l.floors.flatMap((f) => f.rooms.map((room) => ({ layout: l, room }))),
    )
    .find((x) => x.room.spaceId === id);

/** Points just inside each gate students can use (all but the Jummah gate). */
export function entryGates(campus: Campus): { id: string; position: Vec3 }[] {
  return campus.gates
    .filter((g) => g.position && g.heading !== undefined && !g.opens)
    .map((g) => {
      const [ix, iz] = inwardOf(g.heading!);
      return {
        id: g.id,
        position: [g.position![0] + ix * 4, 0, g.position![1] + iz * 4] as Vec3,
      };
    });
}

/** Students on campus that day (0 on Sundays, fewer on Saturdays). */
export const studentsFor = (day: number, pool: number) =>
  DAYS[day] === 'Sun'
    ? Math.round(pool * 0.05)
    : DAYS[day] === 'Sat'
      ? Math.round(pool * 0.3)
      : pool;

export const STUDENT_POOL = 110;
export const FACULTY = 8;

/** Every NPC's plan for one day (weekday from M5's clock). */
export function planDay(info: NpcWorldInfo, day: number): NpcDay[] {
  const { campus } = info;
  const gates = entryGates(campus);
  const origin = gateSpawn(campus);
  const fallbackGate: Vec3 = [origin.position[0], 0, origin.position[1]];
  const leaveGate = (r: () => number) =>
    gates.length ? pick(r, gates).position : fallbackGate;
  const weekday = day <= 4;
  const friday = DAYS[day] === 'Fri';
  const cafe = roomById(info, 'F-G-CAFE');
  const library = roomById(info, 'E-G-LIBRARY');
  const masjid = campus.areas.find((a) => a.kind === 'masjid')?.polygon;
  const masjidPoint: Vec3 | undefined = masjid
    ? [...centroidXZ(masjid)]
    : undefined;
  const npcs: NpcDay[] = [];

  // Guards: one inside each gate, around the clock.
  campus.gates.forEach((g, i) => {
    if (!g.position || g.heading === undefined) return;
    const [ix, iz] = inwardOf(g.heading);
    const post: Vec3 = [
      g.position[0] + ix * 3 + iz * 3,
      0,
      g.position[1] + iz * 3 - ix * 3,
    ];
    npcs.push({
      id: `guard-${g.id}`,
      archetype: 'guard',
      body: i % 3 === 2 ? 'female' : 'male',
      spawn: post,
      spawnAt: 0,
      activities: [
        {
          kind: 'work',
          label: `${g.label} post`,
          position: post,
          from: 0,
          until: 24 * 60,
        },
      ],
    });
  });

  // Staff at fixed workplaces (opening hours are placeholders, OPEN_QUESTIONS #46).
  const staff: [
    Archetype,
    string,
    string | undefined,
    number,
    number,
    boolean,
  ][] = [
    [
      'cafe_staff',
      'cafe-1',
      cafe?.room.spaceId,
      7 * 60 + 30,
      21 * 60,
      day !== 6,
    ],
    ['cafe_staff', 'cafe-2', cafe?.room.spaceId, 8 * 60, 18 * 60, weekday],
    [
      'librarian',
      'library-1',
      library?.room.spaceId,
      8 * 60,
      20 * 60,
      day !== 6,
    ],
    ['medical', 'medical-1', 'C-G-MEDICAL', 8 * 60, 17 * 60, weekday],
  ];
  for (const [archetype, id, spaceId, from, until, on] of staff) {
    if (!on || !spaceId) continue;
    const place = roomById(info, spaceId);
    if (!place) continue;
    const r = rng(hash(`${id}:${day}`));
    const desk = place.room.anchor;
    npcs.push({
      id,
      archetype,
      body: r() < 0.5 ? 'male' : 'female',
      spawn: leaveGate(r),
      spawnAt: from - 90,
      activities: [
        {
          kind: 'work',
          label: place.room.name,
          position: desk,
          from,
          until,
          spaceId,
        },
        {
          kind: 'leave',
          label: 'Leave',
          position: leaveGate(r),
          from: until,
          until: until,
        },
      ],
    });
  }
  for (const area of campus.areas.filter(
    (a) => a.kind === 'shop' && a.polygon,
  )) {
    if (DAYS[day] === 'Sun') continue;
    const r = rng(hash(`shop-${area.id}:${day}`));
    const counter: Vec3 = [...centroidXZ(area.polygon!)];
    // A street-side shop (outside the wall) closes up rather than walking in.
    const street = campus.boundary.polygon
      ? !pointInPolygon([counter[0], counter[2]], campus.boundary.polygon)
      : false;
    npcs.push({
      id: `shopkeeper-${area.id}`,
      archetype: 'shopkeeper',
      body: 'male',
      spawn: counter,
      spawnAt: 8 * 60,
      activities: [
        {
          kind: 'work',
          label: area.label,
          position: counter,
          from: 8 * 60,
          until: 20 * 60,
        },
        ...(street
          ? []
          : [
              {
                kind: 'leave' as const,
                label: 'Leave',
                position: leaveGate(r),
                from: 20 * 60,
                until: 20 * 60,
              },
            ]),
      ],
    });
  }

  // Faculty: offices in F, teach one class, leave in the evening.
  const offices = roomById(info, 'F-1-FACULTYOFFICES');
  for (let i = 0; i < (weekday ? FACULTY : 0); i += 1) {
    const r = rng(hash(`faculty-${i}:${day}`));
    if (!offices) break;
    const teach = pick(r, roomsOf(info, ['C', 'D', 'B', 'F'], ['classroom']));
    const arrive = between(r, 7 * 60 + 30, 9 * 60);
    const activities: Activity[] = [
      {
        kind: 'work',
        label: 'Faculty Offices',
        position: spotIn(info, offices, r),
        from: arrive,
        until: arrive + 120,
        spaceId: offices.room.spaceId,
      },
      {
        kind: 'class',
        label: `Teach in ${teach.room.code ?? teach.room.name}`,
        position: spotIn(info, teach, r),
        from: 11 * 60,
        until: 12 * 60 + 30,
        spaceId: teach.room.spaceId,
      },
    ];
    if (friday && masjidPoint && r() < 0.8)
      activities.push({
        kind: 'prayer',
        label: 'Jummah',
        position: masjidPoint,
        from: 12 * 60 + 50,
        until: 13 * 60 + 40,
      });
    activities.push(
      {
        kind: 'work',
        label: 'Faculty Offices',
        position: spotIn(info, offices, r),
        from: 14 * 60,
        until: between(r, 16 * 60, 17 * 60 + 30),
        spaceId: offices.room.spaceId,
      },
      {
        kind: 'leave',
        label: 'Leave',
        position: leaveGate(r),
        from: 17 * 60,
        until: 17 * 60,
      },
    );
    npcs.push({
      id: `faculty-${i}`,
      archetype: 'faculty',
      body: r() < 0.6 ? 'male' : 'female',
      spawn: leaveGate(r),
      spawnAt: arrive - 60,
      activities,
    });
  }

  // Students: gate → their block → class → cafe (lunch) → class/library → leave.
  const departments = campus.departments;
  for (let i = 0; i < studentsFor(day, STUDENT_POOL); i += 1) {
    const r = rng(hash(`student-${i}:${day}`));
    const department = departments[i % departments.length]!;
    const classes = roomsOf(info, department.buildingIds, ['classroom', 'lab']);
    if (!classes.length || !cafe) continue;
    const gate = pick(
      r,
      gates.length ? gates : [{ id: 'G5', position: fallbackGate }],
    );
    const arrive = weekday
      ? between(r, 7 * 60, 9 * 60 + 30)
      : between(r, 9 * 60, 12 * 60);
    const first = pick(r, classes);
    const second = pick(r, classes);
    const activities: Activity[] = [
      {
        kind: 'class',
        label: `Class in ${first.room.code ?? first.room.name}`,
        position: spotIn(info, first, r),
        from: arrive,
        until: 11 * 60 + between(r, 0, 60),
        sit: true,
        spaceId: first.room.spaceId,
      },
      {
        kind: 'lunch',
        label: 'Lunch at the cafe',
        position: spotIn(info, cafe, r),
        from: 12 * 60,
        until: 13 * 60 + between(r, 0, 40),
        queue: 'cafe',
        sit: true,
        spaceId: cafe.room.spaceId,
      },
    ];
    const male = r() < 0.6;
    if (friday && male && masjidPoint && r() < 0.7)
      activities.push({
        kind: 'prayer',
        label: 'Jummah',
        position: masjidPoint,
        from: 12 * 60 + 50,
        until: 13 * 60 + 40,
      });
    if (library && r() < 0.35)
      activities.push({
        kind: 'library',
        label: 'Library',
        position: spotIn(info, library, r),
        from: 14 * 60,
        until: 15 * 60 + between(r, 0, 60),
        queue: 'library',
        sit: true,
        spaceId: library.room.spaceId,
      });
    else
      activities.push({
        kind: 'class',
        label: `Class in ${second.room.code ?? second.room.name}`,
        position: spotIn(info, second, r),
        from: 14 * 60,
        until: 15 * 60 + between(r, 30, 120),
        sit: true,
        spaceId: second.room.spaceId,
      });
    const leaveAt = Math.min(21 * 60, 16 * 60 + between(r, 0, 240));
    activities.push({
      kind: 'leave',
      label: 'Leave',
      position: leaveGate(r),
      from: leaveAt,
      until: leaveAt,
    });
    npcs.push({
      id: `student-${i}`,
      archetype: 'student',
      body: male ? 'male' : 'female',
      spawn: gate.position,
      spawnAt: arrive,
      activities,
    });
  }
  return npcs;
}

const centroidXZ = (polygon: Vec2[]): Vec3 => {
  const [x, z] = centroid(polygon);
  return [x, 0, z];
};

/** Stable 32-bit string hash for seeding. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
