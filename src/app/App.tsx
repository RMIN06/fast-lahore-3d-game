import { lazy, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { CampusScene } from '../game/CampusScene';
import { PlayerRig } from '../game/PlayerRig';
import { usePlayerStore } from '../state/player-store';
import { loadedCampus } from '../world/campus';
import { campusCamera } from '../systems/campus-geometry';

const DevOverlay = import.meta.env.DEV
  ? lazy(() => import('../dev/DevOverlay'))
  : null;
const MetricsSampler = import.meta.env.DEV
  ? lazy(() => import('../dev/MetricsSampler'))
  : null;
const Tracer = import.meta.env.DEV
  ? lazy(() => import('../dev/tracer/Tracer'))
  : null;

const camera = campusCamera(loadedCampus.campus);

export function App() {
  const mode = usePlayerStore((s) => s.mode);
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
        <h1>M4 · Player controller</h1>
        <p data-testid="controls-hint">
          {mode === 'free'
            ? 'Free camera: drag to orbit · scroll to zoom · right-drag to pan'
            : 'Click to look around · WASD move · Shift sprint · Space jump · V first/third person · Esc releases the mouse'}
        </p>
      </header>
      <Canvas camera={camera} dpr={[1, 1.5]} aria-label="3D campus greybox">
        <CampusScene />
        <PlayerRig />
        {MetricsSampler && (
          <Suspense fallback={null}>
            <MetricsSampler />
          </Suspense>
        )}
      </Canvas>
      {mode === 'first' && <div className="crosshair" aria-hidden />}
      {DevOverlay && (
        <Suspense fallback={null}>
          <DevOverlay />
        </Suspense>
      )}
      <footer>
        Greybox from data/campus.json (M2 site plan). Not to final appearance;
        colors show data confidence. Map data © OpenStreetMap contributors;
        imagery-traced geometry: Esri World Imagery.
      </footer>
    </main>
  );
}
