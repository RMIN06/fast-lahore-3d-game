// M8 procedural characters: skeleton proportions, leg IK, gait and the
// animation state machine. Pure maths (no three.js) so it is unit tested.
//
// Conventions: character space +Y up, forward is -Z (camera yaw 0 faces -Z).
// Joint rotations are Euler XYZ in radians; positive X pitch swings a limb
// that hangs down toward the front (-Z).

export type Body = 'male' | 'female';
export type BoneName =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head'
  | 'upperArm_L'
  | 'foreArm_L'
  | 'hand_L'
  | 'upperArm_R'
  | 'foreArm_R'
  | 'hand_R'
  | 'thigh_L'
  | 'shin_L'
  | 'foot_L'
  | 'thigh_R'
  | 'shin_R'
  | 'foot_R';
export type AnimState =
  'idle' | 'walk' | 'run' | 'jump' | 'sit' | 'kick' | 'swing';
export const ANIMATIONS: AnimState[] = [
  'idle',
  'walk',
  'run',
  'jump',
  'sit',
  'kick',
  'swing',
];

export interface Proportions {
  height: number;
  eyeHeight: number;
  thigh: number;
  shin: number;
  /** Ankle above the ground when standing. */
  ankle: number;
  hipHalfWidth: number;
  pelvis: number;
  spine: number;
  chest: number;
  neck: number;
  headRadius: number;
  shoulderHalfWidth: number;
  upperArm: number;
  foreArm: number;
  hand: number;
}

/** Body proportions from the avatar's total height (GAMEPLAY_SPEC §3 eyes). */
export function proportions(body: Body): Proportions {
  const eyeHeight = body === 'female' ? 1.58 : 1.65;
  const height = eyeHeight + 0.1;
  const legRatio = body === 'female' ? 0.48 : 0.47;
  const leg = height * legRatio; // hip joint to ankle
  const ankle = 0.07;
  const headRadius = height * 0.068;
  const neck = height * 0.05;
  const pelvis = height * 0.05;
  // Remaining torso from hip joint to neck base.
  const torso = height - ankle - leg - neck - headRadius * 2;
  return {
    height,
    eyeHeight,
    thigh: leg * 0.52,
    shin: leg * 0.48,
    ankle,
    hipHalfWidth: height * (body === 'female' ? 0.062 : 0.056),
    pelvis,
    spine: (torso - pelvis) * 0.45,
    chest: (torso - pelvis) * 0.55,
    neck,
    headRadius,
    shoulderHalfWidth: height * (body === 'female' ? 0.1 : 0.115),
    upperArm: height * 0.17,
    foreArm: height * 0.15,
    hand: height * 0.055,
  };
}

/** Standing hip-joint height above the ground. */
export const standingHipHeight = (p: Proportions) => p.ankle + p.thigh + p.shin;

export type Euler = [number, number, number];
export interface Pose {
  /** Hip joint height above the ground. */
  hipHeight: number;
  /** Forward/back hip offset (m, +forward) — used by sit. */
  hipForward: number;
  rotations: Partial<Record<BoneName, Euler>>;
}

/** Two-bone leg IK in the sagittal plane. f = forward, d = down from the hip. */
export function legIK(p: Proportions, f: number, d: number) {
  const L1 = p.thigh,
    L2 = p.shin;
  const D = Math.min(Math.hypot(f, d), (L1 + L2) * 0.9995);
  const toTarget = Math.atan2(f, d);
  const alpha = Math.acos(
    Math.max(-1, Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))),
  );
  const beta = Math.acos(
    Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2))),
  );
  const thigh = toTarget + alpha;
  const knee = -(Math.PI - beta);
  return { thigh, knee, foot: -(thigh + knee) };
}

/** Forward kinematics of one leg: ankle (forward, height) given hip state. */
export function ankleFK(
  p: Proportions,
  hipHeight: number,
  hipForward: number,
  thigh: number,
  knee: number,
): [number, number] {
  const kneeF = hipForward + p.thigh * Math.sin(thigh);
  const kneeY = hipHeight - p.thigh * Math.cos(thigh);
  return [
    kneeF + p.shin * Math.sin(thigh + knee),
    kneeY - p.shin * Math.cos(thigh + knee),
  ];
}

