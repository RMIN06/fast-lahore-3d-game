import type { Building, Campus, Confidence, Vec2 } from '../types/campus';

// Pure exterior-greybox maths (M3). No three.js here so it stays unit testable.
// World axes: +X east, +Y up, +Z south; polygons are [x, z] in meters.

export interface FloorSlab {
  floorId: string;
  level: number;
  base: number;
  top: number;
}

export interface BuildingMass {
  id: string;
  label: string;
  footprint: Vec2[];
  floors: FloorSlab[];
  aboveGround: number;
  basements: number;
  height: number;
  confidence: Confidence;
  floorsConfidence: Confidence;
}

export interface WallSegment {
  from: Vec2;
  to: Vec2;
}

export type StaticCollider =
  | {
      kind: 'prism';
      id: string;
      polygon: Vec2[];
      minY: number;
      maxY: number;
    }
  | {
      kind: 'box';
      id: string;
      center: [number, number, number];
      halfExtents: [number, number, number];
      rotationY: number;
    };

const RANK: Record<Confidence, number> = {
  placeholder: 0,
  estimated: 1,
  traced: 2,
  measured: 3,
};

/** Lowest (least certain) of several confidence levels. */
export function weakest(...levels: Confidence[]): Confidence {
  return levels.reduce((a, b) => (RANK[b] < RANK[a] ? b : a));
}

/** Stack floors from ground level: levels >= 0 go up, basements go down. */
export function floorStack(
  building: Building,
  defaults: Campus['meta']['defaults'],
): FloorSlab[] {
  const sorted = [...building.floors].sort((a, b) => a.level - b.level);
  const heightOf = (floor: Building['floors'][number]) =>
    floor.height ??
    (floor.level < 0 ? defaults.basementHeight : defaults.floorHeight);
  const slabs: FloorSlab[] = [];
  let top = 0;
  for (const floor of sorted.filter((f) => f.level >= 0)) {
    const base = top;
    top += heightOf(floor);
    slabs.push({ floorId: floor.id, level: floor.level, base, top });
  }
  let bottom = 0;
  for (const floor of sorted.filter((f) => f.level < 0).reverse()) {
    const ceiling = bottom;
    bottom -= heightOf(floor);
    slabs.unshift({
      floorId: floor.id,
      level: floor.level,
      base: bottom,
      top: ceiling,
    });
  }
  return slabs;
}

export function buildingMasses(campus: Campus): BuildingMass[] {
  return campus.buildings.flatMap((building) => {
    if (!building.footprint) return [];
    const floors = floorStack(building, campus.meta.defaults);
    const above = floors.filter((f) => f.level >= 0);
    return [
      {
        id: building.id,
        label: building.label,
        footprint: building.footprint,
        floors,
        aboveGround: above.length,
        basements: floors.length - above.length,
        height: above.at(-1)?.top ?? 0,
        confidence: building.confidence,
        floorsConfidence: building.floorsConfidence ?? 'placeholder',
      },
    ];
  });
}

/** "3 + B1" style floor-count summary used by labels and tests. */
export function floorSummary(mass: BuildingMass): string {
  const basements =
    mass.basements > 0
      ? ` + ${mass.basements} basement${mass.basements > 1 ? 's' : ''}`
      : '';
  return `${mass.aboveGround} above ground${basements}`;
}

const distanceToSegment = (p: Vec2, a: Vec2, b: Vec2) => {
  const dx = b[0] - a[0],
    dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / lengthSq),
  );
  return {
    distance: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz)),
    along: t * Math.sqrt(lengthSq),
  };
};

/**
 * Split the boundary into wall segments, leaving an opening of `gateWidth`
 * centred on every gate that lies on the boundary (within `tolerance` m).
 */
export function boundaryWallSegments(
  campus: Campus,
  tolerance = 0.5,
): WallSegment[] {
  const polygon = campus.boundary.polygon;
  if (!polygon) return [];
  const gateWidth = campus.meta.defaults.gateWidth ?? 0;
  const segments: WallSegment[] = [];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const openings = campus.gates
      .flatMap((gate) => {
        if (!gate.position || gateWidth <= 0) return [];
        const hit = distanceToSegment(gate.position, a, b);
        return hit.distance <= tolerance
          ? [
              [
                Math.max(0, hit.along - gateWidth / 2),
                Math.min(length, hit.along + gateWidth / 2),
              ] as [number, number],
            ]
          : [];
      })
      .sort((x, y) => x[0] - y[0]);
    const at = (d: number): Vec2 => [
      a[0] + ((b[0] - a[0]) * d) / length,
      a[1] + ((b[1] - a[1]) * d) / length,
    ];
    let cursor = 0;
    for (const [start, end] of openings) {
      if (start > cursor + 1e-6)
        segments.push({ from: at(cursor), to: at(start) });
      cursor = Math.max(cursor, end);
    }
    if (length > cursor + 1e-6) segments.push({ from: at(cursor), to: b });
  });
  return segments;
}

/**
 * Simplified static colliders (never from render meshes): one prism per
 * building footprint above ground and one oriented box per wall segment.
 * Consumed by the physics world in M4.
 */
export function staticColliders(campus: Campus): StaticCollider[] {
  const wallHeight = campus.meta.defaults.boundaryWallHeight ?? 0;
  const thickness = campus.meta.defaults.wallThickness;
  const buildings: StaticCollider[] = buildingMasses(campus).map((mass) => ({
    kind: 'prism',
    id: `building:${mass.id}`,
    polygon: mass.footprint,
    minY: 0,
    maxY: mass.height,
  }));
  const walls: StaticCollider[] =
    wallHeight > 0
      ? boundaryWallSegments(campus).map((segment, i) => {
          const dx = segment.to[0] - segment.from[0],
            dz = segment.to[1] - segment.from[1];
          return {
            kind: 'box',
            id: `wall:${i}`,
            center: [
              (segment.from[0] + segment.to[0]) / 2,
              wallHeight / 2,
              (segment.from[1] + segment.to[1]) / 2,
            ],
            halfExtents: [
              Math.hypot(dx, dz) / 2,
              wallHeight / 2,
              thickness / 2,
            ],
            // three.js Y rotation that maps local +X onto the segment direction.
            rotationY: Math.atan2(-dz, dx),
          };
        })
      : [];
  return [...buildings, ...walls];
}

/** Initial orbit camera that frames the whole campus from the south. */
export function campusCamera(campus: Campus) {
  const { center, size } = campusBounds(campus);
  return {
    position: [
      center[0] + size * 0.15,
      size * 0.75,
      center[1] + size * 0.85,
    ] as [number, number, number],
    fov: 50,
    near: 1,
    far: size * 8,
  };
}

/** Axis-aligned bounds of the boundary for camera framing. */
export function campusBounds(campus: Campus) {
  const points = campus.boundary.polygon ?? [];
  if (!points.length) return { center: [0, 0] as Vec2, size: 100 };
  const xs = points.map((p) => p[0]),
    zs = points.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs);
  return {
    center: [(minX + maxX) / 2, (minZ + maxZ) / 2] as Vec2,
    size: Math.max(maxX - minX, maxZ - minZ),
  };
}
