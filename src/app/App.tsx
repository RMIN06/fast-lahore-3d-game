import { lazy, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { ScaffoldScene } from '../game/ScaffoldScene';

const DevOverlay = import.meta.env.DEV
  ? lazy(() => import('../dev/DevOverlay'))
  : null;
const MetricsSampler = import.meta.env.DEV
  ? lazy(() => import('../dev/MetricsSampler'))
  : null;
const Tracer = import.meta.env.DEV
  ? lazy(() => import('../dev/tracer/Tracer'))
  : null;

export function App() {
  if (Tracer && window.location.pathname === '/dev/tracer')
    return (
      <Suspense fallback={<p>Loading tracer…</p>}>
        <Tracer />
      </Suspense>
    );
  return (
    <main>
      <header>
        <p>FAST LAHORE / DEVELOPMENT</p>
        <h1>M0 · Scene scaffold</h1>
        <p>Ground and spinning cube · technical test scene</p>
      </header>
      <Canvas
        camera={{ position: [6, 5, 8], fov: 50 }}
        dpr={[1, 1.5]}
        aria-label="3D scaffold scene"
      >
        <ScaffoldScene />
        {MetricsSampler && (
          <Suspense fallback={null}>
            <MetricsSampler />
          </Suspense>
        )}
      </Canvas>
      {DevOverlay && (
        <Suspense fallback={null}>
          <DevOverlay />
        </Suspense>
      )}
      <footer>Scaffold geometry only. No campus layout is represented.</footer>
    </main>
  );
}
