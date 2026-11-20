import { lazy, Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { CampusScene } from '../game/CampusScene';
import { PlayerRig } from '../game/PlayerRig';
import { Environment } from '../game/Environment';
import { Interiors } from '../game/Interiors';
import { EntryFade } from '../ui/EntryFade';
import { Hud } from '../ui/Hud';
import { TimePanel } from '../ui/TimePanel';
import { Overlays } from '../ui/Overlays';
import { TitleScreen } from '../ui/TitleScreen';
import { RegisterScreen } from '../ui/RegisterScreen';
import { usePlayerStore } from '../state/player-store';
import { useAppStore } from '../state/app-store';
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
const CharacterPreview = import.meta.env.DEV
  ? lazy(() => import('../dev/characters/CharacterPreview'))
  : null;

const camera = campusCamera(loadedCampus.campus);
const AUTOSAVE_SECONDS = 60;

/** The 3D game with HUD and overlays; remounted for each new game/continue. */
function GameScreen() {
  const mode = usePlayerStore((s) => s.mode);
  const overlay = useAppStore((s) => s.overlay);

  // Autosave every minute and whenever the page is hidden or closed.
  useEffect(() => {
    const save = () => useAppStore.getState().saveNow();
    const timer = window.setInterval(save, AUTOSAVE_SECONDS * 1000);
    const hidden = () => {
      if (document.visibilityState === 'hidden') save();
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', save);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', save);
    };
  }, []);

  return (
    <main>
      <header>
        <p>FAST LAHORE / DEVELOPMENT</p>
        <h1>M8 · Characters</h1>
        <p data-testid="controls-hint">
          {mode === 'free'
            ? 'Free camera: drag to orbit · scroll to zoom · right-drag to pan'
            : 'Click to look around · WASD move · Shift sprint · Space jump · V camera · T time · P phone · M map · Esc pause'}
        </p>
      </header>
      <Canvas
        camera={camera}
        dpr={[1, 1.5]}
        aria-label="3D campus greybox"
        shadows
      >
        <Environment />
        <CampusScene />
        <Interiors />
        <PlayerRig />
        {MetricsSampler && (
          <Suspense fallback={null}>
            <MetricsSampler />
          </Suspense>
        )}
      </Canvas>
      {mode === 'first' && !overlay && (
        <div className="crosshair" aria-hidden />
      )}
      <EntryFade />
      <Hud />
      <TimePanel />
      <Overlays />
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

export function App() {
  const screen = useAppStore((s) => s.screen);
  const session = useAppStore((s) => s.session);
  if (Tracer && window.location.pathname === '/dev/tracer')
    return (
      <Suspense fallback={<p>Loading tracer…</p>}>
        <Tracer />
      </Suspense>
    );
  if (CharacterPreview && window.location.pathname === '/dev/characters')
    return (
      <Suspense fallback={<p>Loading characters…</p>}>
        <CharacterPreview />
      </Suspense>
    );
  if (screen === 'title') return <TitleScreen />;
  if (screen === 'register') return <RegisterScreen />;
  return <GameScreen key={session} />;
}
