import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import { useDebugStore } from '../state/debug-store';

// Technical test geometry, not campus buildings or world coordinates.
export function ScaffoldScene() {
  const cube = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (cube.current && useDebugStore.getState().spinCube) {
      cube.current.rotation.y += delta * 0.7;
      cube.current.rotation.x += delta * 0.25;
    }
  });

  return (
    <>
      <color attach="background" args={['#111a20']} />
      <hemisphereLight args={['#d9efff', '#394339', 2]} />
      <directionalLight position={[4, 8, 3]} intensity={2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[30, 30]} />
        <meshStandardMaterial color="#465b52" roughness={1} />
      </mesh>
      <mesh ref={cube} position={[0, 1.7, 0]}>
        <boxGeometry args={[1.5, 1.5, 1.5]} />
        <meshStandardMaterial
          color="#dba65b"
          roughness={0.4}
          metalness={0.15}
        />
      </mesh>
    </>
  );
}
