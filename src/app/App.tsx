import { lazy, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { CampusScene } from '../game/CampusScene';
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
        <h1>M3 · Exterior greybox</h1>
        <p>Drag to orbit · scroll to zoom · right-drag to pan</p>
      </header>
      <Canvas camera={camera} dpr={[1, 1.5]} aria-label="3D campus greybox">
        <CampusScene />
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
      <footer>
        Greybox from data/campus.json (M2 site plan). Not to final appearance;
        colors show data confidence. Map data © OpenStreetMap contributors;
        imagery-traced geometry: Esri World Imagery.
      </footer>
    </main>
  );
}
