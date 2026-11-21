import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  Float32BufferAttribute,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FixtureKind } from '../systems/fixtures';

// M10 placeholder furniture (own work): each fixture kind is a few merged,
// vertex-coloured boxes, drawn as one instanced mesh per kind. Local frame:
// the fixture's position on the floor, facing -Z (where a sitter looks).

const WOOD = '#8a6a4a',
  DARK = '#2e3236',
  METAL = '#9aa1a6',
  CLOTH = '#556b8a',
  MAT = '#2f6b4f',
  PAINT = '#d9d4c7';

type Part = [
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  color: string,
];

function build(parts: Part[]): BufferGeometry {
  const geometries = parts.map(([w, h, d, x, y, z, color]) => {
    const g = new BoxGeometry(w, h, d).toNonIndexed();
    g.translate(x, y, z);
    const c = new Color(color);
    const n = g.getAttribute('position').count;
    g.setAttribute(
      'color',
      new Float32BufferAttribute(
        Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(),
        3,
      ),
    );
    return g;
  });
  const merged = mergeGeometries(geometries)!;
  geometries.forEach((g) => g.dispose());
  return merged;
}

const chair: Part[] = [
  [0.44, 0.05, 0.42, 0, 0.44, 0, WOOD],
  [0.44, 0.42, 0.04, 0, 0.68, 0.2, WOOD],
  [0.05, 0.44, 0.05, -0.18, 0.21, -0.17, METAL],
  [0.05, 0.44, 0.05, 0.18, 0.21, -0.17, METAL],
  [0.05, 0.44, 0.05, -0.18, 0.21, 0.17, METAL],
  [0.05, 0.44, 0.05, 0.18, 0.21, 0.17, METAL],
];

/** Geometry per fixture kind (doors are built separately: see doorLeaf). */
export function fixtureGeometry(
  kind: Exclude<FixtureKind, 'door'>,
): BufferGeometry {
  switch (kind) {
    case 'seat':
      return build([
        ...chair,
        [0.6, 0.04, 0.4, 0, 0.72, -0.45, WOOD],
        [0.05, 0.7, 0.05, 0, 0.36, -0.45, METAL],
      ]);
    case 'pc':
      return build([
        ...chair,
        [1.0, 0.04, 0.6, 0, 0.74, -0.55, PAINT],
        [0.05, 0.72, 0.5, -0.45, 0.36, -0.55, METAL],
        [0.05, 0.72, 0.5, 0.45, 0.36, -0.55, METAL],
        [0.5, 0.32, 0.03, 0, 1.0, -0.72, DARK],
        [0.42, 0.02, 0.14, 0, 0.77, -0.42, DARK],
      ]);
    case 'lectern':
      return build([
        [0.6, 1.05, 0.45, 0, 0.525, 0, WOOD],
        [0.66, 0.04, 0.5, 0, 1.07, 0.02, WOOD],
      ]);
    case 'shelf':
      return build([
        [2.2, 2.0, 0.08, 0, 1.0, 0.18, WOOD],
        [0.06, 2.0, 0.42, -1.07, 1.0, 0, WOOD],
        [0.06, 2.0, 0.42, 1.07, 1.0, 0, WOOD],
        ...[0.05, 0.5, 0.95, 1.4, 1.95].map((y): Part => [
          2.1,
          0.04,
          0.4,
          0,
          y,
          0,
          WOOD,
        ]),
        ...[0.27, 0.72, 1.17, 1.62].map((y): Part => [
          2.0,
          0.38,
          0.28,
          0,
          y,
          -0.02,
          CLOTH,
        ]),
      ]);
    case 'counter':
      return build([
        [2.4, 1.0, 0.6, 0, 0.5, 0, PAINT],
        [2.5, 0.05, 0.7, 0, 1.02, 0, WOOD],
      ]);
    case 'desk':
      return build([
        [1.4, 0.04, 0.7, 0, 0.74, 0, WOOD],
        [1.3, 0.7, 0.04, 0, 0.36, -0.3, WOOD],
        [0.5, 0.32, 0.03, 0, 0.94, -0.2, DARK],
      ]);
    case 'bench':
      return build([
        [1.6, 0.06, 0.42, 0, 0.44, 0, WOOD],
        [1.6, 0.36, 0.05, 0, 0.7, 0.2, WOOD],
        [0.08, 0.44, 0.4, -0.7, 0.21, 0, METAL],
        [0.08, 0.44, 0.4, 0.7, 0.21, 0, METAL],
      ]);
    case 'prayer':
      return build([[0.75, 0.02, 1.2, 0, 0.012, -0.3, MAT]]);
    case 'bay':
      return build([
        [0.08, 0.01, 4.8, -1.25, 0.012, 0, PAINT],
        [0.08, 0.01, 4.8, 1.25, 0.012, 0, PAINT],
      ]);
    case 'rack':
      return build([
        [0.06, 0.8, 0.06, -0.3, 0.4, 0, METAL],
        [0.06, 0.8, 0.06, 0.3, 0.4, 0, METAL],
        [0.66, 0.06, 0.06, 0, 0.8, 0, METAL],
      ]);
  }
}

/** A door leaf with its hinge at the local origin, spanning +X. */
export const doorLeaf = (width: number, height: number) =>
  build([
    [width - 0.04, height, 0.05, width / 2, height / 2, 0, '#7a5a3c'],
    [0.04, 0.04, 0.12, width - 0.18, 1.0, 0, METAL],
  ]);

/** Floating marker over a task target. */
export const markerGeometry = () =>
  new ConeGeometry(0.16, 0.32, 4).rotateX(Math.PI);
