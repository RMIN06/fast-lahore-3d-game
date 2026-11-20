import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, test } from 'vitest';
import { importNavMesh, init, NavMeshQuery } from 'recast-navigation';
import type { NavMesh } from 'recast-navigation';
import campusJson from '../../data/campus.json';
import navMeta from '../../public/navmesh/campus.json';
import { loadCampus } from '../world/campus-loader';
import { campusPhysics, interiorLayouts } from '../world/interiors';
import { createNpcSim } from '../world/npc-world';
import { navMeshInput, navMeshInputHash } from './navmesh';
import { planDay, STUDENT_POOL } from './npc';
import type { NpcDay } from './npc';
import { ACTIVE_CAP } from './npc-sim';
import { insideInterior } from './interior';

const campus = loadCampus(campusJson, { mode: 'site-plan' }).campus;
const info = { campus, layouts: interiorLayouts(campus) };
let navMesh: NavMesh;

beforeAll(async () => {
  await init();
  const bytes = readFileSync(
    new URL('../../public/navmesh/campus.bin', import.meta.url),
  );
  navMesh = importNavMesh(new Uint8Array(bytes)).navMesh;
});

test('the committed navmesh matches the current campus geometry (run npm run build:navmesh)', () => {
  const physics = campusPhysics(campus);
  const input = navMeshInput(campus, physics.colliders, physics.groundHoles);
  expect(navMeshInputHash(input.positions, input.indices)).toBe(
    navMeta.inputHash,
  );
});

test('navmesh reaches every room on every floor and the Masjid from Gate-5', () => {
  const query = new NavMeshQuery(navMesh);
  const he = { halfExtents: { x: 2, y: 1.5, z: 2 } };
  const start = { x: 2, y: 0, z: 3.5 };
  const rooms = interiorLayouts(campus).flatMap((l) =>
    l.floors.flatMap((f) => f.rooms),
  );
  expect(rooms.length).toBe(106);
  for (const room of rooms) {
    const end = { x: room.anchor[0], y: room.anchor[1], z: room.anchor[2] };
    const r = query.computePath(start, end, he);
    const last = r.path.at(-1)!;
    expect(r.success, room.spaceId).toBe(true);
    expect(
      Math.hypot(last.x - end.x, last.z - end.z),
      room.spaceId,
    ).toBeLessThan(1);
    expect(Math.abs(last.y - end.y), room.spaceId).toBeLessThan(0.5);
  }
});

describe('daily plans (archetypes, schedules, density)', () => {
  const count = (plans: NpcDay[], a: string) =>
    plans.filter((p) => p.archetype === a).length;
  test('weekday population: students, faculty, guards at every gate, staff and shopkeepers', () => {
    const monday = planDay(info, 0);
    expect(count(monday, 'student')).toBe(STUDENT_POOL);
    expect(count(monday, 'faculty')).toBe(8);
    expect(count(monday, 'guard')).toBe(campus.gates.length);
    expect(count(monday, 'cafe_staff')).toBe(2);
    expect(count(monday, 'librarian')).toBe(1);
    expect(count(monday, 'medical')).toBe(1);
    expect(count(monday, 'shopkeeper')).toBe(
      campus.areas.filter((a) => a.kind === 'shop').length,
    );
    // Deterministic per day.
    expect(planDay(info, 0)).toEqual(monday);
  });
  test('weekend: quieter Saturday, near-empty Sunday (guards remain)', () => {
    const sat = planDay(info, 5),
      sun = planDay(info, 6);
    expect(count(sat, 'student')).toBeLessThan(STUDENT_POOL / 2);
    expect(count(sun, 'student')).toBeLessThan(10);
    expect(count(sun, 'faculty')).toBe(0);
    expect(count(sun, 'guard')).toBe(campus.gates.length);
  });
  test('students go gate → class in their block → cafe (lunch) → … → leave; Jummah on Fridays', () => {
    for (const plan of planDay(info, 0).filter(
      (p) => p.archetype === 'student',
    )) {
      const kinds = plan.activities.map((a) => a.kind);
      expect(kinds[0]).toBe('class');
      expect(kinds[1]).toBe('lunch');
      expect(kinds.at(-1)).toBe('leave');
    }
    const friday = planDay(info, 4);
    expect(
      friday.some((p) => p.activities.some((a) => a.kind === 'prayer')),
    ).toBe(true);
    expect(
      planDay(info, 0).some((p) =>
        p.activities.some((a) => a.kind === 'prayer'),
      ),
    ).toBe(false);
  });
});

