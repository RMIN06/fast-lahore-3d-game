import { useEffect, useMemo } from 'react';
import { Html, OrbitControls } from '@react-three/drei';
import { ConeGeometry, MeshStandardMaterial } from 'three';
import type { BufferGeometry } from 'three';
import { loadedCampus } from '../world/campus';
import {
  boundaryWallSegments,
  buildingMasses,
  campusBounds,
  floorSummary,
  staticColliders,
  weakest,
} from '../systems/campus-geometry';
import {
  buildingGeometry,
  centroid,
  colliderLineGeometry,
  gatePostGeometry,
  surfaceGeometry,
  wallGeometry,
} from '../world/campus-meshes';
import { useDebugStore } from '../state/debug-store';
import { usePlayerStore } from '../state/player-store';
import type { Campus, Confidence } from '../types/campus';

// M3 exterior greybox. Thin component: geometry comes from campus data via
// src/systems/campus-geometry.ts and src/world/campus-meshes.ts.

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  measured: '#7fd6ab',
  traced: '#82bbec',
  estimated: '#e5c373',
  placeholder: '#ee6f6f',
};
const SURFACE_COLORS: Record<string, string> = {
  grass: '#5d8a4a',
  turf: '#3f9a58',
  concrete: '#a3a199',
  paving: '#b9a98c',
  asphalt: '#4b4f53',
  clay: '#a86b4a',
};
const KIND_COLORS: Record<string, string> = {
  lawn: '#5d8a4a',
  ground: '#3f9a58',
  court: '#a3a199',
  parking: '#4b4f53',
  path: '#b9a98c',
  road: '#4b4f53',
  plaza: '#b9a98c',
  shop: '#c89a6a',
  cafe: '#c89a6a',
  masjid: '#ded6c4',
  water_feature: '#4f8fb8',
  other: '#8a8a8a',
};
// Stacking order (meters above ground) so surfaces never z-fight.
const KIND_LAYER: Record<string, number> = {
  lawn: 0.06,
  ground: 0.08,
  court: 0.08,
  parking: 0.08,
  path: 0.1,
  road: 0.1,
  plaza: 0.1,
};
const BUILDING_COLOR = '#c9c2b6';
const WALL_COLOR = '#9b5a44';

type Area = Campus['areas'][number];

