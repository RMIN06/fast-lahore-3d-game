import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sky, Stars } from '@react-three/drei';
import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from 'three';
import type { ShaderMaterial } from 'three';
import type { Sky as SkyMesh } from 'three-stdlib';
import { loadedCampus } from '../world/campus';
import {
  buildingMasses,
  campusBounds,
  lampPositions,
  windowBands,
} from '../systems/campus-geometry';
import { windowBandGeometry, windowPaneTexture } from '../world/campus-meshes';
import { lightingAt } from '../systems/time';
import type { Lighting } from '../systems/time';
import { gameClock, useClockStore } from '../state/clock-store';
import { usePlayerStore } from '../state/player-store';

// M5 time of day: sky, sun (with shadows), moon, stars, fog, exposure, lamp
// posts and window glow, all driven by the game clock.

const SHADOW_EXTENT = 80;
const LAMP_HEIGHT = 4.2;
const GLASS = new Color('#26313a');
const WARM = new Color('#ffd27a');
const LAMP_OFF = new Color('#5c5a52');

export function Environment() {
  const { campus } = loadedCampus;
  const { gl, scene } = useThree();
  const { center, size } = useMemo(() => campusBounds(campus), [campus]);
  const sun = useRef<DirectionalLight>(null);
  const moonLight = useRef<DirectionalLight>(null);
  const hemisphere = useRef<HemisphereLight>(null);
  const sky = useRef<SkyMesh>(null);
  const stars = useRef<Group>(null);
  const moon = useRef<Mesh>(null);
  const lastQuarter = useRef(-1);
  const publishTimer = useRef(0);
  const lighting = useRef<Lighting>(lightingAt(gameClock.minutes));

  const target = useMemo(() => new Object3D(), []);
  const fog = useMemo(() => new Fog('#b9d2e6', 120, size * 3), [size]);
  useEffect(() => {
    scene.fog = fog;
    scene.add(target);
    return () => {
      scene.fog = null;
      scene.remove(target);
    };
  }, [scene, fog, target]);

  // Window bands and lamp posts are built once from campus data.
  const windows = useMemo(() => {
    const geometry = windowBandGeometry(windowBands(buildingMasses(campus)));
    const material = new MeshBasicMaterial({
      color: GLASS.clone(),
      alphaMap: windowPaneTexture(),
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    return { geometry, material };
  }, [campus]);
  const lamps = useMemo(() => {
    const points = lampPositions(campus);
    const pole = new InstancedMesh(
      new CylinderGeometry(0.06, 0.08, LAMP_HEIGHT, 6),
      new MeshStandardMaterial({ color: '#2f3338', roughness: 0.7 }),
      points.length,
    );
    const head = new InstancedMesh(
      new SphereGeometry(0.28, 10, 8),
      new MeshBasicMaterial({ color: LAMP_OFF.clone() }),
      points.length,
    );
    const pool = new InstancedMesh(
      new CircleGeometry(6, 24).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({
        color: WARM.clone(),
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
      points.length,
    );
    const m = new Matrix4();
    points.forEach(([x, z], i) => {
      pole.setMatrixAt(i, m.makeTranslation(x, LAMP_HEIGHT / 2, z));
      head.setMatrixAt(i, m.makeTranslation(x, LAMP_HEIGHT + 0.2, z));
      pool.setMatrixAt(i, m.makeTranslation(x, 0.14, z));
    });
    pole.castShadow = true;
    pole.name = 'lamp-poles';
    head.name = 'lamp-heads';
    pool.name = 'lamp-pools';
    return { pole, head, pool, count: points.length };
  }, [campus]);
  useEffect(
    () => () => {
      windows.geometry.dispose();
      windows.material.alphaMap?.dispose();
      windows.material.dispose();
      for (const mesh of [lamps.pole, lamps.head, lamps.pool]) {
        mesh.geometry.dispose();
        (mesh.material as MeshBasicMaterial).dispose();
        mesh.dispose();
      }
    },
    [windows, lamps],
  );

  useFrame((_, delta) => {
    gameClock.advance(Math.min(delta, 0.25));
    publishTimer.current += delta;
    if (publishTimer.current >= 0.25) {
      publishTimer.current = 0;
      useClockStore.getState().publish();
    }

    // Recompute lighting only when game time moves by a quarter minute.
    const quarter = Math.floor(gameClock.minutes * 4);
    if (quarter !== lastQuarter.current) {
      lastQuarter.current = quarter;
      lighting.current = lightingAt(gameClock.minutes);
      const l = lighting.current;
      const d = l.sun.direction;
      if (hemisphere.current) {
        hemisphere.current.color.set(l.ambientColor);
        hemisphere.current.groundColor.set(l.groundColor);
        hemisphere.current.intensity = l.ambientIntensity;
      }
      fog.color.set(l.fogColor);
      gl.toneMappingExposure = l.exposure;
      const skyMaterial = sky.current?.material as ShaderMaterial | undefined;
      skyMaterial?.uniforms.sunPosition?.value.set(d[0], d[1], d[2]);
      if (stars.current) stars.current.visible = l.starOpacity > 0.05;
      windows.material.color.copy(GLASS).lerp(WARM, l.windowGlow);
      windows.material.opacity = 0.75 + 0.25 * l.windowGlow;
      (lamps.head.material as MeshBasicMaterial).color.copy(
        l.lampsOn ? WARM : LAMP_OFF,
      );
      (lamps.pool.material as MeshBasicMaterial).opacity = l.lampsOn ? 0.2 : 0;
      lamps.pool.visible = l.lampsOn;
      if (sun.current) {
        sun.current.intensity = l.sunIntensity;
        sun.current.castShadow = l.sunIntensity > 0.05;
      }
      if (moonLight.current) moonLight.current.intensity = l.moonIntensity;
      if (moon.current) moon.current.visible = l.daylight < 0.5;
    }

    // Shadows follow the player (or the campus centre in the free camera),
    // snapped to a grid so the shadow map does not shimmer while walking.
    const player = usePlayerStore.getState();
    const fx = player.mode === 'free' ? center[0] : player.position[0];
    const fz = player.mode === 'free' ? center[1] : player.position[2];
    const sx = Math.round(fx / 8) * 8,
      sz = Math.round(fz / 8) * 8;
    target.position.set(sx, 0, sz);
    target.updateMatrixWorld();
    const d = lighting.current.sun.direction;
    sun.current?.position.set(sx + d[0] * 200, d[1] * 200, sz + d[2] * 200);
    const my = Math.max(0.3, -d[1]);
    moonLight.current?.position.set(sx - d[0] * 200, my * 200, sz - d[2] * 200);
    moon.current?.position.set(sx - d[0] * 700, my * 700, sz - d[2] * 700);
  });

  return (
    <>
      <Sky ref={sky} distance={1500} turbidity={6} rayleigh={1.2} />
      <group ref={stars}>
        <Stars radius={650} depth={60} count={2500} factor={5} fade />
      </group>
      <mesh ref={moon} name="moon">
        <sphereGeometry args={[14, 16, 12]} />
        <meshBasicMaterial color="#e8eef8" fog={false} />
      </mesh>
      <hemisphereLight ref={hemisphere} args={['#e4f1ff', '#3d4a3a', 1.6]} />
      <directionalLight
        ref={sun}
        target={target}
        color="#fff3df"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={1}
        shadow-camera-far={500}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <directionalLight ref={moonLight} target={target} color="#9fb6e6" />
      <mesh
        name="windows"
        geometry={windows.geometry}
        material={windows.material}
      />
      <primitive object={lamps.pole} />
      <primitive object={lamps.head} />
      <primitive object={lamps.pool} />
    </>
  );
}
