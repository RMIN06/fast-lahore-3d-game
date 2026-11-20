import { ShapeUtils, Vector2 } from 'three';
import type { Campus, Vec2 } from '../types/campus';
import type { StaticCollider } from './campus-geometry';
import { inwardOf, pointInPolygon } from './campus-geometry';
import { prismSides } from './physics';

// M9 navmesh input (ARCHITECTURE §4): built offline by scripts/build-navmesh.ts
// from the SAME collider geometry the player walks on (never render meshes).
// One multi-level navmesh covers outdoors and every interior floor; doors and
// stair ramps are part of it, so no off-mesh links are needed.

/** Recast settings. Lengths in voxels where Recast expects voxels. */
export const NAVMESH_CONFIG = {
  cs: 0.15,
  ch: 0.1,
  walkableSlopeAngle: 40,
  walkableHeight: 18, // 1.8 m
  walkableClimb: 3, // 0.3 m, matches the player's autostep
  walkableRadius: 2, // 0.3 m = agent radius (1.4 m room doors stay open)
  maxEdgeLen: 80,
  maxSimplificationError: 1.3,
  minRegionArea: 8,
  mergeRegionArea: 20,
  maxVertsPerPoly: 6,
  detailSampleDist: 6,
  detailSampleMaxError: 1,
} as const;

export interface TriangleSoup {
  positions: number[];
  indices: number[];
}

const pushTriangles = (
  soup: TriangleSoup,
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
) => {
  const base = soup.positions.length / 3;
  for (let i = 0; i < positions.length; i += 1)
    soup.positions.push(positions[i]!);
  for (let i = 0; i < indices.length; i += 1)
    soup.indices.push(indices[i]! + base);
};

/** Flat polygon (with optional holes) at height y, triangulated. */
export function flatPolygon(
  soup: TriangleSoup,
  outline: Vec2[],
  holes: Vec2[][] = [],
  y = 0,
) {
  const contour = outline.map(([x, z]) => new Vector2(x, z));
  const holeVectors = holes.map((h) => h.map(([x, z]) => new Vector2(x, z)));
  const triangles = ShapeUtils.triangulateShape(contour, holeVectors);
  const all = [contour, ...holeVectors].flat();
  pushTriangles(
    soup,
    all.flatMap((p) => [p.x, y, p.y]),
    // Wind so the face points up (+Y) for Recast's walkable test.
    triangles.flatMap(([a, b, c]) =>
      ShapeUtils.isClockWise(contour) ? [a!, c!, b!] : [a!, b!, c!],
    ),
  );
}

/** Eight corners (yaw, then tilt about local Z) of a box collider. */
export function boxCorners(
  c: Extract<StaticCollider, { kind: 'box' }>,
): number[][] {
  const [hx, hy, hz] = c.halfExtents;
  const cy = Math.cos(c.rotationY),
    sy = Math.sin(c.rotationY);
  const ct = Math.cos(c.tiltZ ?? 0),
    st = Math.sin(c.tiltZ ?? 0);
  const corners: number[][] = [];
  for (const sx of [-1, 1])
    for (const syy of [-1, 1])
      for (const sz of [-1, 1]) {
        let x = sx * hx,
          y = syy * hy;
        const z = sz * hz;
        [x, y] = [x * ct - y * st, x * st + y * ct];
        corners.push([
          c.center[0] + x * cy + z * sy,
          c.center[1] + y,
          c.center[2] - x * sy + z * cy,
        ]);
      }
  return corners;
}

// Box faces as quads over corner indices (sx, sy, sz bit order), outward.
const BOX_FACES = [
  [0, 1, 3, 2], // -X
  [4, 6, 7, 5], // +X
  [0, 4, 5, 1], // -Y
  [2, 3, 7, 6], // +Y
  [0, 2, 6, 4], // -Z
  [1, 5, 7, 3], // +Z
];

export function boxTriangles(
  soup: TriangleSoup,
  c: Extract<StaticCollider, { kind: 'box' }>,
) {
  const corners = boxCorners(c);
  pushTriangles(
    soup,
    corners.flat(),
    BOX_FACES.flatMap(([a, b, cc, d]) => [a!, b!, cc!, a!, cc!, d!]),
  );
}

/**
 * Walkable ground (inside the campus boundary, minus interior holes), the
 * Masjid and its path through the Masjid-side gate, and every static collider
 * except the gate barriers (gates open on a schedule; NPC plans respect them).
 */
export function navMeshInput(
  campus: Campus,
  colliders: StaticCollider[],
  groundHoles: Vec2[][],
): { positions: Float32Array; indices: Uint32Array } {
  const soup: TriangleSoup = { positions: [], indices: [] };
  const boundary = campus.boundary.polygon;
  if (!boundary) throw new Error('Navmesh needs the campus boundary');
  flatPolygon(soup, boundary, groundHoles);
  const masjid = campus.areas.find((a) => a.kind === 'masjid')?.polygon;
  const gate = campus.gates.find((g) => g.opens);
  if (masjid && gate?.position && gate.heading !== undefined) {
    flatPolygon(soup, masjid);
    const out = inwardOf(gate.heading).map((v) => -v) as Vec2;
    const side: Vec2 = [-out[1], out[0]];
    const target = masjid.reduce<Vec2>(
      (s, p) => [s[0] + p[0] / masjid.length, s[1] + p[1] / masjid.length],
      [0, 0],
    );
    const reach =
      Math.hypot(target[0] - gate.position[0], target[1] - gate.position[1]) +
      2;
    const from: Vec2 = [
      gate.position[0] - out[0] * 1.5,
      gate.position[1] - out[1] * 1.5,
    ];
    const w = 2;
    const pathOutline: Vec2[] = [
      [from[0] - side[0] * w, from[1] - side[1] * w],
      [from[0] + side[0] * w, from[1] + side[1] * w],
      [
        from[0] + out[0] * reach + side[0] * w,
        from[1] + out[1] * reach + side[1] * w,
      ],
      [
        from[0] + out[0] * reach - side[0] * w,
        from[1] + out[1] * reach - side[1] * w,
      ],
    ];
    flatPolygon(soup, pathOutline, [], 0.01);
  }
  for (const c of colliders) {
    if (c.id.startsWith('gate:')) continue;
    if (c.kind === 'box') boxTriangles(soup, c);
    else {
      const { vertices, indices } = prismSides(c);
      pushTriangles(soup, vertices, indices);
    }
  }
  return {
    positions: new Float32Array(soup.positions),
    indices: new Uint32Array(soup.indices),
  };
}

/** True if a point lies on campus ground (inside the boundary). */
export const onCampus = (campus: Campus, p: Vec2) =>
  campus.boundary.polygon ? pointInPolygon(p, campus.boundary.polygon) : false;

/**
 * Stable FNV-1a hash of the navmesh input and settings, stored next to the
 * committed navmesh so a test can detect a stale build.
 */
export function navMeshInputHash(
  positions: Float32Array,
  indices: Uint32Array,
) {
  let h1 = 0x811c9dc5,
    h2 = 0x01000193;
  const feed = (bytes: Uint8Array) => {
    for (let i = 0; i < bytes.length; i += 1) {
      h1 = Math.imul(h1 ^ bytes[i]!, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ bytes[i]!, 0x811c9dc5) >>> 0;
    }
  };
  feed(
    new Uint8Array(
      positions.buffer,
      positions.byteOffset,
      positions.byteLength,
    ),
  );
  feed(new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength));
  feed(new TextEncoder().encode(JSON.stringify(NAVMESH_CONFIG)));
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}
