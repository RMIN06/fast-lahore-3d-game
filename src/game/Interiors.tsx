import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { loadedCampus } from '../world/campus';
import { interiorLayouts } from '../world/interiors';
import {
  doorPlates,
  doorwayGeometry,
  interiorSlabGeometry,
  interiorWallGeometry,
  roomFloorGeometry,
} from '../world/interior-meshes';
import { floorAt, insideInterior, roomAt } from '../systems/interior';
import type { InteriorLayout } from '../systems/interior';
import { usePlayerStore } from '../state/player-store';
import { useWorldStore } from '../state/world-store';
import { useDebugStore } from '../state/debug-store';
import type { Confidence } from '../types/campus';

// M7 interiors: streamed per building (load within 25 m of its door or when
// inside; unload beyond 60 m), plus the location used by the HUD.

const LOAD_DISTANCE = 25;
const UNLOAD_DISTANCE = 60;
const CONFIDENCE: Record<Confidence, string> = {
  measured: '#7fd6ab',
  traced: '#82bbec',
  estimated: '#e5c373',
  placeholder: '#ee6f6f',
};

function InteriorChunk({ layout }: { layout: InteriorLayout }) {
  const confidenceColors = useDebugStore((s) => s.confidenceColors);
  const parts = useMemo(
    () => ({
      walls: interiorWallGeometry(layout),
      slabs: interiorSlabGeometry(layout),
      floors: roomFloorGeometry(layout),
      plates: doorPlates(layout),
    }),
    [layout],
  );
  const materials = useMemo(
    () => ({
      wall: new MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.9 }),
      // Generated layout = placeholder: walls tinted in the confidence view.
      wallPlaceholder: new MeshStandardMaterial({
        color: '#e9a3a3',
        roughness: 0.9,
      }),
      slab: new MeshStandardMaterial({ color: '#9b958a', roughness: 0.95 }),
      plate: parts.plates
        ? new MeshBasicMaterial({ map: parts.plates.texture })
        : undefined,
      floors: new Map(
        parts.floors.map(({ confidence }) => [
          confidence,
          new MeshStandardMaterial({
            color: CONFIDENCE[confidence],
            roughness: 0.9,
            polygonOffset: true,
            polygonOffsetFactor: -1,
          }),
        ]),
      ),
      floorNeutral: new MeshStandardMaterial({
        color: '#b9b2a4',
        roughness: 0.9,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    }),
    [parts],
  );
  useEffect(
    () => () => {
      parts.walls?.dispose();
      parts.slabs?.dispose();
      parts.floors.forEach((f) => f.geometry.dispose());
      parts.plates?.geometry.dispose();
      parts.plates?.texture.dispose();
      materials.wall.dispose();
      materials.wallPlaceholder.dispose();
      materials.slab.dispose();
      materials.plate?.dispose();
      materials.floors.forEach((m) => m.dispose());
      materials.floorNeutral.dispose();
    },
    [parts, materials],
  );
  return (
    <group name={`interior:${layout.buildingId}`}>
      {parts.walls && (
        <mesh
          geometry={parts.walls}
          material={
            confidenceColors ? materials.wallPlaceholder : materials.wall
          }
          castShadow
          receiveShadow
        />
      )}
      {parts.slabs && (
        <mesh
          geometry={parts.slabs}
          material={materials.slab}
          castShadow
          receiveShadow
        />
      )}
      {parts.floors.map(({ confidence, geometry }) => (
        <mesh
          key={confidence}
          geometry={geometry}
          material={
            confidenceColors
              ? materials.floors.get(confidence)!
              : materials.floorNeutral
          }
          receiveShadow
        />
      ))}
      {parts.plates && materials.plate && (
        <mesh
          name="door-plates"
          geometry={parts.plates.geometry}
          material={materials.plate}
        />
      )}
    </group>
  );
}

export function Interiors() {
  const { campus } = loadedCampus;
  const layouts = useMemo(() => interiorLayouts(campus), [campus]);
  const active = useWorldStore((s) => s.activeInteriors);
  const timer = useRef(0);
  const doorway = useMemo(() => doorwayGeometry(layouts), [layouts]);
  const doorwayMaterial = useMemo(
    () => new MeshBasicMaterial({ color: '#111518' }),
    [],
  );
  useEffect(
    () => () => {
      doorway?.dispose();
      doorwayMaterial.dispose();
    },
    [doorway, doorwayMaterial],
  );

  useFrame((_, delta) => {
    timer.current += delta;
    if (timer.current < 0.15) return;
    timer.current = 0;
    const [x, y, z] = usePlayerStore.getState().position;
    const world = useWorldStore.getState();
    const current = new Set(world.activeInteriors);
    let location = {};
    for (const layout of layouts) {
      const inside =
        insideInterior(layout, [x, z]) &&
        y > layout.floors[0]!.base - 1 &&
        y < layout.floors.at(-1)!.top + 1;
      const distance = Math.hypot(
        x - layout.door.position[0],
        z - layout.door.position[1],
      );
      if (inside || distance < LOAD_DISTANCE) current.add(layout.buildingId);
      else if (distance > UNLOAD_DISTANCE) current.delete(layout.buildingId);
      if (inside) {
        const floor = floorAt(layout, y);
        const room = roomAt(layout, [x, z], floor.floorId);
        const building = campus.buildings.find(
          (b) => b.id === layout.buildingId,
        )!;
        location = {
          buildingId: building.id,
          buildingLabel: building.label,
          floorId: floor.floorId,
          floorLabel: floor.label,
          ...(room
            ? {
                spaceId: room.spaceId,
                roomCode: room.code,
                roomName: room.name,
              }
            : {}),
        };
      }
    }
    world.setLocation(location);
    world.setActiveInteriors(
      layouts.map((l) => l.buildingId).filter((id) => current.has(id)),
    );
  });

  return (
    <>
      {doorway && (
        <mesh name="doorways" geometry={doorway} material={doorwayMaterial} />
      )}
      {layouts
        .filter((l) => active.includes(l.buildingId))
        .map((layout) => (
          <InteriorChunk key={layout.buildingId} layout={layout} />
        ))}
    </>
  );
}
