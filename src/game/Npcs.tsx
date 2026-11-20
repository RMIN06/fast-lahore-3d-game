import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import {
  getNavMeshPositionsAndIndices,
  importNavMesh,
  init,
} from 'recast-navigation';
import { CharacterRig } from '../world/character-mesh';
import { NpcGeometryCache, npcLook } from '../world/npc-meshes';
import { createNpcSim } from '../world/npc-world';
import { loadedCampus } from '../world/campus';
import { CharacterAnimator, proportions } from '../systems/character';
import { ACTIVE_CAP, ACTIVE_RADIUS } from '../systems/npc-sim';
import type { NpcState } from '../systems/npc-sim';
import type { Vec3 } from '../systems/npc';
import { gameClock } from '../state/clock-store';
import { usePlayerStore } from '../state/player-store';
import { useNpcStore } from '../state/npc-store';
import { useDebugStore } from '../state/debug-store';

// M9 NPCs: loads the baked campus navmesh, runs the schedule/crowd simulation
// (src/systems/npc-sim.ts) and draws the nearest NPCs with the M8 character.

/** Never draw more NPCs than can be crowd agents. */
const RENDER_CAP = ACTIVE_CAP;
const CHOOSE_EVERY = 0.25;
const PUBLISH_EVERY = 0.5;
/** Plain stool under seated NPCs until furniture exists (seat top 0.42 m). */
const STOOL = 0.42;

interface Shown {
  npc: NpcState;
  rig: CharacterRig;
  animator: CharacterAnimator;
  last: Vec3;
  yaw: number;
}

type World = ReturnType<typeof createNpcSim> & {
  /** Navmesh triangle edges for the debug viewer (lifted 20 cm above the surface layers). */
  wire: BufferGeometry;
  destroy: () => void;
};

/** Edge list of the navmesh triangles, for the dev overlay's Navmesh toggle. */
function navMeshWire(positions: number[], indices: number[]) {
  const out: number[] = [];
  const at = (i: number) => [
    positions[i * 3]!,
    positions[i * 3 + 1]! + 0.2,
    positions[i * 3 + 2]!,
  ];
  for (let t = 0; t < indices.length; t += 3)
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ] as const)
      out.push(...at(indices[t + a]!), ...at(indices[t + b]!));
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(out, 3));
  return g;
}

