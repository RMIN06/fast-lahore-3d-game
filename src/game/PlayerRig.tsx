import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { PerspectiveCamera } from 'three';
import { CharacterRig } from '../world/character-mesh';
import { CharacterAnimator, proportions } from '../systems/character';
import type RAPIER from '@dimforge/rapier3d-compat';
import { loadedCampus } from '../world/campus';
import {
  campusBounds,
  campusCamera,
  gateSpawn,
} from '../systems/campus-geometry';
import { campusPhysics } from '../world/interiors';
import { createPhysicsWorld, initRapier } from '../systems/physics';
import type { Rapier, World } from '../systems/physics';
import {
  cameraArmLength,
  FixedStepper,
  PlayerController,
  playerConfigFor,
} from '../systems/player-controller';
import type { Vec3 } from '../systems/player-controller';
import { InputState } from '../systems/input-map';
import { DEFAULT_AVATAR } from '../systems/save';
import { toggledMode, usePlayerStore } from '../state/player-store';
import { useClockStore, gameClock } from '../state/clock-store';
import { useAppStore } from '../state/app-store';
import type { Overlay } from '../state/app-store';
import { actorPoses, taskData, useTaskStore } from '../state/task-store';
import {
  ambientLine,
  FOCUS_HEIGHT,
  pickFocus,
  VERB,
} from '../systems/interaction';
import type { Interactable } from '../systems/interaction';
import { SEATING } from '../systems/fixtures';
import type { Fixture } from '../systems/fixtures';
import { npcFeet } from '../state/npc-store';

// Player: Rapier kinematic capsule, pointer-lock mouse look, first/third
// person (V), overlays (Esc pause, T time, P phone, M map). Logic lives in
// src/systems; this component only wires it up.

const LOOK_SPEED = 0.0022;
const MAX_PITCH = 1.45;
const ARM_LENGTH = 3.5;
const SHOULDER = 0.35;
const FOV = { first: 75, third: 65 } as const;
/** Overlays that pause game time while open. */
const PAUSING: Overlay[] = ['pause', 'settings'];

interface Sim {
  R: Rapier;
  world: World;
  player: PlayerController;
  colliders: Map<string, RAPIER.Collider>;
}

/** Release the mouse, remembering it was us (so it does not open the pause menu). */
const releasePointer = (intentional: { current: boolean }) => {
  if (document.pointerLockElement) {
    intentional.current = true;
    void document.exitPointerLock();
  }
};

const applyGates = (
  colliders: Map<string, RAPIER.Collider>,
  open: Record<string, boolean>,
) => {
  for (const [id, isOpen] of Object.entries(open))
    colliders.get(`gate:${id}`)?.setEnabled(!isOpen);
};

/** Interactables near the feet: fixtures and task actors (M10). */
function findFocus(s: Sim, feet: Vec3, yaw: number): Interactable | undefined {
  const { fixtures } = taskData();
  // A desk or bench someone is using belongs to them: talk to the person.
  const taken = useTaskStore.getState().engine.occupied();
  const near: Interactable[] = [];
  for (const f of fixtures) {
    if (taken.has(f.id)) continue;
    if (
      Math.abs(f.position[0] - feet[0]) > 3 ||
      Math.abs(f.position[2] - feet[2]) > 3
    )
      continue;
    near.push({
      id: f.id,
      type: 'fixture',
      position: f.position,
      height: FOCUS_HEIGHT[f.kind],
      label: f.label,
      verb: VERB[f.kind],
      fixture: f,
    });
  }
  for (const a of actorPoses(useTaskStore.getState().engine))
    near.push({
      id: a.id,
      type: 'actor',
      // Slightly closer than the bench or lectern they are at, so they win.
      position: a.position,
      height: a.sitting ? 1 : 1.5,
      label: a.name,
      verb: 'Talk',
    });
  const eye = { x: feet[0], y: feet[1] + 1.5, z: feet[2] };
  return pickFocus(feet, yaw, near, (c) => {
    const to = {
      x: c.position[0] - eye.x,
      y: c.position[1] + c.height - eye.y,
      z: c.position[2] - eye.z,
    };
    const d = Math.hypot(to.x, to.y, to.z);
    if (d < 0.3) return false;
    const ray = new s.R.Ray(eye, { x: to.x / d, y: to.y / d, z: to.z / d });
    const hit = s.world.castRay(
      ray,
      d,
      true,
      undefined,
      undefined,
      s.player.collider,
    );
    // A wall in between (a shut door being looked at is the target itself).
    return Boolean(hit && hit.timeOfImpact < d - 0.35);
  });
}

