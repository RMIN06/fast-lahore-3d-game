import {
  BoxGeometry,
  BufferGeometry,
  DataTexture,
  RepeatWrapping,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Shape,
  ShapeGeometry,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Campus, Vec2 } from '../types/campus';
import type {
  BuildingMass,
  StaticCollider,
  WallSegment,
  WindowBand,
} from '../systems/campus-geometry';
import { inwardOf } from '../systems/campus-geometry';

// three.js builders for the M3 exterior greybox. Inputs come only from campus data.

const shapeOf = (polygon: Vec2[]) =>
  // Shape space (x, -z) rotated by -90° about X lands on world (x, 0, z).
  new Shape(polygon.map(([x, z]) => new Vector2(x, -z)));

/** Flat surface polygon lying at height `y`. */
export function surfaceGeometry(polygon: Vec2[], y: number): BufferGeometry {
  const geometry = new ShapeGeometry(shapeOf(polygon));
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
}

/** Above-ground floors as stacked extrusions with a thin visible gap per slab. */
export function buildingGeometry(
  mass: BuildingMass,
  slabGap = 0.15,
): BufferGeometry {
  const shape = shapeOf(mass.footprint);
  const parts = mass.floors
    .filter((floor) => floor.level >= 0)
    .map((floor) => {
      const geometry = new ExtrudeGeometry(shape, {
        depth: floor.top - floor.base - slabGap,
        bevelEnabled: false,
      });
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, floor.base, 0);
      return geometry;
    });
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error(`Could not build geometry for ${mass.id}`);
  return merged;
}

/** Boundary wall as one merged geometry of oriented boxes. */
export function wallGeometry(
  segments: WallSegment[],
  height: number,
  thickness: number,
): BufferGeometry | null {
  if (!segments.length || height <= 0) return null;
  const parts = segments.map((segment) => {
    const dx = segment.to[0] - segment.from[0],
      dz = segment.to[1] - segment.from[1];
    const box = new BoxGeometry(Math.hypot(dx, dz), height, thickness);
    box.rotateY(Math.atan2(-dz, dx));
    box.translate(
      (segment.from[0] + segment.to[0]) / 2,
      height / 2,
      (segment.from[1] + segment.to[1]) / 2,
    );
    return box;
  });
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return merged;
}

/** Two posts per located gate, placed across the opening using its heading. */
export function gatePostGeometry(campus: Campus): BufferGeometry | null {
  const width = campus.meta.defaults.gateWidth ?? 0;
  const height = (campus.meta.defaults.boundaryWallHeight ?? 2) + 0.6;
  const parts = campus.gates.flatMap((gate) => {
    if (!gate.position || gate.heading === undefined || width <= 0) return [];
    const h = (gate.heading * Math.PI) / 180;
    // Heading is a compass bearing; the wall runs perpendicular to it.
    const along: Vec2 = [Math.cos(h), Math.sin(h)];
    return [-1, 1].map((side) => {
      const post = new BoxGeometry(0.6, height, 0.6);
      post.translate(
        gate.position![0] + (side * along[0] * width) / 2,
        height / 2,
        gate.position![1] + (side * along[1] * width) / 2,
      );
      return post;
    });
  });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  return merged;
}

/** Wireframe of the static colliders for the debug view (one draw call). */
export function colliderLineGeometry(
  colliders: StaticCollider[],
): BufferGeometry {
  const points: number[] = [];
  const edge = (a: number[], b: number[]) => points.push(...a, ...b);
  for (const collider of colliders) {
    if (collider.kind === 'prism') {
      collider.polygon.forEach((p, i) => {
        const q = collider.polygon[(i + 1) % collider.polygon.length]!;
        edge([p[0], collider.minY, p[1]], [q[0], collider.minY, q[1]]);
        edge([p[0], collider.maxY, p[1]], [q[0], collider.maxY, q[1]]);
        edge([p[0], collider.minY, p[1]], [p[0], collider.maxY, p[1]]);
      });
    } else {
      const [hx, hy, hz] = collider.halfExtents;
      const cos = Math.cos(collider.rotationY),
        sin = Math.sin(collider.rotationY);
      const corner = (sx: number, sy: number, sz: number) => [
        collider.center[0] + sx * hx * cos + sz * hz * sin,
        collider.center[1] + sy * hy,
        collider.center[2] - sx * hx * sin + sz * hz * cos,
      ];
      for (const sy of [-1, 1]) {
        const ring = [
          corner(-1, sy, -1),
          corner(1, sy, -1),
          corner(1, sy, 1),
          corner(-1, sy, 1),
        ];
        ring.forEach((p, i) => edge(p, ring[(i + 1) % 4]!));
      }
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const)
        edge(corner(sx, -1, sz), corner(sx, 1, sz));
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  return geometry;
}

export const centroid = (polygon: Vec2[]): Vec2 => [
  polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length,
  polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length,
];

/** Horizontal spacing of the procedural window panes (m). */
export const WINDOW_PITCH = 3;

/** Window bands as one merged geometry; u counts panes along the facade. */
export function windowBandGeometry(bands: WindowBand[]): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  bands.forEach((band, i) => {
    const off = 0.06;
    const [ox, oz] = [band.outward[0] * off, band.outward[1] * off];
    const panes =
      Math.hypot(band.to[0] - band.from[0], band.to[1] - band.from[1]) /
      WINDOW_PITCH;
    const corners: [number, number, number, number, number][] = [
      [band.from[0] + ox, band.base, band.from[1] + oz, 0, 0],
      [band.to[0] + ox, band.base, band.to[1] + oz, panes, 0],
      [band.to[0] + ox, band.top, band.to[1] + oz, panes, 1],
      [band.from[0] + ox, band.top, band.from[1] + oz, 0, 1],
    ];
    for (const [x, y, z, u, v] of corners) {
      positions.push(x, y, z);
      uvs.push(u, v);
    }
    const k = i * 4;
    // Both windings so the band shows whichever way the footprint runs.
    indices.push(
      k,
      k + 1,
      k + 2,
      k,
      k + 2,
      k + 3,
      k,
      k + 2,
      k + 1,
      k,
      k + 3,
      k + 2,
    );
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

/** Alpha pattern of one window pane with a frame (repeats along u). */
export function windowPaneTexture(): DataTexture {
  const w = 16,
    h = 8;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      const pane = x >= 2 && x < w - 2 && y >= 1 && y < h - 1 ? 255 : 0;
      data.set([pane, pane, pane, 255], (y * w + x) * 4);
    }
  const texture = new DataTexture(data, w, h);
  texture.wrapS = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** A closed gate leaf spanning the opening (hidden while the gate is open). */
export function gateLeafGeometry(
  gate: Campus['gates'][number],
  width: number,
  height: number,
): BufferGeometry | null {
  if (!gate.position || gate.heading === undefined || width <= 0) return null;
  const [ix, iz] = inwardOf(gate.heading);
  const leaf = new BoxGeometry(width, height, 0.12);
  // Local +X along the wall, i.e. perpendicular to the inward direction.
  leaf.rotateY(Math.atan2(-ix, -iz));
  leaf.translate(gate.position[0], height / 2, gate.position[1]);
  return leaf;
}
