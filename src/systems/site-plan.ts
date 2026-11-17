import type { Campus, Confidence, Vec2 } from '../types/campus';
import { polygonArea, polygonProblem } from './polygon-validation';
import { validateCampus } from './campus-validation';

export interface DistanceReference {
  from: Vec2;
  to: Vec2;
  meters: number;
  label: string;
}
export interface ImageCalibration {
  origin: Vec2;
  rotationDeg: number;
  metersPerPixel: number;
  residualPct: number;
  references: DistanceReference[];
  source: string;
  date: string;
}
export type TraceTarget =
  | { kind: 'boundary' }
  | { kind: 'building'; id: string }
  | { kind: 'area'; id: string }
  | { kind: 'gate'; id: string }
  | { kind: 'entry'; id: string; buildingId: string; floor: string };

export function fitScale(references: DistanceReference[]): {
  metersPerPixel: number;
  residualPct: number;
} {
  if (references.length < 2)
    throw new Error('Add at least two measured distance references.');
  let numerator = 0,
    denominator = 0,
    lengthsSquared = 0;
  const distances = references.map((ref) => {
    const pixels = Math.hypot(ref.to[0] - ref.from[0], ref.to[1] - ref.from[1]);
    if (
      !Number.isFinite(pixels) ||
      pixels <= 0 ||
      !Number.isFinite(ref.meters) ||
      ref.meters <= 0 ||
      !ref.label.trim()
    )
      throw new Error(
        'Each reference needs distinct endpoints, a positive measured distance, and a source label.',
      );
    numerator += pixels * ref.meters;
    denominator += pixels * pixels;
    lengthsSquared += ref.meters * ref.meters;
    return pixels;
  });
  const metersPerPixel = numerator / denominator;
  const residual = references.reduce(
    (sum, ref, i) => sum + (distances[i]! * metersPerPixel - ref.meters) ** 2,
    0,
  );
  return {
    metersPerPixel,
    residualPct: Math.sqrt(residual / lengthsSquared) * 100,
  };
}

export function pixelToWorld(point: Vec2, calibration: ImageCalibration): Vec2 {
  const radians = (calibration.rotationDeg * Math.PI) / 180;
  const x = (point[0] - calibration.origin[0]) * calibration.metersPerPixel;
  const z = (point[1] - calibration.origin[1]) * calibration.metersPerPixel;
  return [
    x * Math.cos(radians) - z * Math.sin(radians),
    x * Math.sin(radians) + z * Math.cos(radians),
  ];
}

export function worldToPixel(point: Vec2, calibration: ImageCalibration): Vec2 {
  const radians = (-calibration.rotationDeg * Math.PI) / 180;
  return [
    (point[0] * Math.cos(radians) - point[1] * Math.sin(radians)) /
      calibration.metersPerPixel +
      calibration.origin[0],
    (point[0] * Math.sin(radians) + point[1] * Math.cos(radians)) /
      calibration.metersPerPixel +
      calibration.origin[1],
  ];
}

