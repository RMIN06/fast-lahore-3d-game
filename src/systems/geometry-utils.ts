import type { Vec2 } from '../types/campus';

/** Average of a polygon's vertices. */
export const centroid = (polygon: Vec2[]): Vec2 => [
  polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length,
  polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length,
];
