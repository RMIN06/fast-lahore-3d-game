import { beforeAll, describe, expect, test } from 'vitest';
import campusJson from '../../data/campus.json';
import { loadCampus } from '../world/campus-loader';
import type { Vec2 } from '../types/campus';
import {
  campusBounds,
  gateSpawn,
  pointInPolygon,
  staticColliders,
} from './campus-geometry';
import type { StaticCollider } from './campus-geometry';
import { createPhysicsWorld, initRapier } from './physics';
import type { Rapier } from './physics';
import {
  cameraArmLength,
  DEFAULT_PLAYER,
  FixedStepper,
  PlayerController,
} from './player-controller';
import type { MoveInput } from './player-controller';

const campus = loadCampus(campusJson, { mode: 'site-plan' }).campus;
const DT = 1 / 60;
let R: Rapier;
beforeAll(async () => {
  R = await initRapier();
});

const box = (
  id: string,
  center: [number, number, number],
  halfExtents: [number, number, number],
  rotationY = 0,
): StaticCollider => ({ kind: 'box', id, center, halfExtents, rotationY });
const testWorld = (colliders: StaticCollider[]) =>
  createPhysicsWorld(R, colliders, {
    groundCenter: [0, 0],
    groundHalfSize: 200,
  });
const run = (
  player: PlayerController,
  seconds: number,
  input: Partial<MoveInput>,
) => {
  for (let t = 0; t < seconds; t += DT)
    player.step(DT, {
      forward: 0,
      right: 0,
      sprint: false,
      jump: false,
      yaw: 0,
      ...input,
    });
};

describe('kinematic capsule (synthetic world)', () => {
  test('stands on the ground at capsule height and walks forward at walk speed', () => {
    const world = testWorld([]);
    const player = new PlayerController(R, world, [0, 0.5, 0]);
    run(player, 1, {});
    expect(player.grounded).toBe(true);
    expect(player.feet()[1]).toBeCloseTo(0, 1);
    run(player, 2, { forward: 1 }); // yaw 0 faces -Z (north)
    expect(player.feet()[2]).toBeCloseTo(-2 * DEFAULT_PLAYER.walkSpeed, 0);
    expect(Math.abs(player.feet()[0])).toBeLessThan(0.01);
  });

  test('a resting player does not sink into the ground over time', () => {
    const player = new PlayerController(R, testWorld([]), [0, 0.3, 0]);
    run(player, 10, {});
    expect(player.grounded).toBe(true);
    expect(player.feet()[1]).toBeGreaterThan(-0.01);
    expect(player.feet()[1]).toBeLessThan(0.05);
  });

  test('sprint is faster than walking; strafing follows the camera yaw', () => {
    const world = testWorld([]);
    const walker = new PlayerController(R, world, [0, 0, 0]);
    run(walker, 1, { forward: 1 });
    const runner = new PlayerController(R, testWorld([]), [0, 0, 0]);
    run(runner, 1, { forward: 1, sprint: true });
    expect(-runner.feet()[2]).toBeGreaterThan(-walker.feet()[2] * 2.5);
    const strafer = new PlayerController(R, testWorld([]), [0, 0, 0]);
    run(strafer, 1, { right: 1, yaw: Math.PI / 2 }); // facing west, right is north
    expect(strafer.feet()[2]).toBeLessThan(-1);
    expect(Math.abs(strafer.feet()[0])).toBeLessThan(0.05);
  });

  test('jump leaves the ground and lands again', () => {
    const player = new PlayerController(R, testWorld([]), [0, 0, 0]);
    run(player, 0.5, {});
    let peak = 0;
    player.step(DT, {
      forward: 0,
      right: 0,
      sprint: false,
      jump: true,
      yaw: 0,
    });
    for (let t = 0; t < 1.5; t += DT) {
      player.step(DT, {
        forward: 0,
        right: 0,
        sprint: false,
        jump: false,
        yaw: 0,
      });
      peak = Math.max(peak, player.feet()[1]);
    }
    expect(peak).toBeGreaterThan(0.4);
    expect(player.grounded).toBe(true);
    expect(player.feet()[1]).toBeCloseTo(0, 1);
  });

  test('no tunnelling: even absurd speed cannot pass a 0.25 m wall', () => {
    const wall = box('wall', [0, 1.25, -5], [10, 1.25, 0.125]);
    const fast = { ...DEFAULT_PLAYER, sprintSpeed: 400 };
    const player = new PlayerController(R, testWorld([wall]), [0, 0, 0], fast);
    run(player, 2, { forward: 1, sprint: true });
    expect(player.feet()[2]).toBeGreaterThan(-5 + 0.125);
  });

  test('climbs a 0.25 m step but not a 0.6 m ledge', () => {
    const low = new PlayerController(
      R,
      testWorld([box('step', [0, 0.125, -5], [3, 0.125, 3])]),
      [0, 0, 0],
    );
    run(low, 3, { forward: 1 });
    expect(low.feet()[1]).toBeCloseTo(0.25, 1);
    const high = new PlayerController(
      R,
      testWorld([box('ledge', [0, 0.3, -5], [3, 0.3, 3])]),
      [0, 0, 0],
    );
    run(high, 3, { forward: 1 });
    expect(high.feet()[1]).toBeLessThan(0.1);
    expect(high.feet()[2]).toBeGreaterThan(-2.1);
  });

  test('walks up a 25° ramp', () => {
    const world = createPhysicsWorld(R, [], {
      groundCenter: [0, 0],
      groundHalfSize: 200,
    });
    const angle = (25 * Math.PI) / 180;
    const fixed = world.createRigidBody(R.RigidBodyDesc.fixed());
    world.createCollider(
      R.ColliderDesc.cuboid(3, 0.2, 6)
        .setTranslation(0, 6 * Math.sin(angle) - 0.2, -2 - 6 * Math.cos(angle))
        .setRotation({
          x: Math.sin(angle / 2),
          y: 0,
          z: 0,
          w: Math.cos(angle / 2),
        }),
      fixed,
    );
    const player = new PlayerController(R, world, [0, 0, 0]);
    run(player, 4, { forward: 1 });
    expect(player.feet()[1]).toBeGreaterThan(1.5);
  });

  test('third-person arm shortens in front of a wall and stays long in the open', () => {
    const world = testWorld([box('wall', [0, 2, 2], [5, 2, 0.2])]);
    const player = new PlayerController(R, world, [0, 0, 0]);
    run(player, 0.2, {});
    const pivot: [number, number, number] = [0, 1.6, 0];
    expect(
      cameraArmLength(R, world, pivot, [0, 0, 1], 3.5, player.collider),
    ).toBeLessThan(2);
    expect(
      cameraArmLength(R, world, pivot, [0, 0, -1], 3.5, player.collider),
    ).toBe(3.5);
  });

  test('fixed stepper is frame-rate independent and caps catch-up steps', () => {
    const stepper = new FixedStepper(1 / 60, 5);
    expect(stepper.advance(1 / 30)).toBe(2);
    expect(stepper.advance(1)).toBe(5);
  });
});

