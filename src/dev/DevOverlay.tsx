import { useState } from 'react';
import { useDebugStore } from '../state/debug-store';
import type { DebugToggle } from '../state/debug-store';
import { useMetricsStore } from './metrics-store';
import { usePlayerStore } from '../state/player-store';
import { useClockStore } from '../state/clock-store';
import { loadedCampus } from '../world/campus';

const TOGGLES: [DebugToggle, string][] = [
  ['confidenceColors', 'Confidence colors'],
  ['labels', 'Labels'],
  ['colliders', 'Collision shapes'],
];
const LEGEND: [string, string][] = [
  ['measured', '#7fd6ab'],
  ['traced', '#82bbec'],
  ['estimated', '#e5c373'],
  ['placeholder', '#ee6f6f'],
];

export default function DevOverlay() {
  const debug = useDebugStore();
  const metrics = useMetricsStore();
  const player = usePlayerStore();
  const gatesOpen = useClockStore((s) => s.gatesOpen);
  const openGates = Object.entries(gatesOpen)
    .filter(([, open]) => open)
    .map(([id]) => id);
  const [showCampusData, setShowCampusData] = useState(false);
  const { campus, warnings } = loadedCampus;

  return (
    <aside className="dev-overlay" aria-label="Development overlay">
      <h2>Development overlay</h2>
      <p>
        <a href="/dev/tracer" style={{ color: '#82bbec' }}>
          Open site-plan tracer
        </a>
      </p>
      {TOGGLES.map(([key, label]) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={debug[key]}
            onChange={(event) => debug.setToggle(key, event.target.checked)}
          />
          {label}
        </label>
      ))}
      {debug.confidenceColors && (
        <p className="confidence-legend">
          {LEGEND.map(([name, color]) => (
            <span key={name} style={{ color }}>
              ■ {name}{' '}
            </span>
          ))}
        </p>
      )}
      <dl>
        <dt>FPS</dt>
        <dd data-testid="fps">{metrics.fps}</dd>
        <dt>Draw calls</dt>
        <dd data-testid="draw-calls">{metrics.calls}</dd>
        <dt>Triangles</dt>
        <dd data-testid="triangles">{metrics.triangles}</dd>
      </dl>
      <p>Budget: 60 FPS · ≤400 calls · ≤1.5M triangles</p>
      <label>
        <input
          type="checkbox"
          checked={player.mode === 'free'}
          disabled={!player.ready}
          onChange={(event) =>
            player.setMode(event.target.checked ? 'free' : 'first')
          }
        />
        Free camera (orbit)
      </label>
      <dl aria-label="Player state">
        <dt>Camera</dt>
        <dd data-testid="player-mode">
          {player.ready ? player.mode : 'loading'}
        </dd>
        <dt>Position</dt>
        <dd>
          <span data-testid="player-x">{player.position[0].toFixed(2)}</span>,{' '}
          <span data-testid="player-y">{player.position[1].toFixed(2)}</span>,{' '}
          <span data-testid="player-z">{player.position[2].toFixed(2)}</span>
        </dd>
        <dt>Grounded</dt>
        <dd data-testid="player-grounded">{String(player.grounded)}</dd>
        <dt>Sprinting</dt>
        <dd data-testid="player-sprinting">{String(player.sprinting)}</dd>
        <dt>Open gates</dt>
        <dd data-testid="gates-open">
          {openGates.length ? openGates.join(', ') : 'none'}
        </dd>
      </dl>
      <label>
        <input
          type="checkbox"
          checked={showCampusData}
          onChange={(event) => setShowCampusData(event.target.checked)}
        />
        Campus data
      </label>
      {showCampusData && (
        <section aria-label="Campus data validation" className="campus-data">
          <p data-testid="campus-validation-status">
            Site plan loaded · {campus.buildings.length} blocks ·{' '}
            {campus.gates.length} gates · {campus.areas.length} areas ·{' '}
            {warnings.length} warnings
          </p>
          <p>Interior geometry and entrances are later milestones.</p>
          <details>
            <summary>Validation warnings</summary>
            <ul>
              {warnings.map((warning, index) => (
                <li key={index}>
                  {warning.path}: {warning.message}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </aside>
  );
}
