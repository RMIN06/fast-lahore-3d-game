import { beforeAll, describe, expect, test } from 'vitest';
import campusJson from '../../data/campus.json';
import { loadCampus } from '../world/campus-loader';
import { INTERIOR_BLOCKS } from '../world/interiors';
import type { Vec2 } from '../types/campus';
import {
  edgeOutward,
  pointInPolygon,
  staticColliders,
} from './campus-geometry';
import {
  campusPhysicsInput,
  floorAt,
  generateInterior,
  insideInterior,
  roomAt,
  toLocal,
  toWorld,
} from './interior';
import type { InteriorLayout, Rect, RoomLayout } from './interior';
import { createPhysicsWorld, initRapier } from './physics';
import type { Rapier } from './physics';
import { PlayerController } from './player-controller';

const campus = loadCampus(campusJson, { mode: 'site-plan' }).campus;
const layouts = Object.fromEntries(
  campus.buildings.map((b) => [
    b.id,
    generateInterior(b, campus.meta.defaults),
  ]),
) as Record<string, InteriorLayout>;
const overlaps = (a: Rect, b: Rect) =>
  Math.min(a.u1, b.u1) - Math.max(a.u0, b.u0) > 0.05 &&
  Math.min(a.v1, b.v1) - Math.max(a.v0, b.v0) > 0.05;

describe('generated interiors (all blocks)', () => {
  for (const building of campus.buildings) {
    test(`${building.id}: every room in the data exists with its code and floor`, () => {
      const layout = layouts[building.id]!;
      expect(layout.floors.map((f) => f.floorId)).toEqual(
        [...building.floors].sort((a, b) => a.level - b.level).map((f) => f.id),
      );
      for (const floor of building.floors) {
        const generated = layout.floors.find((f) => f.floorId === floor.id)!;
        expect(generated.rooms.map((r) => r.spaceId).sort()).toEqual(
          floor.spaces.map((s) => s.id).sort(),
        );
        for (const room of generated.rooms) {
          const space = floor.spaces.find((s) => s.id === room.spaceId)!;
          expect(room.code).toBe(space.code);
          expect(room.name).toBe(space.name);
          expect(room.level).toBe(floor.level);
          // Inside the footprint, inside the interior, clear of hall and shaft.
          for (const p of room.polygon)
            expect(pointInPolygon(p, building.footprint!)).toBe(true);
          expect(overlaps(room.rect, layout.shaft)).toBe(false);
          // Located back from its anchor on the right floor.
          const found = roomAt(
            layout,
            [room.anchor[0], room.anchor[2]],
            floor.id,
          );
          expect(found?.spaceId).toBe(room.spaceId);
        }
        // Rooms on a floor never overlap each other.
        generated.rooms.forEach((a, i) =>
          generated.rooms
            .slice(i + 1)
            .forEach((b) => expect(overlaps(a.rect, b.rect)).toBe(false)),
        );
      }
    });
  }

  test('a stair ramp links every pair of adjacent floors (≤ 32°)', () => {
    for (const layout of Object.values(layouts)) {
      expect(layout.ramps.length).toBe(layout.floors.length - 1);
      layout.ramps.forEach((r, i) => {
        expect(r.fromFloor).toBe(layout.floors[i]!.floorId);
        expect(r.toFloor).toBe(layout.floors[i + 1]!.floorId);
        const slope =
          (Math.atan2(r.y1 - r.y0, r.rect.u1 - r.rect.u0) * 180) / Math.PI;
        expect(slope).toBeLessThan(32);
      });
    }
  });

  test('door sits on the entrance facade; vestibule reaches the interior', () => {
    for (const building of campus.buildings) {
      const layout = layouts[building.id]!;
      const entry = building.entries.find((e) => e.id === 'main')!.position!;
      expect(
        Math.hypot(
          layout.door.position[0] - entry[0],
          layout.door.position[1] - entry[1],
        ),
      ).toBeLessThan(15);
      const [u, v] = toLocal(layout.frame, layout.door.position);
      const near =
        Math.abs(u - layout.vestibule.u0) < 0.01 ||
        Math.abs(u - layout.vestibule.u1) < 0.01 ||
        Math.abs(v - layout.vestibule.v0) < 0.01 ||
        Math.abs(v - layout.vestibule.v1) < 0.01;
      expect(near).toBe(true);
      expect(insideInterior(layout, layout.door.position)).toBe(true);
    }
  });

  test('floor lookup by height', () => {
    const f = layouts.F!;
    expect(floorAt(f, -6.8).floorId).toBe('B2');
    expect(floorAt(f, 0).floorId).toBe('G');
    expect(floorAt(f, 7.3).floorId).toBe('2');
  });
});

// ---- Physics: walk from outside the door to every room (enabled blocks) ----

const DT = 1 / 60;
let R: Rapier;
beforeAll(async () => {
  R = await initRapier();
});