test(
  '24 h simulated day: NPCs walk gate → block → class → cafe and never get stuck; ≤ 60 active',
  { timeout: 240_000 },
  () => {
    // Observer at the busiest point: the A/C/D courtyard; everyone in range.
    const { sim, crowd } = createNpcSim(navMesh, campus, {
      activeRadius: Infinity,
    });
    const observer: [number, number, number] = [40, 0, 95];
    const dt = 0.25;
    let presentAt3 = 0,
      presentAt11 = 0;
    // At ×1 one game minute is one real second: 1440 s is a full day.
    for (let t = 0; t < 1440; t += dt) {
      sim.update(dt, { day: 0, minutes: t }, observer);
      if (Math.abs(t - 180) < dt / 2) presentAt3 = sim.present.length;
      if (Math.abs(t - 660) < dt / 2) presentAt11 = sim.present.length;
      expect(sim.active.length).toBeLessThanOrEqual(ACTIVE_CAP);
    }
    const students = sim.npcs.filter((n) => n.day.archetype === 'student');
    // Every student: arrived in a class (inside their department's block), then the cafe.
    for (const s of students) {
      const kinds = s.arrivals.map((a) => a.kind);
      expect(kinds.indexOf('class'), s.day.id).toBeGreaterThanOrEqual(0);
      expect(kinds.indexOf('lunch'), s.day.id).toBeGreaterThan(
        kinds.indexOf('class'),
      );
      const first = s.arrivals[0]!;
      const layout = interiorLayouts(campus).find((l) =>
        l.floors.some((f) => f.rooms.some((r) => r.spaceId === first.spaceId)),
      )!;
      const department = campus.departments.find((d) =>
        d.buildingIds.includes(layout.buildingId),
      );
      expect(department, s.day.id).toBeDefined();
    }
    expect(sim.stats.stuck).toBe(0);
    console.log(
      'M9 24h stats',
      JSON.stringify(sim.stats),
      'present@3',
      presentAt3,
      'present@11',
      presentAt11,
    );
    expect(sim.stats.pathFailures).toBe(0);
    expect(sim.stats.maxActive).toBe(ACTIVE_CAP); // the cap was reached and held
    // Density by time: night is guards only; late morning is busy.
    expect(presentAt3).toBe(campus.gates.length);
    expect(presentAt11).toBeGreaterThan(80);
    // Everyone except guards has left by the end of the day.
    expect(sim.present.every((n) => n.day.archetype === 'guard')).toBe(true);
    // Queues formed and were served at the cafe.
    expect(
      students.every((s) => s.arrivals.some((a) => a.kind === 'lunch')),
    ).toBe(true);
    crowd.destroy();
    void insideInterior;
  },
);

test('loading mid-day places NPCs at their current activity (no stampede from the gates)', () => {
  const { sim, crowd } = createNpcSim(navMesh, campus, {
    activeRadius: Infinity,
  });
  sim.update(0.1, { day: 0, minutes: 14 * 60 + 30 }, [40, 0, 95]);
  const students = sim.present.filter((n) => n.day.archetype === 'student');
  expect(students.length).toBeGreaterThan(80);
  // Everyone is already at an activity (dwelling), not walking in.
  expect(students.filter((n) => n.status === 'dwell').length).toBeGreaterThan(
    students.length * 0.9,
  );
  expect(students.every((n) => n.arrivals.length === 1)).toBe(true);
  expect(sim.stats.pathFailures).toBe(0);
  crowd.destroy();
});