export function PlayerRig() {
  const { camera, gl } = useThree();
  const sim = useRef<Sim>();
  const input = useMemo(() => new InputState(), []);
  // Up to 10 catch-up steps keeps the simulation real-time down to ~6 FPS.
  const stepper = useMemo(() => new FixedStepper(1 / 60, 10), []);
  const look = useRef({ yaw: 0, pitch: 0 });
  const bodyYaw = useRef(0);
  const lastFeet = useRef<Vec3>();
  const publishTimer = useRef(0);
  const intentionalUnlock = useRef(false);
  const focusTimer = useRef(0);
  const pausedBefore = useRef<boolean>();
  const mode = usePlayerStore((s) => s.mode);
  const overlay = useAppStore((s) => s.overlay);
  const avatar = useAppStore((s) => s.profile?.avatar ?? DEFAULT_AVATAR);
  // M8 procedural character (replaces the capsule) and its animator.
  const character = useMemo(
    () => new CharacterRig(avatar.body, avatar),
    [avatar],
  );
  const animator = useMemo(
    () => new CharacterAnimator(proportions(avatar.body)),
    [avatar.body],
  );
  useEffect(() => () => character.dispose(), [character]);
  const config = useMemo(() => playerConfigFor(avatar.body), [avatar.body]);
  const gatesOpen = useClockStore((s) => s.gatesOpen);

  // Scheduled gates (e.g. Masjid-side at Jummah) stop blocking while open.
  useEffect(() => {
    if (sim.current) applyGates(sim.current.colliders, gatesOpen);
  }, [gatesOpen]);

  // Overlays take the mouse and switch input to the menu layer; the pause
  // menu and settings also pause game time, restoring it afterwards.
  useEffect(() => {
    input.setContext(
      overlay === 'dialogue' ? 'dialogue' : overlay ? 'menu' : 'explore',
    );
    if (overlay) releasePointer(intentionalUnlock);
    const clock = useClockStore.getState();
    if (PAUSING.includes(overlay)) {
      pausedBefore.current ??= gameClock.paused;
      clock.setPaused(true);
    } else if (pausedBefore.current !== undefined) {
      clock.setPaused(pausedBefore.current);
      pausedBefore.current = undefined;
    }
  }, [input, overlay]);

  // Build the physics world from campus data once Rapier's WASM is loaded.
  useEffect(() => {
    let disposed = false;
    const { campus } = loadedCampus;
    void initRapier().then((R) => {
      if (disposed) return;
      const bounds = campusBounds(campus);
      const colliders = new Map<string, RAPIER.Collider>();
      // Buildings, walls, gates and walkable interiors (M7) with basement holes.
      const physics = campusPhysics(campus);
      const world = createPhysicsWorld(
        R,
        physics.colliders,
        {
          groundCenter: bounds.center,
          groundHalfSize: bounds.size,
          groundHoles: physics.groundHoles,
        },
        colliders,
      );
      // Department spawn or saved position from the app; Gate-5 as a fallback.
      const fallback = gateSpawn(campus);
      const spawn = useAppStore.getState().spawn ?? {
        position: [fallback.position[0], 0, fallback.position[1]] as Vec3,
        yaw: fallback.yaw,
      };
      const player = new PlayerController(R, world, spawn.position, config);
      look.current = { yaw: spawn.yaw, pitch: 0 };
      sim.current = { R, world, player, colliders };
      applyGates(colliders, useClockStore.getState().gatesOpen);
      usePlayerStore.getState().setReady(true);
    });
    return () => {
      disposed = true;
      sim.current?.world.free();
      sim.current = undefined;
      usePlayerStore.getState().setReady(false);
    };
  }, [config]);

  // Keyboard through the layered input map; mouse look under pointer lock.
  useEffect(() => {
    const canvas = gl.domElement;
    // Ignore keys only while typing into a text-like field; a focused
    // checkbox or button must not swallow game controls.
    const typing = (event: Event) => {
      const target = event.target;
      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
        return true;
      return (
        target instanceof HTMLInputElement &&
        !['checkbox', 'radio', 'button', 'submit', 'range'].includes(
          target.type,
        )
      );
    };
    const down = (event: KeyboardEvent) => {
      if (typing(event)) return;
      const action = input.down(event.code);
      if (action && action !== 'pause') event.preventDefault();
    };
    const up = (event: KeyboardEvent) => input.up(event.code);
    const blur = () => input.clear();
    const click = () => {
      if (
        usePlayerStore.getState().mode !== 'free' &&
        !useAppStore.getState().overlay
      )
        void canvas.requestPointerLock?.();
    };
    // Losing the mouse lock (e.g. the browser's own Esc) opens the pause menu.
    const lockChange = () => {
      if (document.pointerLockElement) return;
      if (intentionalUnlock.current) {
        intentionalUnlock.current = false;
        return;
      }
      const app = useAppStore.getState();
      if (!app.overlay && usePlayerStore.getState().mode !== 'free')
        app.setOverlay('pause');
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
    document.addEventListener('pointerlockchange', lockChange);
    document.addEventListener('mousemove', move);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      canvas.removeEventListener('click', click);
      document.removeEventListener('pointerlockchange', lockChange);
      document.removeEventListener('mousemove', move);
      input.clear();
      if (document.pointerLockElement) void document.exitPointerLock();
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
      releasePointer(intentionalUnlock);
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
    const app = useAppStore.getState();
    const toggle = (o: Overlay) => app.setOverlay(app.overlay === o ? null : o);
    const tasks = useTaskStore.getState();
    // Esc in a conversation is handled by the dialogue box (walk away).
    if (input.consume('pause')) {
      if (app.overlay !== 'dialogue')
        app.setOverlay(app.overlay ? null : 'pause');
    } else if (input.consume('timePanel')) toggle('time');
    else if (input.consume('phone')) toggle('phone');
    else if (input.consume('map')) toggle('map');
    if (input.consume('toggleCamera')) state.setMode(toggledMode(state.mode));
    if (state.teleport) {
      if (tasks.seated) tasks.setSeated(undefined);
      s.player.teleport(state.teleport.position);
      look.current = { yaw: state.teleport.yaw, pitch: 0 };
      state.requestTeleport(undefined);
    }
    const current = state.mode;

    const steps = stepper.advance(Math.min(delta, 0.25));
    // Keep a jump press pending until a physics step actually runs.
    let jump = steps > 0 && input.consume('jump');
    const { forward, right } = input.axes();
    const sprint = input.isHeld('sprint');
    // Seated: any movement key (or jump) stands up; otherwise stay put.
    if (tasks.seated && (forward !== 0 || right !== 0 || jump)) {
      tasks.setSeated(undefined);
      jump = false;
    }
    if (current !== 'free' && !useTaskStore.getState().seated)
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
    // Animate from the distance actually moved (feet stay planted at any
    // speed); turn the body toward its movement. Teleports are not motion.
    const prev = lastFeet.current ?? feet;
    const dx = feet[0] - prev[0],
      dz = feet[2] - prev[2];
    let moved = Math.hypot(dx, dz);
    if (moved > 2) moved = 0;
    lastFeet.current = feet;
    if (moved / Math.max(delta, 1e-3) > 0.3) {
      const target = Math.atan2(-dx, -dz);
      const diff = Math.atan2(
        Math.sin(target - bodyYaw.current),
        Math.cos(target - bodyYaw.current),
      );
      bodyYaw.current += diff * Math.min(1, delta * 12);
    } else if (current === 'first') bodyYaw.current = look.current.yaw;
    const seat = useTaskStore.getState().seated;
    if (seat) bodyYaw.current = seat.yaw;
    const action = seat ? 'sit' : state.animAction;
    if (action === 'kick' || action === 'swing') state.requestAction(undefined);
    const pose = animator.update({
      distance: moved,
      dt: Math.min(delta, 0.1),
      grounded: s.player.grounded,
      ...(action ? { action } : {}),
    });
    character.applyPose(pose);
    character.group.position.set(feet[0], feet[1], feet[2]);
    character.group.rotation.y = bodyYaw.current;
    // First person: hidden-body policy (no arms until real models).
    character.group.visible = current !== 'first';

    if (current !== 'free') {
      const { yaw, pitch } = look.current;
      camera.rotation.set(0, 0, 0);
      if (current === 'first') {
        camera.position.set(feet[0], feet[1] + config.eyeHeight, feet[2]);
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
          feet[1] + config.eyeHeight - 0.05,
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

    // M10 interaction: what is in front of the player, and E to use it.
    focusTimer.current += delta;
    if (focusTimer.current >= 0.1 && current !== 'free') {
      focusTimer.current = 0;
      tasks.setFocus(
        tasks.seated || app.overlay
          ? undefined
          : findFocus(s, feet, look.current.yaw),
      );
    }
    if (input.consume('interact') && current !== 'free') {
      const t = useTaskStore.getState();
      if (t.seated) t.setSeated(undefined);
      else if (t.focus) {
        const f = t.focus;
        if (f.type === 'actor') {
          if (!t.engine.talk(f.id)) t.notify(`${f.label}: Not now, please.`);
          t.bump();
        } else if (f.fixture!.kind === 'door') t.doors.toggle(f.id);
        else if (t.engine.use(f.fixture!)) t.bump();
        else if (SEATING.includes(f.fixture!.kind)) {
          const seatAt: Fixture = f.fixture!;
          s.player.teleport(seatAt.position);
          look.current = { yaw: seatAt.yaw, pitch: look.current.pitch };
          bodyYaw.current = seatAt.yaw;
          lastFeet.current = undefined;
          t.setSeated(seatAt);
        } else {
          const line = ambientLine(f.fixture!, loadedCampus.campus);
          if (line.dialogue) t.openDialogue(line.dialogue, f.label, {}, false);
          else t.notify(line.text);
        }
      }
    }
    // Doors: NPCs open them; shut doors enable their colliders.
    for (const id of tasks.doors.update(Math.min(delta, 0.1), npcFeet).changed)
      s.colliders.get(id)?.setEnabled(tasks.doors.blocking(id));

    // Publish to React ~10 Hz; never per frame.
    publishTimer.current += delta;
    if (publishTimer.current >= 0.1) {
      publishTimer.current = 0;
      state.publish({
        position: feet,
        yaw: look.current.yaw,
        grounded: s.player.grounded,
        sprinting: sprint && (forward !== 0 || right !== 0),
        animation: animator.state,
      });
    }
  });

  return <primitive object={character.group} name="player-body" />;
}
