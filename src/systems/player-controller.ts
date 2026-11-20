import type RAPIER from '@dimforge/rapier3d-compat';
import type { Rapier, World } from './physics';

// Kinematic capsule player (M4). Rapier's character controller sweeps the
// capsule through the world, so fast movement cannot tunnel through walls.

export interface PlayerConfig {
  radius: number;
  /** Total capsule height (m). */
  height: number;
  /** First-person eye height above the feet (m). */
  eyeHeight: number;
  walkSpeed: number;
  sprintSpeed: number;
  jumpSpeed: number;
  gravity: number;
  stepHeight: number;
  stepMinWidth: number;
  maxSlopeDeg: number;
  snapDistance: number;
}

// Eye height from GAMEPLAY_SPEC §3 (male default; female 1.58 arrives with M6
// avatars). Speeds and jump are project decisions recorded in DECISIONS.md.
export const DEFAULT_PLAYER: PlayerConfig = {
  radius: 0.3,
  height: 1.75,
  eyeHeight: 1.65,
  walkSpeed: 1.6,
  sprintSpeed: 4.8,
  jumpSpeed: 3.6,
  gravity: 9.81,
  stepHeight: 0.3,
  stepMinWidth: 0.2,
  maxSlopeDeg: 40,
  // 0 disables Rapier's snap-to-ground: in rapier3d-compat 0.21 it makes a
  // resting capsule sink through a cuboid ground (reproduced in tests).
  snapDistance: 0,
};

export interface MoveInput {
  /** -1..1 forward/back and right/left in the camera's frame. */
  forward: number;
  right: number;
  sprint: boolean;
  jump: boolean;
  /** Camera yaw: rotation about +Y; 0 faces -Z (north). */
  yaw: number;
}

export type Vec3 = [number, number, number];

export class PlayerController {
  readonly config: PlayerConfig;
  readonly collider: RAPIER.Collider;
  private readonly body: RAPIER.RigidBody;
  private readonly controller: RAPIER.KinematicCharacterController;
  private verticalSpeed = 0;
  grounded = false;

  constructor(
    R: Rapier,
    private readonly world: World,
    feet: Vec3,
    config: PlayerConfig = DEFAULT_PLAYER,
  ) {
    this.config = config;
    const half = config.height / 2;
    this.body = world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(
        feet[0],
        feet[1] + half,
        feet[2],
      ),
    );
    this.collider = world.createCollider(
      R.ColliderDesc.capsule(half - config.radius, config.radius),
      this.body,
    );
    this.controller = world.createCharacterController(0.02);
    this.controller.enableAutostep(
      config.stepHeight,
      config.stepMinWidth,
      false,
    );
    this.controller.setMaxSlopeClimbAngle((config.maxSlopeDeg * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle(
      ((config.maxSlopeDeg + 5) * Math.PI) / 180,
    );
    if (config.snapDistance > 0)
      this.controller.enableSnapToGround(config.snapDistance);
    // Scene queries only see colliders after a step; without this the first
    // movement query finds no ground and the capsule falls through it.
    world.step();
  }

  /** Move instantly (spawn, continue, debug teleport); clears falling speed. */
  teleport(feet: Vec3): void {
    const p = {
      x: feet[0],
      y: feet[1] + this.config.height / 2,
      z: feet[2],
    };
    this.body.setTranslation(p, true);
    this.body.setNextKinematicTranslation(p);
    this.verticalSpeed = 0;
    this.grounded = false;
    this.world.step();
  }

  /** Feet position (bottom of the capsule). */
  feet(): Vec3 {
    const t = this.body.translation();
    return [t.x, t.y - this.config.height / 2, t.z];
  }

  /** Advance by `dt` seconds. Call with a fixed step (see FixedStepper). */
  step(dt: number, input: MoveInput): void {
    const c = this.config;
    const length = Math.hypot(input.forward, input.right);
    const speed = input.sprint ? c.sprintSpeed : c.walkSpeed;
    const f = length > 0 ? input.forward / length : 0,
      r = length > 0 ? input.right / length : 0;
    const sin = Math.sin(input.yaw),
      cos = Math.cos(input.yaw);
    // forward = (-sin, 0, -cos), right = (cos, 0, -sin) for a yaw about +Y.
    const dx = (-sin * f + cos * r) * speed * dt;
    const dz = (-cos * f - sin * r) * speed * dt;

    // Upward speed from a jump must survive the first airborne step, during
    // which Rapier may still report the capsule as grounded.
    if (this.grounded && input.jump && this.verticalSpeed <= 0)
      this.verticalSpeed = c.jumpSpeed;
    this.verticalSpeed -= c.gravity * dt;

    this.controller.computeColliderMovement(this.collider, {
      x: dx,
      y: this.verticalSpeed * dt,
      z: dz,
    });
    const move = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    if (this.grounded && this.verticalSpeed < 0) this.verticalSpeed = 0;
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: t.x + move.x,
      y: t.y + move.y,
      z: t.z + move.z,
    });
    this.world.timestep = dt;
    this.world.step();
  }
}

/** Fixed-timestep accumulator so physics never depends on frame rate. */
export class FixedStepper {
  private accumulator = 0;
  constructor(
    readonly dt = 1 / 60,
    private readonly maxSteps = 5,
  ) {}

  /** Returns how many fixed steps to run for this frame's elapsed time. */
  advance(elapsed: number): number {
    this.accumulator = Math.min(
      this.accumulator + elapsed,
      this.dt * this.maxSteps,
    );
    const steps = Math.floor(this.accumulator / this.dt);
    this.accumulator -= steps * this.dt;
    return steps;
  }
}

/**
 * Collision-aware third-person arm: distance (m) the camera can sit behind the
 * pivot before hitting world geometry, minus a small margin.
 */
export function cameraArmLength(
  R: Rapier,
  world: World,
  pivot: Vec3,
  back: Vec3,
  maxLength: number,
  exclude: RAPIER.Collider,
  margin = 0.25,
): number {
  const ray = new R.Ray(
    { x: pivot[0], y: pivot[1], z: pivot[2] },
    { x: back[0], y: back[1], z: back[2] },
  );
  const hit = world.castRay(
    ray,
    maxLength,
    true,
    undefined,
    undefined,
    exclude,
  );
  return hit ? Math.max(0.3, hit.timeOfImpact - margin) : maxLength;
}

/** Capsule and eye heights per avatar body (GAMEPLAY_SPEC §3: eyes 1.65 m / 1.58 m). */
export function playerConfigFor(body: 'male' | 'female'): PlayerConfig {
  const eyeHeight = body === 'female' ? 1.58 : 1.65;
  return { ...DEFAULT_PLAYER, eyeHeight, height: eyeHeight + 0.1 };
}
