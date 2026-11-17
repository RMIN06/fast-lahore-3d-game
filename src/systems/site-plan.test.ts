import { expect, test } from 'vitest';
import fixture from '../../tests/fixtures/campus.valid.json';
import { campusSchema } from '../world/campus-schema';
import { validateCampus } from './campus-validation';
import {
  fitScale,
  pixelToWorld,
  worldToPixel,
  traceToCampus,
  sitePlanSummary,
} from './site-plan';
import type { ImageCalibration, DistanceReference } from './site-plan';

// These coordinates describe a synthetic image fixture, never the real campus.
const references: DistanceReference[] = [
  { from: [0, 0], to: [100, 0], meters: 50, label: 'synthetic A' },
  { from: [0, 0], to: [0, 200], meters: 100, label: 'synthetic B' },
];
const calibration: ImageCalibration = {
  origin: [200, 300],
  rotationDeg: 180,
  ...fitScale(references),
  references,
  source: 'Synthetic test image only',
  date: '2026-10-25',
};

test('metric fit uses all references and reports disagreement without hiding it', () => {
  expect(fitScale(references)).toEqual({ metersPerPixel: 0.5, residualPct: 0 });
  const inconsistent = fitScale([
    { ...references[0]!, meters: 40 },
    references[1]!,
  ]);
  expect(inconsistent.metersPerPixel).toBeCloseTo(0.48);
  expect(inconsistent.residualPct).toBeGreaterThan(5);
});
test.each<{ refs: DistanceReference[] }>([
  { refs: [] },
  { refs: [references[0]!] },
  { refs: [{ ...references[0]!, to: [0, 0] }, references[1]!] },
  { refs: [{ ...references[0]!, meters: NaN }, references[1]!] },
])('rejects missing or invalid reference distances: $refs', ({ refs }) => {
  expect(() => fitScale(refs)).toThrow();
});
test.each([0, 37, 90, 180, 270])(
  'pixel/world transform round-trips at %d degrees and keeps Gate-5 at zero',
  (rotationDeg) => {
    const config = { ...calibration, rotationDeg };
    const p: [number, number] = [430, 120];
    const roundTrip = worldToPixel(pixelToWorld(p, config), config);
    expect(roundTrip[0]).toBeCloseTo(p[0]);
    expect(roundTrip[1]).toBeCloseTo(p[1]);
    const zero = pixelToWorld(config.origin, config);
    expect(zero[0]).toBeCloseTo(0);
    expect(zero[1]).toBeCloseTo(0);
  },
);
test('the documented 180-degree student-map transform points south from image top', () => {
  expect(pixelToWorld([200, 100], calibration)[1]).toBeCloseTo(100);
  expect(pixelToWorld([100, 300], calibration)[0]).toBeCloseTo(50);
});
test('a trace updates only its intended exterior field and records calibration evidence', () => {
  const campus = campusSchema.parse(fixture);
  const pixels = campus.buildings[0]!.footprint!.map((p) =>
    worldToPixel(p, calibration),
  );
  const before = structuredClone(campus);
  const next = traceToCampus(
    campus,
    { kind: 'building', id: 'A' },
    pixels,
    calibration,
    'traced',
  );
  expect(campus).toEqual(before);
  expect(next.buildings[0]!.floors).toEqual(before.buildings[0]!.floors);
  expect(next.buildings[1]).toEqual(before.buildings[1]);
  expect(next.meta.calibration?.refs).toHaveLength(2);
  expect(next.buildings[0]!.confidence).toBe('traced');
});
test('tracing rejects crossings, unresolved IDs, overlaps, and a gate away from its origin', () => {
  const campus = campusSchema.parse(fixture),
    config = {
      ...calibration,
      origin: [0, 0] as [number, number],
      rotationDeg: 0,
    };
  expect(() =>
    traceToCampus(
      campus,
      { kind: 'building', id: 'A' },
      [
        [0, 0],
        [20, 20],
        [20, 0],
        [0, 20],
      ],
      config,
      'placeholder',
    ),
  ).toThrow('simple polygon');
  expect(() =>
    traceToCampus(
      campus,
      { kind: 'area', id: 'missing' },
      [
        [0, 0],
        [20, 0],
        [20, 20],
      ],
      config,
      'placeholder',
    ),
  ).toThrow('Unknown area');
  expect(() =>
    traceToCampus(
      campus,
      { kind: 'building', id: 'B' },
      [
        [20, 20],
        [60, 20],
        [60, 60],
        [20, 60],
      ],
      config,
      'traced',
    ),
  ).toThrow('Overlaps');
  expect(() =>
    traceToCampus(
      campus,
      { kind: 'gate', id: 'G5' },
      [[50, 50]],
      config,
      'traced',
      0,
    ),
  ).toThrow('origin');
  expect(() =>
    traceToCampus(
      campus,
      { kind: 'gate', id: 'G5' },
      [[0, 0]],
      config,
      'traced',
    ),
  ).toThrow('heading');
});
test('boundary area errors remain editable but cannot pass M2 validation', () => {
  const campus = campusSchema.parse(fixture);
  const next = traceToCampus(
    campus,
    { kind: 'boundary' },
    [
      [200, 300],
      [0, 300],
      [0, 100],
      [200, 100],
    ],
    calibration,
    'placeholder',
  );
  expect(sitePlanSummary(next).area).toBeCloseTo(10000);
  expect(validateCampus(next, { mode: 'site-plan' }).issues).toContainEqual(
    expect.objectContaining({ code: 'boundary-area', severity: 'error' }),
  );
});
test('M2 requires exterior geometry and calibration while interior work remains a warning', () => {
  const campus = campusSchema.parse(fixture);
  campus.meta.calibration = {
    method: 'Synthetic fixture',
    metersPerPixel: 1,
    refs: ['test A', 'test B'],
    residualPct: 0,
    date: '2026-10-25',
  };
  delete campus.buildings[0]!.floors[0]!.spaces[0]!.polygon;
  campus.buildings[0]!.floors[0]!.connectors[0]!.position = null;
  expect(
    validateCampus(campus, { mode: 'site-plan' }).issues.every(
      (issue) => issue.severity === 'warning',
    ),
  ).toBe(true);
  expect(
    validateCampus(campus, { mode: 'curated' }).issues.some(
      (issue) => issue.severity === 'error',
    ),
  ).toBe(true);
  campus.gates[0]!.position = null;
  expect(validateCampus(campus, { mode: 'site-plan' }).issues).toContainEqual(
    expect.objectContaining({ severity: 'error', path: 'gates.0.position' }),
  );
  delete campus.meta.calibration;
  expect(validateCampus(campus, { mode: 'site-plan' }).issues).toContainEqual(
    expect.objectContaining({ code: 'calibration', path: 'meta.calibration' }),
  );
});
test('scale changes cannot silently reuse an already fitted reference set', () => {
  expect(() =>
    traceToCampus(
      campusSchema.parse(fixture),
      { kind: 'boundary' },
      [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
      { ...calibration, metersPerPixel: 1 },
      'traced',
    ),
  ).toThrow('no longer matches');
});