export function CampusScene() {
  const { campus } = loadedCampus;
  const confidenceColors = useDebugStore((s) => s.confidenceColors);
  const labels = useDebugStore((s) => s.labels);
  const colliders = useDebugStore((s) => s.colliders);
  // The orbit view is the M3 overview, kept as a free debug camera from M4.
  const freeCamera = usePlayerStore((s) => s.mode === 'free');
  const { center, size } = useMemo(() => campusBounds(campus), [campus]);

  const masses = useMemo(() => buildingMasses(campus), [campus]);
  const geometry = useMemo(() => {
    const d = campus.meta.defaults;
    return {
      outside: surfaceGeometry(
        [
          [center[0] - size * 2, center[1] - size * 2],
          [center[0] + size * 2, center[1] - size * 2],
          [center[0] + size * 2, center[1] + size * 2],
          [center[0] - size * 2, center[1] + size * 2],
        ],
        0,
      ),
      campusGround: campus.boundary.polygon
        ? surfaceGeometry(campus.boundary.polygon, 0.03)
        : null,
      areas: campus.areas.flatMap((area) =>
        area.polygon
          ? [
              {
                area,
                geometry: surfaceGeometry(
                  area.polygon,
                  KIND_LAYER[area.kind] ?? 0.12,
                ),
              },
            ]
          : [],
      ),
      buildings: masses.map((mass) => ({
        mass,
        geometry: buildingGeometry(mass),
      })),
      wall: wallGeometry(
        boundaryWallSegments(campus),
        d.boundaryWallHeight ?? 0,
        d.wallThickness,
      ),
      gatePosts: gatePostGeometry(campus),
      colliders: colliderLineGeometry(staticColliders(campus)),
      entryMarker: new ConeGeometry(0.6, 1.6, 8),
    };
  }, [campus, masses, center, size]);

  useEffect(
    () => () => {
      const all: (BufferGeometry | null)[] = [
        geometry.outside,
        geometry.campusGround,
        geometry.wall,
        geometry.gatePosts,
        geometry.colliders,
        geometry.entryMarker,
        ...geometry.areas.map((a) => a.geometry),
        ...geometry.buildings.map((b) => b.geometry),
      ];
      all.forEach((g) => g?.dispose());
    },
    [geometry],
  );

  // Shared materials, one per color (instancing-friendly, no per-frame allocation).
  const materials = useMemo(() => new Map<string, MeshStandardMaterial>(), []);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  const material = (color: string, flat = false) => {
    const key = `${color}:${flat}`;
    let m = materials.get(key);
    if (!m) {
      m = new MeshStandardMaterial({
        color,
        roughness: 0.95,
        polygonOffset: flat,
        polygonOffsetFactor: flat ? -1 : 0,
      });
      materials.set(key, m);
    }
    return m;
  };
  const areaColor = (area: Area) =>
    confidenceColors
      ? CONFIDENCE_COLORS[area.confidence]
      : (SURFACE_COLORS[area.surface ?? ''] ?? KIND_COLORS[area.kind]!);

  return (
    <>
      <color attach="background" args={['#18232a']} />
      <hemisphereLight args={['#e4f1ff', '#3d4a3a', 1.6]} />
      <directionalLight
        position={[center[0] + size * 0.6, size, center[1] - size * 0.4]}
        intensity={2.2}
      />
      {freeCamera && (
        <OrbitControls
          makeDefault
          target={[center[0], 0, center[1]]}
          maxPolarAngle={Math.PI / 2.05}
          minDistance={20}
          maxDistance={size * 3}
        />
      )}
      <mesh geometry={geometry.outside} material={material('#36443a')} />
      {geometry.campusGround && (
        <mesh
          geometry={geometry.campusGround}
          material={material('#7d7a72', true)}
        />
      )}
      {geometry.areas.map(({ area, geometry: g }) => (
        <mesh
          key={area.id}
          name={`area:${area.id}`}
          geometry={g}
          material={material(areaColor(area), true)}
        />
      ))}
      {geometry.buildings.map(({ mass, geometry: g }) => (
        <mesh
          key={mass.id}
          name={`building:${mass.id}`}
          geometry={g}
          material={material(
            confidenceColors
              ? CONFIDENCE_COLORS[
                  weakest(mass.confidence, mass.floorsConfidence)
                ]
              : BUILDING_COLOR,
          )}
        />
      ))}
      {geometry.wall && (
        <mesh geometry={geometry.wall} material={material(WALL_COLOR)} />
      )}
      {geometry.gatePosts && (
        <mesh geometry={geometry.gatePosts} material={material('#f0d58c')} />
      )}
      {campus.buildings.flatMap((building) =>
        building.entries.flatMap((entry) =>
          entry.position
            ? [
                <mesh
                  key={`${building.id}:${entry.id}`}
                  geometry={geometry.entryMarker}
                  material={material('#f0d58c')}
                  position={[entry.position[0], 0.8, entry.position[1]]}
                />,
              ]
            : [],
        ),
      )}
      {colliders && (
        <lineSegments geometry={geometry.colliders}>
          <lineBasicMaterial color="#ff4fd8" />
        </lineSegments>
      )}
      {labels && (
        <>
          {masses.map((mass) => {
            const [x, z] = centroid(mass.footprint);
            return (
              <Html
                key={mass.id}
                position={[x, mass.height + 3, z]}
                center
                zIndexRange={[10, 0]}
                className="world-label world-label--building"
              >
                <strong>
                  {mass.id} · {mass.label}
                </strong>
                <span data-testid={`floors-${mass.id}`}>
                  {floorSummary(mass)}
                  {mass.floorsConfidence === 'placeholder'
                    ? ' · floors unknown (placeholder)'
                    : ''}
                </span>
              </Html>
            );
          })}
          {campus.gates.flatMap((gate) =>
            gate.position
              ? [
                  <Html
                    key={gate.id}
                    position={[gate.position[0], 5, gate.position[1]]}
                    center
                    zIndexRange={[10, 0]}
                    className="world-label world-label--gate"
                  >
                    {gate.label}
                    {gate.confidence === 'placeholder' ? ' (placeholder)' : ''}
                  </Html>,
                ]
              : [],
          )}
        </>
      )}
    </>
  );
}