export function Npcs() {
  const { camera } = useThree();
  const [world, setWorld] = useState<World>();
  const showNavmesh = useDebugStore((s) => s.navmesh);
  const root = useMemo(() => new Group(), []);
  const cache = useMemo(() => new NpcGeometryCache(), []);
  const shown = useRef(new Map<string, Shown>());
  const stools = useMemo(() => {
    const mesh = new InstancedMesh(
      new BoxGeometry(STOOL, STOOL, STOOL),
      new MeshStandardMaterial({ color: '#6b5a46', roughness: 0.9 }),
      RENDER_CAP,
    );
    mesh.name = 'npc-stools';
    mesh.count = 0;
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  }, [root]);
  const scratch = useMemo(
    () => ({ dummy: new Object3D(), hips: new Vector3() }),
    [],
  );
  const timers = useRef({ choose: 0, publish: 0 });

  useEffect(() => {
    let disposed = false;
    let created: World | undefined;
    void (async () => {
      try {
        await init();
        const response = await fetch(
          `${import.meta.env.BASE_URL}navmesh/campus.bin`,
        );
        if (!response.ok) throw new Error(`navmesh ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (disposed) return;
        const { navMesh } = importNavMesh(bytes);
        const sim = createNpcSim(navMesh, loadedCampus.campus);
        const wire = navMeshWire(...getNavMeshPositionsAndIndices(navMesh));
        created = {
          ...sim,
          wire,
          destroy: () => {
            sim.crowd.destroy();
            navMesh.destroy();
            wire.dispose();
          },
        };
        setWorld(created);
        useNpcStore.setState({ status: 'ready' });
      } catch (error) {
        console.warn('NPCs unavailable:', error);
        useNpcStore.setState({ status: 'error' });
      }
    })();
    return () => {
      disposed = true;
      created?.destroy();
    };
  }, []);

  useEffect(() => {
    const map = shown.current;
    return () => {
      map.forEach((s) => root.remove(s.rig.group));
      map.clear();
      cache.dispose();
      stools.geometry.dispose();
      (stools.material as MeshStandardMaterial).dispose();
    };
  }, [cache, root, stools]);

  useFrame((_, delta) => {
    if (!world) return;
    const { sim } = world;
    const dt = Math.min(delta, 0.1);
    const player = usePlayerStore.getState();
    const observer: Vec3 =
      player.mode === 'free'
        ? [camera.position.x, 0, camera.position.z]
        : player.position;
    if (!gameClock.paused)
      sim.update(
        dt,
        { day: gameClock.day, minutes: gameClock.minutes },
        observer,
      );

    const t = timers.current;
    t.choose += delta;
    if (t.choose >= CHOOSE_EVERY) {
      t.choose = 0;
      const near = sim.present
        .map((npc) => ({
          npc,
          d: Math.hypot(
            npc.position[0] - observer[0],
            npc.position[2] - observer[2],
          ),
        }))
        .filter((x) => x.d <= ACTIVE_RADIUS)
        .sort((a, b) => a.d - b.d)
        .slice(0, RENDER_CAP);
      const keep = new Set(near.map((x) => x.npc.day.id));
      for (const [id, s] of shown.current)
        if (!keep.has(id)) {
          root.remove(s.rig.group);
          shown.current.delete(id);
        }
      for (const { npc } of near) {
        if (shown.current.has(npc.day.id)) continue;
        const { body, look, key } = npcLook(npc.day);
        const rig = new CharacterRig(body, look, cache.get(body, look, key));
        rig.group.name = `npc:${npc.day.id}`;
        // Only the closest level casts shadows: keeps the shadow pass cheap.
        rig.levels.forEach((m, level) => (m.castShadow = level === 0));
        root.add(rig.group);
        shown.current.set(npc.day.id, {
          npc,
          rig,
          animator: new CharacterAnimator(proportions(body)),
          last: npc.position,
          yaw: npc.heading,
        });
      }
    }

    let seated = 0;
    for (const s of shown.current.values()) {
      const p = s.npc.position;
      let moved = Math.hypot(p[0] - s.last[0], p[2] - s.last[2]);
      if (moved > 2) moved = 0; // a re-plan jump is not a step
      s.last = p;
      const diff = Math.atan2(
        Math.sin(s.npc.heading - s.yaw),
        Math.cos(s.npc.heading - s.yaw),
      );
      s.yaw += diff * Math.min(1, dt * 8);
      const pose = s.animator.update({
        distance: moved,
        dt,
        grounded: true,
        ...(sim.sitting(s.npc) ? { action: 'sit' as const } : {}),
      });
      s.rig.applyPose(pose);
      s.rig.group.position.set(p[0], p[1], p[2]);
      s.rig.group.rotation.y = s.yaw;
      if (s.animator.state === 'sit') {
        s.rig.group.updateMatrixWorld(true);
        s.rig.bones.get('hips')!.getWorldPosition(scratch.hips);
        const d = scratch.dummy;
        d.position.set(scratch.hips.x, p[1] + STOOL / 2, scratch.hips.z);
        d.rotation.set(0, s.yaw, 0);
        d.updateMatrix();
        stools.setMatrixAt(seated, d.matrix);
        seated += 1;
      }
    }
    stools.count = seated;
    stools.instanceMatrix.needsUpdate = true;

    t.publish += delta;
    if (t.publish >= PUBLISH_EVERY) {
      t.publish = 0;
      useNpcStore.setState({
        present: sim.present.length,
        active: sim.active.length,
        rendered: shown.current.size,
        stuck: sim.stats.stuck,
        pathFailures: sim.stats.pathFailures,
      });
    }
  });

  return (
    <>
      <primitive object={root} />
      {showNavmesh && world && (
        <lineSegments name="navmesh" geometry={world.wire}>
          <lineBasicMaterial color="#36e0c8" />
        </lineSegments>
      )}
    </>
  );
}
