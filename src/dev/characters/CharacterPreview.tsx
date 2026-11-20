import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { CharacterRig, triangleCount } from '../../world/character-mesh';
import {
  ANIMATIONS,
  ACTION_SECONDS,
  gaits,
  locomotionPose,
  proportions,
  statePose,
} from '../../systems/character';
import type { AnimState, Body } from '../../systems/character';
import { DEFAULT_AVATAR } from '../../systems/save';
import type { Avatar } from '../../systems/save';

// Dev-only character preview (/dev/characters): both avatars, every required
// animation and each level of detail. Removed from production builds.

const AVATARS: Record<Body, Avatar> = {
  male: { ...DEFAULT_AVATAR, body: 'male' },
  female: {
    body: 'female',
    skinTone: '#d9a47c',
    hair: 'covered',
    outfitColor: '#2f7d5b',
  },
};
const SPEED = { walk: 1.6, run: 4.8 } as const;

function Character({
  body,
  x,
  anim,
  level,
  onFrame,
}: {
  body: Body;
  x: number;
  anim: AnimState;
  level: 0 | 1 | 2;
  onFrame: (body: Body, hipHeight: number) => void;
}) {
  const rig = useMemo(() => new CharacterRig(body, AVATARS[body]), [body]);
  const p = useMemo(() => proportions(body), [body]);
  const time = useRef(0);
  const phase = useRef(0);
  useEffect(() => () => rig.dispose(), [rig]);
  useEffect(() => {
    time.current = 0;
  }, [anim]);
  useEffect(() => {
    rig.lod.autoUpdate = false;
    rig.levels.forEach((m, i) => (m.visible = i === level));
  }, [rig, level]);
  useFrame((_, delta) => {
    time.current += delta;
    let pose;
    if (anim === 'walk' || anim === 'run') {
      const g = gaits(p)[anim];
      phase.current = (phase.current + (SPEED[anim] * delta) / g.stride) % 1;
      pose = locomotionPose(p, g, phase.current);
    } else {
      const loop =
        anim === 'kick' || anim === 'swing' ? ACTION_SECONDS[anim] + 0.4 : 4;
      pose = statePose(p, anim, time.current % loop);
    }
    rig.applyPose(pose);
    onFrame(body, pose.hipHeight);
  });
  // Face the preview camera (characters face -Z).
  return (
    <primitive
      object={rig.group}
      position={[x, 0, 0]}
      rotation={[0, Math.PI, 0]}
    />
  );
}

export default function CharacterPreview() {
  const [anim, setAnim] = useState<AnimState>('idle');
  const [level, setLevel] = useState<0 | 1 | 2>(0);
  const hips = useRef<Record<Body, number>>({ male: 0, female: 0 });
  const [hipText, setHipText] = useState('');
  const counts = useMemo(() => {
    const out: Record<Body, number[]> = { male: [], female: [] };
    for (const body of ['male', 'female'] as const) {
      const rig = new CharacterRig(body, AVATARS[body]);
      out[body] = rig.levels.map((m) => triangleCount(m.geometry));
      rig.dispose();
    }
    return out;
  }, []);
  useEffect(() => {
    const t = window.setInterval(
      () =>
        setHipText(
          `${hips.current.male.toFixed(3)} / ${hips.current.female.toFixed(3)}`,
        ),
      200,
    );
    return () => window.clearInterval(t);
  }, []);
  const record = (body: Body, h: number) => {
    hips.current[body] = h;
  };
  return (
    <main className="character-preview">
      <header>
        <p>FAST LAHORE / DEVELOPMENT</p>
        <h1>Characters (M8)</h1>
        <p>
          Procedural placeholder characters (own work) until owner models
          arrive. <a href="/">Back to the game</a>
        </p>
      </header>
      <Canvas camera={{ position: [0, 1.4, 4.2], fov: 45 }} shadows>
        <color attach="background" args={['#18232a']} />
        <hemisphereLight args={['#e4f1ff', '#3d4a3a', 1.6]} />
        <directionalLight position={[3, 6, 4]} intensity={2.2} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[12, 12]} />
          <meshStandardMaterial color="#5d6b62" />
        </mesh>
        <Character
          body="male"
          x={-0.8}
          anim={anim}
          level={level}
          onFrame={record}
        />
        <Character
          body="female"
          x={0.8}
          anim={anim}
          level={level}
          onFrame={record}
        />
        <OrbitControls target={[0, 0.9, 0]} />
      </Canvas>
      <aside className="dev-overlay" aria-label="Character controls">
        <h2>Animation</h2>
        <div className="dev-actions" role="group" aria-label="Animations">
          {ANIMATIONS.map((a) => (
            <button
              key={a}
              aria-pressed={anim === a}
              onClick={() => setAnim(a)}
            >
              {a}
            </button>
          ))}
        </div>
        <p data-testid="preview-animation">{anim}</p>
        <h2>Level of detail</h2>
        <div className="dev-actions" role="group" aria-label="Levels of detail">
          {([0, 1, 2] as const).map((l) => (
            <button
              key={l}
              aria-pressed={level === l}
              onClick={() => setLevel(l)}
            >
              LOD{l}
            </button>
          ))}
        </div>
        <dl>
          <dt>Male triangles</dt>
          <dd data-testid="tris-male">{counts.male[level]}</dd>
          <dt>Female triangles</dt>
          <dd data-testid="tris-female">{counts.female[level]}</dd>
          <dt>Hip height m / f</dt>
          <dd data-testid="hip-heights">{hipText}</dd>
        </dl>
      </aside>
    </main>
  );
}
