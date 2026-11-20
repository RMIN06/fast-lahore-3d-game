import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Mesh, PerspectiveCamera } from 'three';
import { loadedCampus } from '../world/campus';
import {
  campusBounds,
  campusCamera,
  gateSpawn,
  staticColliders,
} from '../systems/campus-geometry';
import { createPhysicsWorld, initRapier } from '../systems/physics';
import type { Rapier, World } from '../systems/physics';
import {
  cameraArmLength,
  DEFAULT_PLAYER,
  FixedStepper,
  PlayerController,
} from '../systems/player-controller';
import type { Vec3 } from '../systems/player-controller';
import { InputState } from '../systems/input-map';
import { toggledMode, usePlayerStore } from '../state/player-store';

// M4 player: Rapier kinematic capsule, pointer-lock mouse look, first/third
// person (V). Logic lives in src/systems; this component only wires it up.

const LOOK_SPEED = 0.0022;
const MAX_PITCH = 1.45;
const ARM_LENGTH = 3.5;
const SHOULDER = 0.35;
const PIVOT_HEIGHT = 1.6;
const FOV = { first: 75, third: 65 } as const;

interface Sim {
  R: Rapier;
  world: World;
  player: PlayerController;
}

export function PlayerRig() {
  const { camera, gl } = useThree();
  const sim = useRef<Sim>();
  const input = useMemo(() => new InputState(), []);
  // Up to 10 catch-up steps keeps the simulation real-time down to ~6 FPS.
  const stepper = useMemo(() => new FixedStepper(1 / 60, 10), []);
  const look = useRef({ yaw: 0, pitch: 0 });
  const capsule = useRef<Mesh>(null);
  const publishTimer = useRef(0);
  const mode = usePlayerStore((s) => s.mode);

  // Build the physics world from campus data once Rapier's WASM is loaded.
  useEffect(() => {
    let disposed = false;
    const { campus } = loadedCampus;
    void initRapier().then((R) => {
      if (disposed) return;
      const bounds = campusBounds(campus);
      const world = createPhysicsWorld(R, staticColliders(campus), {
        groundCenter: bounds.center,
        groundHalfSize: bounds.size,
      });
      const spawn = gateSpawn(campus);
      const player = new PlayerController(R, world, [
        spawn.position[0],
        0,
        spawn.position[1],
      ]);
      look.current = { yaw: spawn.yaw, pitch: 0 };
      sim.current = { R, world, player };
      usePlayerStore.getState().setReady(true);
    });
    return () => {
      disposed = true;
      sim.current?.world.free();
      sim.current = undefined;
      usePlayerStore.getState().setReady(false);
    };
  }, []);

  // Keyboard through the layered input map; mouse look under pointer lock.
  useEffect(() => {
    const canvas = gl.domElement;
    const typing = (event: Event) =>
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement;
    const down = (event: KeyboardEvent) => {
      if (typing(event)) return;
      const action = input.down(event.code);
      if (action && action !== 'pause') event.preventDefault();
    };
    const up = (event: KeyboardEvent) => input.up(event.code);
    const blur = () => input.clear();
    const click = () => {
      if (usePlayerStore.getState().mode !== 'free')
        void canvas.requestPointerLock?.();
    };
    const move = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      const l = look.current;
      l.yaw -= event.movementX * LOOK_SPEED;
      l.pitch = Math.max(
        -MAX_PITCH,
        Math.min(MAX_PITCH, l.pitch - event.movementY * LOOK_SPEED),
      );
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    canvas.addEventListener('click', click);
    document.addEventListener('mousemove', move);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      canvas.removeEventListener('click', click);
      document.removeEventListener('mousemove', move);
      input.clear();
    };
  }, [gl, input]);

  // Camera lens per mode: close near plane for walking, wider for the free view.
  useEffect(() => {
    const lens = camera as PerspectiveCamera;
    if (mode === 'free') {
      const overview = campusCamera(loadedCampus.campus);
      lens.near = overview.near;
      lens.fov = overview.fov;
      lens.position.set(...overview.position);
      if (document.pointerLockElement) void document.exitPointerLock();
    } else {
      lens.near = 0.1;
      lens.fov = FOV[mode];
    }
    lens.updateProjectionMatrix();
  }, [camera, mode]);

  useFrame((_, delta) => {
    const s = sim.current;
    if (!s) return;
    const state = usePlayerStore.getState();
    if (input.consume('toggleCamera')) state.setMode(toggledMode(state.mode));
    const current = usePlayerStore.getState().mode;

    const steps = stepper.advance(Math.min(delta, 0.25));
    // Keep a jump press pending until a physics step actually runs.
    let jump = steps > 0 && input.consume('jump');
    const { forward, right } = input.axes();
    const sprint = input.isHeld('sprint');
    if (current !== 'free')
      for (let i = 0; i < steps; i += 1) {
        s.player.step(stepper.dt, {
          forward,
          right,
          sprint,
          jump,
          yaw: look.current.yaw,
        });
        jump = false;
      }

    const feet = s.player.feet();
    if (capsule.current) {
      capsule.current.position.set(
        feet[0],
        feet[1] + DEFAULT_PLAYER.height / 2,
        feet[2],
      );
      capsule.current.rotation.y = look.current.yaw;
      capsule.current.visible = current !== 'first';
    }

    if (current !== 'free') {
      const { yaw, pitch } = look.current;
      camera.rotation.set(0, 0, 0);
      if (current === 'first') {
        camera.position.set(
          feet[0],
          feet[1] + DEFAULT_PLAYER.eyeHeight,
          feet[2],
        );
        camera.rotation.order = 'YXZ';
        camera.rotation.set(pitch, yaw, 0);
      } else {
        // Shoulder-follow spring arm that shortens before hitting walls.
        const view: Vec3 = [
          -Math.sin(yaw) * Math.cos(pitch),
          Math.sin(pitch),
          -Math.cos(yaw) * Math.cos(pitch),
        ];
        const back: Vec3 = [-view[0], -view[1], -view[2]];
        const pivot: Vec3 = [
          feet[0] + Math.cos(yaw) * SHOULDER,
          feet[1] + PIVOT_HEIGHT,
          feet[2] - Math.sin(yaw) * SHOULDER,
        ];
        const arm = cameraArmLength(
          s.R,
          s.world,
          pivot,
          back,
          ARM_LENGTH,
          s.player.collider,
        );
        camera.position.set(
          pivot[0] + back[0] * arm,
          pivot[1] + back[1] * arm,
          pivot[2] + back[2] * arm,
        );
        camera.lookAt(
          pivot[0] + view[0],
          pivot[1] + view[1],
          pivot[2] + view[2],
        );
      }
    }

    // Publish to React ~10 Hz; never per frame.
    publishTimer.current += delta;
    if (publishTimer.current >= 0.1) {
      publishTimer.current = 0;
      state.publish({
        position: feet,
        grounded: s.player.grounded,
        sprinting: sprint && (forward !== 0 || right !== 0),
      });
    }
  });

  // Capsule placeholder at the real player height (radius 0.3 m, 1.75 m tall).
  return (
    <mesh ref={capsule} name="player-capsule">
      <capsuleGeometry
        args={[
          DEFAULT_PLAYER.radius,
          DEFAULT_PLAYER.height - DEFAULT_PLAYER.radius * 2,
          6,
          12,
        ]}
      />
      <meshStandardMaterial color="#f0d58c" roughness={0.6} />
    </mesh>
  );
}