// ---- Campus acceptance: walk from Gate-5 to every block entrance ----

const footprints = campus.buildings.map((b) => b.footprint!);
const boundary = campus.boundary.polygon!;
const segDistance = (p: Vec2, a: Vec2, b: Vec2) => {
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
const edgeDistance = (p: Vec2, poly: Vec2[]) =>
  Math.min(
    ...poly.map((a, i) => segDistance(p, a, poly[(i + 1) % poly.length]!)),
  );

/** Grid A* over walkable ground (test-only planner; real navmesh is M9). */
const grids = new Map<
  number,
  { free: Uint8Array; n: number; x0: number; z0: number }
>();
function walkGrid(clearance: number, cell: number) {
  const cached = grids.get(clearance);
  if (cached) return cached;
  const { center, size } = campusBounds(campus);
  const x0 = center[0] - size / 2 - 5,
    z0 = center[1] - size / 2 - 5;
  const n = Math.ceil((size + 10) / cell);
  const at = (i: number, j: number): Vec2 => [x0 + i * cell, z0 + j * cell];
  const free = new Uint8Array(n * n);
  for (let i = 0; i < n; i += 1)
    for (let j = 0; j < n; j += 1) {
      const p = at(i, j);
      free[i * n + j] = Number(
        pointInPolygon(p, boundary) &&
          edgeDistance(p, boundary) > clearance &&
          footprints.every(
            (f) => !pointInPolygon(p, f) && edgeDistance(p, f) > clearance,
          ),
      );
    }
  const grid = { free, n, x0, z0 };
  grids.set(clearance, grid);
  return grid;
}

function planPath(start: Vec2, goal: Vec2, clearance: number): Vec2[] {
  const cell = 0.5;
  const { free, n, x0, z0 } = walkGrid(clearance, cell);
  const at = (i: number, j: number): Vec2 => [x0 + i * cell, z0 + j * cell];
  const index = (p: Vec2) => [
    Math.round((p[0] - x0) / cell),
    Math.round((p[1] - z0) / cell),
  ];
  const [si, sj] = index(start),
    [gi, gj] = index(goal);
  const came = new Int32Array(n * n).fill(-1);
  const cost = new Float64Array(n * n).fill(Infinity);
  const h = (k: number) => Math.hypot(Math.floor(k / n) - gi!, (k % n) - gj!);
  // Binary min-heap of [priority, cell]; stale entries are skipped on pop.
  const heap: [number, number][] = [];
  const push = (item: [number, number]) => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (heap[parent]![0] <= heap[i]![0]) break;
      [heap[parent], heap[i]] = [heap[i]!, heap[parent]!];
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = i * 2 + 1,
          r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };
  cost[si! * n + sj!] = 0;
  push([h(si! * n + sj!), si! * n + sj!]);
  while (heap.length) {
    const [priority, k] = pop();
    if (priority > cost[k]! + h(k) + 1e-6) continue;
    if (k === gi! * n + gj!) break;
    const i = Math.floor(k / n),
      j = k % n;
    for (let di = -1; di <= 1; di += 1)
      for (let dj = -1; dj <= 1; dj += 1) {
        const ni = i + di,
          nj = j + dj;
        if ((!di && !dj) || ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nk = ni * n + nj;
        if (!free[nk]) continue;
        const c = cost[k]! + Math.hypot(di, dj);
        if (c < cost[nk]!) {
          cost[nk] = c;
          came[nk] = k;
          push([c + h(nk), nk]);
        }
      }
  }
  const path: Vec2[] = [];
  for (let k = gi! * n + gj!; k !== -1; k = came[k]!) {
    path.unshift(at(Math.floor(k / n), k % n));
    if (k === si! * n + sj!) break;
  }
  if (path.length < 2) throw new Error('no path');
  return path.filter((_, i) => i % 4 === 0 || i === path.length - 1);
}

describe(
  'campus: walk from Gate-5 to each block entrance',
  { timeout: 30_000 },
  () => {
    for (const building of campus.buildings) {
      test(`reaches ${building.id} (${building.label}) at sprint speed without passing through anything`, () => {
        const entry = building.entries.find((e) => e.id === 'main')!.position!;
        // Approach point 1.6 m outside the facade.
        const fp = building.footprint!;
        const probe = (d: number): Vec2 => {
          const best = fp
            .map((a, i) => ({ a, b: fp[(i + 1) % fp.length]! }))
            .sort(
              (x, y) =>
                segDistance(entry, x.a, x.b) - segDistance(entry, y.a, y.b),
            )[0]!;
          const len = Math.hypot(best.b[0] - best.a[0], best.b[1] - best.a[1]);
          let nx = (best.b[1] - best.a[1]) / len,
            nz = -(best.b[0] - best.a[0]) / len;
          if (pointInPolygon([entry[0] + nx * 0.1, entry[1] + nz * 0.1], fp)) {
            nx = -nx;
            nz = -nz;
          }
          return [entry[0] + nx * d, entry[1] + nz * d];
        };
        const spawn = gateSpawn(campus);
        const world = createPhysicsWorld(R, staticColliders(campus), {
          groundCenter: campusBounds(campus).center,
          groundHalfSize: campusBounds(campus).size,
        });
        const player = new PlayerController(R, world, [
          spawn.position[0],
          0,
          spawn.position[1],
        ]);
        const path = planPath(spawn.position, probe(1.6), 0.9);
        let waypoint = 0;
        for (let t = 0; t < 240 && waypoint < path.length; t += DT) {
          const [x, , z] = player.feet();
          const target = path[waypoint]!;
          const dx = target[0] - x,
            dz = target[1] - z;
          if (Math.hypot(dx, dz) < 0.5) {
            waypoint += 1;
            continue;
          }
          player.step(DT, {
            forward: 1,
            right: 0,
            sprint: true,
            jump: false,
            yaw: Math.atan2(-dx, -dz),
          });
          const p: Vec2 = [player.feet()[0], player.feet()[2]];
          // Never inside a building or outside the boundary (no tunnelling),
          // and always on the ground rather than falling under it. Rapier settles
          // up to ~7 cm into the ground slab while sprinting; falling through
          // would be metres.
          expect(player.feet()[1]).toBeGreaterThan(-0.1);
          expect(pointInPolygon(p, boundary)).toBe(true);
          for (const f of footprints) expect(pointInPolygon(p, f)).toBe(false);
        }
        const [x, , z] = player.feet();
        expect(Math.hypot(x - entry[0], z - entry[1])).toBeLessThan(2.2);
      });
    }

    test('the boundary wall and closed gates keep the player on campus', () => {
      const spawn = gateSpawn(campus);
      const world = createPhysicsWorld(R, staticColliders(campus), {
        groundCenter: campusBounds(campus).center,
        groundHalfSize: campusBounds(campus).size,
      });
      const player = new PlayerController(R, world, [
        spawn.position[0],
        0,
        spawn.position[1],
      ]);
      // Sprint straight back out through Gate-5 for 5 s.
      run(player, 5, { forward: 1, sprint: true, yaw: spawn.yaw + Math.PI });
      expect(player.feet()[1]).toBeGreaterThan(-0.05);
      expect(
        pointInPolygon([player.feet()[0], player.feet()[2]], boundary),
      ).toBe(true);
    });
  },
);