/** Waypoints (local u, v, expected floor index) from outside to a room. */
function route(layout: InteriorLayout, room: RoomLayout): [number, number][] {
  const L = layout;
  const s = L.shaft;
  const sv = (s.v0 + s.v1) / 2;
  const ground = L.floors.findIndex((f) => f.level === 0);
  const target = L.floors.findIndex((f) => f.floorId === room.floorId);
  const [du, dv] = toLocal(L.frame, L.door.position);
  const vc = {
    u: (L.vestibule.u0 + L.vestibule.u1) / 2,
    v: (L.vestibule.v0 + L.vestibule.v1) / 2,
  };
  const pts: [number, number][] = [];
  // From the door through the vestibule to the near landing of the stairs.
  const inward: [number, number] = [vc.u - du, vc.v - dv];
  const len = Math.hypot(...inward);
  pts.push([du + (inward[0] / len) * 0.5, dv + (inward[1] / len) * 0.5]);
  pts.push([vc.u, vc.v]);
  const innerU = Math.min(Math.max(vc.u, L.interior.u0 + 1), L.interior.u1 - 1);
  const innerV = Math.min(Math.max(vc.v, L.interior.v0 + 1), L.interior.v1 - 1);
  pts.push([innerU, innerV]);
  const nearLanding: [number, number] = [s.u0 - 1, L.lane];
  const farLanding: [number, number] = [s.u1 + 1, L.lane];
  pts.push(nearLanding);
  for (let k = ground; k < target; k += 1) {
    // Up: in at the near end, out at the far end, back round the lane.
    pts.push([s.u0 - 0.6, sv], [s.u1 + 1, sv], farLanding, nearLanding);
  }
  for (let k = ground; k > target; k -= 1) {
    // Down: round to the far end, enter the top of the lower ramp, descend.
    pts.push(farLanding, [s.u1 + 0.6, sv], [s.u0 - 1, sv], nearLanding);
  }
  // Across the hall to the room's door, then inside.
  const floor = L.floors[target]!;
  const corridorV = floor.corridor
    ? (floor.corridor.v0 + floor.corridor.v1) / 2
    : room.door.v;
  const hallEdge =
    room.rect.u1 <= L.hall.u0 + 0.01 ? L.hall.u0 + 0.6 : L.hall.u1 - 0.6;
  pts.push([
    hallEdge,
    floor.corridor ? corridorV : (L.hall.v0 + L.hall.v1) / 2,
  ]);
  if (floor.corridor) pts.push([room.door.u, corridorV]);
  pts.push([
    room.door.u + room.doorFacing.u * 1,
    room.door.v + room.doorFacing.v * 1,
  ]);
  pts.push([
    room.door.u - room.doorFacing.u * 1.2,
    room.door.v - room.doorFacing.v * 1.2,
  ]);
  pts.push([
    (room.rect.u0 + room.rect.u1) / 2,
    (room.rect.v0 + room.rect.v1) / 2,
  ]);
  return pts;
}

describe(
  'walk from outside the main door to every room (enabled blocks)',
  { timeout: 120_000 },
  () => {
    for (const id of INTERIOR_BLOCKS) {
      test(`${id}: every floor and room is reachable on foot via the stairs`, () => {
        const layout = layouts[id]!;
        const physics = campusPhysicsInput(campus, [layout], staticColliders);
        const building = campus.buildings.find((b) => b.id === id)!;
        const outward = edgeOutward(building.footprint!, layout.door.edge);
        const start: Vec2 = [
          layout.door.position[0] + outward[0] * 2.5,
          layout.door.position[1] + outward[1] * 2.5,
        ];
        const lowest = layout.floors[0]!.base;
        const failures: string[] = [];
        for (const floor of layout.floors)
          for (const room of floor.rooms) {
            const world = createPhysicsWorld(R, physics.colliders, {
              groundCenter: start,
              groundHalfSize: 400,
              groundHoles: physics.groundHoles,
            });
            const player = new PlayerController(R, world, [
              start[0],
              0,
              start[1],
            ]);
            const path = route(layout, room).map(([u, v]) =>
              toWorld(layout.frame, u, v),
            );
            let i = 0;
            for (let t = 0; t < 120 && i < path.length; t += DT) {
              const [x, y, z] = player.feet();
              if (y < lowest - 0.5) break;
              const p = path[i]!;
              const dx = p[0] - x,
                dz = p[1] - z;
              if (Math.hypot(dx, dz) < 0.45) {
                i += 1;
                continue;
              }
              player.step(DT, {
                forward: 1,
                right: 0,
                sprint: false,
                jump: false,
                yaw: Math.atan2(-dx, -dz),
              });
            }
            const [x, y, z] = player.feet();
            const ok =
              Math.hypot(x - room.anchor[0], z - room.anchor[2]) < 1.2 &&
              Math.abs(y - room.anchor[1]) < 0.4;
            if (!ok)
              failures.push(
                `${room.spaceId}: ended at waypoint ${i}/${path.length} (${x.toFixed(1)}, ${y.toFixed(2)}, ${z.toFixed(1)}) vs anchor (${room.anchor.map((n) => n.toFixed(1)).join(', ')})`,
              );
            world.free();
          }
        expect(failures).toEqual([]);
      });
    }
  },
);
