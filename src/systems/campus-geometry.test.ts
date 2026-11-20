import { expect, test } from 'vitest';
import campusJson from '../../data/campus.json';
import { loadCampus } from '../world/campus-loader';
import {
  boundaryWallSegments,
  buildingMasses,
  campusBounds,
  floorStack,
  floorSummary,
  staticColliders,
  weakest,
  lampPositions,
  pointInPolygon,
  windowBands,
} from './campus-geometry';

const campus = loadCampus(campusJson, { mode: 'site-plan' }).campus;
const masses = new Map(buildingMasses(campus).map((m) => [m.id, m]));
const perimeter = (points: [number, number][]) =>
  points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return sum + Math.hypot(q[0] - p[0], q[1] - p[1]);
  }, 0);

test('each block has the M3 floor count from campus data', () => {
  const counts = Object.fromEntries(
    [...masses].map(([id, m]) => [id, [m.aboveGround, m.basements]]),
  );
  expect(counts).toEqual({
    A: [1, 0],
    B: [3, 1],
    C: [3, 1],
    D: [3, 1],
    E: [1, 0],
    F: [4, 2],
  });
  expect(floorSummary(masses.get('F')!)).toBe('4 above ground + 2 basements');
  expect(floorSummary(masses.get('B')!)).toBe('3 above ground + 1 basement');
});

test('unknown floor counts stay visibly placeholder (A and E)', () => {
  expect(masses.get('A')!.floorsConfidence).toBe('placeholder');
  expect(masses.get('E')!.floorsConfidence).toBe('placeholder');
  expect(masses.get('B')!.floorsConfidence).toBe('estimated');
  expect(weakest('traced', 'placeholder', 'estimated')).toBe('placeholder');
  expect(weakest('measured', 'traced')).toBe('traced');
});

test('floors stack up from ground and basements stack down using defaults', () => {
  const f = floorStack(
    campus.buildings.find((b) => b.id === 'F')!,
    campus.meta.defaults,
  );
  expect(f.map((s) => s.floorId)).toEqual(['B2', 'B1', 'G', '1', '2', '3']);
  expect(f[0]!.base).toBeCloseTo(-6.8);
  expect(f[2]!.base).toBe(0);
  expect(f.at(-1)!.top).toBeCloseTo(14.4);
  expect(masses.get('B')!.height).toBeCloseTo(10.8);
});

test('boundary wall leaves a gate-width opening at every gate on the boundary', () => {
  const segments = boundaryWallSegments(campus);
  const wallLength = segments.reduce(
    (sum, s) => sum + Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]),
    0,
  );
  const gates = campus.gates.filter((g) => g.position).length;
  expect(gates).toBe(4);
  expect(wallLength).toBeCloseTo(
    perimeter(campus.boundary.polygon!) -
      gates * campus.meta.defaults.gateWidth!,
    3,
  );
});

test('static colliders: one prism per footprint, oriented boxes along walls', () => {
  const colliders = staticColliders(campus);
  const prisms = colliders.filter((c) => c.kind === 'prism');
  const boxes = colliders.filter(
    (c) => c.kind === 'box' && c.id.startsWith('wall:'),
  );
  expect(
    colliders.filter((c) => c.id.startsWith('gate:')).map((c) => c.id),
  ).toEqual(['gate:G3', 'gate:G5', 'gate:G-MASJID', 'gate:G2']);
  expect(prisms.map((p) => p.id)).toEqual(
    ['A', 'B', 'C', 'D', 'E', 'F'].map((id) => `building:${id}`),
  );
  expect(boxes.length).toBe(boundaryWallSegments(campus).length);
  const segment = boundaryWallSegments(campus)[0]!;
  const box = boxes[0]!;
  if (box.kind !== 'box') throw new Error('expected box');
  // Local +X rotated by rotationY about +Y must point along the segment.
  const dir = [Math.cos(box.rotationY), -Math.sin(box.rotationY)];
  const length = Math.hypot(
    segment.to[0] - segment.from[0],
    segment.to[1] - segment.from[1],
  );
  expect(dir[0]).toBeCloseTo((segment.to[0] - segment.from[0]) / length);
  expect(dir[1]).toBeCloseTo((segment.to[1] - segment.from[1]) / length);
  expect(box.halfExtents[0] * 2).toBeCloseTo(length);
  expect(box.center[1]).toBeCloseTo(
    campus.meta.defaults.boundaryWallHeight! / 2,
  );
});

test('gates away from the boundary do not cut the wall', () => {
  const moved = structuredClone(campus);
  moved.gates.forEach((g) => (g.position = [1000, 1000]));
  expect(perimeter(moved.boundary.polygon!)).toBeCloseTo(
    boundaryWallSegments(moved).reduce(
      (sum, s) => sum + Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]),
      0,
    ),
  );
});

test('camera framing covers the whole boundary', () => {
  const { center, size } = campusBounds(campus);
  expect(size).toBeGreaterThan(300);
  expect(center[1]).toBeGreaterThan(0);
});

test('procedural lamps lie on campus, clear of buildings, along paths, entrances and gates', () => {
  const lamps = lampPositions(campus);
  expect(lamps.length).toBeGreaterThan(15);
  for (const p of lamps) {
    expect(pointInPolygon(p, campus.boundary.polygon!)).toBe(true);
    for (const b of campus.buildings)
      expect(pointInPolygon(p, b.footprint!)).toBe(false);
  }
  for (const b of campus.buildings) {
    const entry = b.entries[0]!.position!;
    expect(
      Math.min(
        ...lamps.map((p) => Math.hypot(p[0] - entry[0], p[1] - entry[1])),
      ),
    ).toBeLessThan(4);
  }
});

test('window bands sit on facades, one band per floor, facing outward', () => {
  const masses = buildingMasses(campus);
  const bands = windowBands(masses);
  const f = bands.filter((band) =>
    campus.buildings
      .find((b) => b.id === 'F')!
      .footprint!.some((p) => p === band.from),
  );
  expect(f.length % 4).toBe(0); // F has 4 floors above ground
  for (const band of bands.slice(0, 20)) {
    const mid: [number, number] = [
      (band.from[0] + band.to[0]) / 2 + band.outward[0] * 0.2,
      (band.from[1] + band.to[1]) / 2 + band.outward[1] * 0.2,
    ];
    expect(masses.some((m) => pointInPolygon(mid, m.footprint))).toBe(false);
    expect(band.top).toBeGreaterThan(band.base);
  }
});