export interface Gait {
  /** Distance (m) covered by one full two-step cycle. */
  stride: number;
  /** Fraction of the cycle each foot is on the ground. */
  duty: number;
  hipHeight: number;
  lift: number;
  bounce: number;
  armSwing: number;
  elbow: number;
  lean: number;
}

/** Walk and run gaits sized so the feet stay planted within leg reach. */
export function gaits(p: Proportions): Record<'walk' | 'run', Gait> {
  const reach = (p.thigh + p.shin) * 0.995;
  // Highest hip height (incl. bounce) at which a planted foot stays in reach.
  const fit = (
    stride: number,
    duty: number,
    wanted: number,
    bounce: number,
  ) => {
    const half = (stride * duty) / 2;
    return (
      Math.min(wanted, p.ankle + Math.sqrt(reach * reach - half * half)) -
      bounce
    );
  };
  const walkStride = p.height * 0.72;
  const runStride = p.height * 1.5;
  return {
    walk: {
      stride: walkStride,
      duty: 0.6,
      hipHeight: fit(walkStride, 0.6, standingHipHeight(p) - 0.02, 0.02),
      lift: 0.09,
      bounce: 0.02,
      armSwing: 0.4,
      elbow: -0.25,
      lean: 0.05,
    },
    run: {
      stride: runStride,
      duty: 0.36,
      hipHeight: fit(runStride, 0.36, standingHipHeight(p) - 0.08, 0.04),
      lift: 0.24,
      bounce: 0.04,
      armSwing: 0.85,
      elbow: -1.25,
      lean: 0.2,
    },
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (x: number) => x - Math.floor(x);

/**
 * Foot target relative to the hip for one leg at cycle phase `phase`
 * (0..1, stance first). During stance the foot moves backward exactly as far
 * as the body moves forward, so it stays fixed on the ground.
 */
export function footTarget(
  g: Gait,
  phase: number,
): { f: number; lift: number } {
  const half = (g.stride * g.duty) / 2;
  if (phase < g.duty) return { f: half - (2 * half * phase) / g.duty, lift: 0 };
  // Swing: cubic Hermite whose end slopes match the stance motion, so the
  // foot's ground speed is zero at lift-off and at touchdown (no skid).
  const w = (phase - g.duty) / (1 - g.duty);
  const m = (-2 * half * (1 - g.duty)) / g.duty;
  const w2 = w * w,
    w3 = w2 * w;
  const f =
    (2 * w3 - 3 * w2 + 1) * -half +
    (w3 - 2 * w2 + w) * m +
    (-2 * w3 + 3 * w2) * half +
    (w3 - w2) * m;
  return { f, lift: g.lift * Math.sin(Math.PI * w) };
}

/** Locomotion pose for a gait at cycle phase (left leg leads at phase 0). */
export function locomotionPose(p: Proportions, g: Gait, phase: number): Pose {
  // Hips dip at each mid-stance (twice per cycle).
  const hipHeight = g.hipHeight - g.bounce * Math.cos(4 * Math.PI * phase);
  const rotations: Pose['rotations'] = {};
  (['L', 'R'] as const).forEach((side, i) => {
    const target = footTarget(g, wrap(phase + i * 0.5));
    const ik = legIK(p, target.f, hipHeight - p.ankle - target.lift);
    rotations[`thigh_${side}`] = [ik.thigh, 0, 0];
    rotations[`shin_${side}`] = [ik.knee, 0, 0];
    rotations[`foot_${side}`] = [ik.foot, 0, 0];
  });
  // Arms swing opposite to the legs.
  const swing = Math.sin(2 * Math.PI * phase) * g.armSwing;
  rotations.upperArm_L = [-swing, 0, -0.08];
  rotations.upperArm_R = [swing, 0, 0.08];
  rotations.foreArm_L = [g.elbow * -1, 0, 0];
  rotations.foreArm_R = [g.elbow * -1, 0, 0];
  rotations.spine = [g.lean, Math.sin(2 * Math.PI * phase) * 0.06, 0];
  rotations.chest = [0, -Math.sin(2 * Math.PI * phase) * 0.08, 0];
  return { hipHeight, hipForward: 0, rotations };
}

/** Non-locomotion poses; `t` is seconds since the state began. */
export function statePose(p: Proportions, state: AnimState, t: number): Pose {
  const stand = standingHipHeight(p);
  const legs = (
    f: number,
    d: number,
    side: 'L' | 'R',
    r: Pose['rotations'],
  ) => {
    const ik = legIK(p, f, d);
    r[`thigh_${side}`] = [ik.thigh, 0, 0];
    r[`shin_${side}`] = [ik.knee, 0, 0];
    r[`foot_${side}`] = [ik.foot, 0, 0];
  };
  const r: Pose['rotations'] = {};
  switch (state) {
    case 'idle': {
      const breathe = Math.sin(t * 2 * Math.PI * 0.25);
      legs(0, stand - p.ankle - 0.004, 'L', r);
      legs(0, stand - p.ankle - 0.004, 'R', r);
      r.chest = [breathe * 0.025, 0, 0];
      r.upperArm_L = [0.03 * breathe, 0, -0.1];
      r.upperArm_R = [0.03 * breathe, 0, 0.1];
      r.foreArm_L = [0.15, 0, 0];
      r.foreArm_R = [0.15, 0, 0];
      return { hipHeight: stand - 0.004, hipForward: 0, rotations: r };
    }
    case 'jump': {
      // Crouch, launch, tuck, extend — over ~0.8 s, then hold the tuck.
      const k = Math.min(t / 0.8, 1);
      const tuck = Math.sin(Math.PI * Math.min(k * 1.2, 1)) * 0.35;
      legs(0.12, stand - p.ankle - tuck, 'L', r);
      legs(-0.05, stand - p.ankle - tuck * 0.8, 'R', r);
      r.upperArm_L = [-2.4 * k, 0, -0.3];
      r.upperArm_R = [-2.4 * k, 0, 0.3];
      r.foreArm_L = [0.4, 0, 0];
      r.foreArm_R = [0.4, 0, 0];
      r.spine = [0.1, 0, 0];
      return { hipHeight: stand, hipForward: 0, rotations: r };
    }
    case 'sit': {
      // Seat height ~0.46 m: thighs horizontal, shins vertical.
      const seat = 0.46;
      const k = smooth(Math.min(t / 0.5, 1));
      const hipHeight = stand + (seat - stand) * k;
      const thigh = (Math.PI / 2) * k;
      r.thigh_L = [thigh, 0, 0.04];
      r.thigh_R = [thigh, 0, -0.04];
      r.shin_L = [-thigh, 0, 0];
      r.shin_R = [-thigh, 0, 0];
      r.foot_L = [0, 0, 0];
      r.foot_R = [0, 0, 0];
      r.spine = [-0.05 * k, 0, 0];
      r.upperArm_L = [0.5 * k, 0, -0.1];
      r.upperArm_R = [0.5 * k, 0, 0.1];
      r.foreArm_L = [0.9 * k, 0, 0];
      r.foreArm_R = [0.9 * k, 0, 0];
      return { hipHeight, hipForward: 0, rotations: r };
    }
    case 'kick': {
      // Right-leg kick over KICK_SECONDS; the left foot stays planted.
      const k = Math.min(t / ACTION_SECONDS.kick, 1);
      const wind = Math.sin(Math.PI * Math.min(k / 0.35, 1));
      const strike = k < 0.35 ? 0 : Math.sin((Math.PI * (k - 0.35)) / 0.65);
      const hipHeight = stand - 0.03;
      legs(0, hipHeight - p.ankle, 'L', r);
      r.thigh_R = [-0.5 * wind + 1.5 * strike, 0, 0];
      r.shin_R = [-1.2 * wind - 0.2 * strike, 0, 0];
      r.foot_R = [0.3, 0, 0];
      r.upperArm_L = [0.7 * strike, 0, -0.5];
      r.upperArm_R = [-0.5 * strike, 0, 0.5];
      r.spine = [-0.2 * strike, 0, 0];
      return { hipHeight, hipForward: 0, rotations: r };
    }
    case 'swing': {
      // Two-handed swing (bat/racket): wind up to the right, sweep left.
      const k = Math.min(t / ACTION_SECONDS.swing, 1);
      const turn =
        k < 0.4 ? -0.9 * smooth(k / 0.4) : -0.9 + 2.0 * smooth((k - 0.4) / 0.6);
      const hipHeight = stand - 0.06;
      legs(0.12, hipHeight - p.ankle, 'L', r);
      legs(-0.12, hipHeight - p.ankle, 'R', r);
      r.spine = [0.15, turn * 0.5, 0];
      r.chest = [0, turn * 0.6, 0];
      r.upperArm_L = [-1.2, turn * 0.4, -0.3];
      r.upperArm_R = [-1.2, turn * 0.4, 0.3];
      r.foreArm_L = [-0.6, 0, 0];
      r.foreArm_R = [-0.6, 0, 0];
      return { hipHeight, hipForward: 0, rotations: r };
    }
    default: {
      const g = gaits(p)[state];
      return locomotionPose(p, g, wrap(t * 1.2));
    }
  }
}

export const ACTION_SECONDS = { kick: 0.7, swing: 0.8 } as const;
/** Speeds (m/s) where walking starts and running takes over. */
export const WALK_FROM = 0.25;
export const RUN_FROM = 3;

export interface AnimatorInput {
  /** Horizontal distance moved this step (m). */
  distance: number;
  dt: number;
  grounded: boolean;
  /** Requested action: sit holds while requested; kick/swing play once. */
  action?: 'sit' | 'kick' | 'swing';
}

const BLEND_SECONDS = 0.18;

const lerpPose = (a: Pose, b: Pose, k: number): Pose => {
  const rotations: Pose['rotations'] = {};
  const names = new Set([
    ...Object.keys(a.rotations),
    ...Object.keys(b.rotations),
  ]) as Set<BoneName>;
  for (const name of names) {
    const x = a.rotations[name] ?? [0, 0, 0],
      y = b.rotations[name] ?? [0, 0, 0];
    rotations[name] = [
      x[0] + (y[0] - x[0]) * k,
      x[1] + (y[1] - x[1]) * k,
      x[2] + (y[2] - x[2]) * k,
    ];
  }
  return {
    hipHeight: a.hipHeight + (b.hipHeight - a.hipHeight) * k,
    hipForward: a.hipForward + (b.hipForward - a.hipForward) * k,
    rotations,
  };
};

/**
 * Animation state machine (idle/walk/run/jump/sit/kick/swing) with short
 * cross-fades. Locomotion phase advances by distance travelled, so the
 * planted foot never slides whatever the speed.
 */
export class CharacterAnimator {
  state: AnimState = 'idle';
  private time = 0;
  private phase = 0;
  private from?: Pose;
  private blend = 1;
  private last: Pose;
  private speed = 0;
  private airborne = 0;
  readonly gait: Record<'walk' | 'run', Gait>;

  constructor(readonly body: Proportions) {
    this.gait = gaits(body);
    this.last = statePose(body, 'idle', 0);
  }

  private choose(input: AnimatorInput): AnimState {
    const speed = input.dt > 0 ? input.distance / input.dt : 0;
    this.speed += (speed - this.speed) * Math.min(1, input.dt * 10);
    this.airborne = input.grounded ? 0 : this.airborne + input.dt;
    if (this.state === 'kick' || this.state === 'swing') {
      if (this.time < ACTION_SECONDS[this.state]) return this.state;
    }
    if (input.action === 'kick' || input.action === 'swing')
      return input.action;
    if (input.action === 'sit') return 'sit';
    // Short drops (stairs, kerbs) do not count as a jump.
    if (this.airborne > 0.12) return 'jump';
    if (this.speed > RUN_FROM) return 'run';
    if (this.speed > WALK_FROM) return 'walk';
    return 'idle';
  }

  update(input: AnimatorInput): Pose {
    const next = this.choose(input);
    if (next !== this.state) {
      this.from = this.last;
      this.blend = 0;
      this.state = next;
      this.time = 0;
    }
    this.time += input.dt;
    this.blend = Math.min(1, this.blend + input.dt / BLEND_SECONDS);
    let pose: Pose;
    if (this.state === 'walk' || this.state === 'run') {
      this.phase = wrap(
        this.phase + input.distance / this.gait[this.state].stride,
      );
      pose = locomotionPose(this.body, this.gait[this.state], this.phase);
    } else pose = statePose(this.body, this.state, this.time);
    if (this.from && this.blend < 1)
      pose = lerpPose(this.from, pose, smooth(this.blend));
    this.last = pose;
    return pose;
  }
}
