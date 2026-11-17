import polygonClipping from 'polygon-clipping';
import type { Vec2 } from '../types/campus';

const EPSILON = 1e-8;
const cross = (a: Vec2, b: Vec2, c: Vec2) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (a: Vec2, b: Vec2, p: Vec2) =>
  Math.abs(cross(a, b, p)) <= EPSILON &&
  p[0] >= Math.min(a[0], b[0]) - EPSILON &&
  p[0] <= Math.max(a[0], b[0]) + EPSILON &&
  p[1] >= Math.min(a[1], b[1]) - EPSILON &&
  p[1] <= Math.max(a[1], b[1]) + EPSILON;

function intersects(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const abC = cross(a, b, c),
    abD = cross(a, b, d),
    cdA = cross(c, d, a),
    cdB = cross(c, d, b);
  return (
    (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON)) &&
      ((cdA > EPSILON && cdB < -EPSILON) ||
        (cdA < -EPSILON && cdB > EPSILON))) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}

export function polygonArea(polygon: readonly Vec2[]): number {
  return (
    Math.abs(
      polygon.reduce((sum, point, index) => {
        const next = polygon[(index + 1) % polygon.length]!;
        return sum + point[0] * next[1] - next[0] * point[1];
      }, 0),
    ) / 2
  );
}

export function polygonProblem(polygon: Vec2[]): string | undefined {
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!,
      b = polygon[(i + 1) % polygon.length]!;
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= EPSILON)
      return 'Repeated vertex or zero-length edge; polygons close implicitly';
    const previous = polygon[(i + polygon.length - 1) % polygon.length]!;
    if (onSegment(previous, a, b) || onSegment(a, b, previous))
      return 'Adjacent edges backtrack or overlap';
    for (let j = i + 1; j < polygon.length; j += 1) {
      if (j === i + 1 || (i === 0 && j === polygon.length - 1)) continue;
      if (intersects(a, b, polygon[j]!, polygon[(j + 1) % polygon.length]!))
        return 'Polygon self-intersects';
    }
  }
  if (polygonArea(polygon) <= EPSILON) return 'Polygon has zero area';
  return undefined;
}

function clippedArea(polygons: polygonClipping.MultiPolygon): number {
  return polygons.reduce(
    (total, polygon) =>
      total +
      polygon.reduce(
        (area, ring, index) =>
          area + (index === 0 ? 1 : -1) * polygonArea(ring),
        0,
      ),
    0,
  );
}

export function polygonContains(container: Vec2[], subject: Vec2[]): boolean {
  // Difference checks complete edges, including excursions across a concave boundary.
  return (
    clippedArea(polygonClipping.difference([subject], [container])) <= EPSILON
  );
}

export function polygonsOverlap(a: Vec2[], b: Vec2[]): boolean {
  // Shared boundaries are legal; only positive-area intersections overlap.
  return clippedArea(polygonClipping.intersection([a], [b])) > EPSILON;
}