export function traceToCampus(
  campus: Campus,
  target: TraceTarget,
  points: Vec2[],
  calibration: ImageCalibration,
  confidence: Confidence,
  heading?: number,
): Campus {
  if (
    ![
      ...calibration.origin,
      calibration.rotationDeg,
      calibration.metersPerPixel,
      calibration.residualPct,
    ].every(Number.isFinite) ||
    calibration.metersPerPixel <= 0 ||
    !calibration.source.trim()
  )
    throw new Error('A valid image calibration and source are required.');
  const fit = fitScale(calibration.references);
  if (
    Math.abs(fit.metersPerPixel - calibration.metersPerPixel) > 1e-8 ||
    Math.abs(fit.residualPct - calibration.residualPct) > 1e-6
  )
    throw new Error('Calibration no longer matches its distance references.');
  const world = points.map((point) => pixelToWorld(point, calibration));
  const pointTarget = target.kind === 'gate' || target.kind === 'entry';
  if (pointTarget && world.length !== 1)
    throw new Error('Choose exactly one point for a gate or entry.');
  if (!pointTarget && (world.length < 3 || polygonProblem(world)))
    throw new Error(
      'Draw a simple polygon with at least three different corners.',
    );
  // CCW as seen from above: X east/right, Z south/down on a north-up plan.
  if (!pointTarget) {
    const signed = world.reduce((sum, p, i) => {
      const next = world[(i + 1) % world.length]!;
      return sum + p[0] * next[1] - next[0] * p[1];
    }, 0);
    if (signed > 0) world.reverse();
  }
  const next = structuredClone(campus);
  if (target.kind === 'boundary')
    next.boundary = { polygon: world, confidence };
  else if (target.kind === 'building') {
    const building = next.buildings.find((item) => item.id === target.id);
    if (!building) throw new Error(`Unknown building ${target.id}`);
    building.footprint = world;
    building.confidence = confidence;
  } else if (target.kind === 'area') {
    const area = next.areas.find((item) => item.id === target.id);
    if (!area) throw new Error(`Unknown area ${target.id}`);
    area.polygon = world;
    area.confidence = confidence;
  } else if (target.kind === 'gate') {
    const gate = next.gates.find((item) => item.id === target.id);
    if (!gate) throw new Error(`Unknown gate ${target.id}`);
    if (heading === undefined || !Number.isFinite(heading))
      throw new Error('Enter the observed gate heading in degrees.');
    if (gate.id === next.meta.origin && Math.hypot(...world[0]!) > 0.05)
      throw new Error('The origin gate must coincide with the image origin.');
    gate.position = gate.id === next.meta.origin ? [0, 0] : world[0]!;
    gate.heading = heading;
    gate.confidence = confidence;
  } else {
    const building = next.buildings.find(
      (item) => item.id === target.buildingId,
    );
    if (
      !building ||
      !building.floors.some((floor) => floor.id === target.floor)
    )
      throw new Error('Entry building/floor does not exist.');
    const entry = building.entries.find((item) => item.id === target.id);
    if (entry) {
      entry.position = world[0]!;
      entry.floor = target.floor;
    } else
      building.entries.push({
        id: target.id,
        position: world[0]!,
        floor: target.floor,
        kind: 'main',
      });
  }
  next.meta.calibration = {
    method: `Image distance fit; source: ${calibration.source}; origin px ${calibration.origin.join(',')}; image-to-world rotation ${calibration.rotationDeg}°`,
    metersPerPixel: calibration.metersPerPixel,
    residualPct: calibration.residualPct,
    refs: calibration.references.map(
      (ref) =>
        `${ref.label}: ${ref.from.join(',')} -> ${ref.to.join(',')} px = ${ref.meters} m`,
    ),
    date: calibration.date,
  };
  // Existing room inventory is preserved. M2 edits exterior data only.
  const errors = validateCampus(next, { mode: 'seed' }).issues.filter(
    (issue) => issue.severity === 'error',
  );
  // An unfinished boundary may be drawn before its final edit; area check remains visible and blocks M2 export.
  const blocking = errors.filter((issue) => issue.code !== 'boundary-area');
  if (blocking.length)
    throw new Error(
      blocking.map((issue) => `${issue.path}: ${issue.message}`).join('\n'),
    );
  return next;
}

export function sitePlanSummary(campus: Campus) {
  const missing = [
    ...(!campus.boundary.polygon ? ['boundary'] : []),
    ...campus.buildings
      .filter((item) => !item.footprint)
      .map((item) => `building ${item.id}`),
    ...campus.areas
      .filter((item) => !item.polygon)
      .map((item) => `area ${item.id}`),
    ...campus.gates
      .filter((item) => !item.position || item.heading === undefined)
      .map((item) => `gate ${item.id}`),
  ];
  return {
    missing,
    area: campus.boundary.polygon ? polygonArea(campus.boundary.polygon) : null,
  };
}
