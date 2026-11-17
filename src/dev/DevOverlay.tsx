import { useState } from 'react';
import { useDebugStore } from '../state/debug-store';
import { useMetricsStore } from './metrics-store';
import { loadedCampus } from '../world/campus';

export default function DevOverlay() {
  const spinCube = useDebugStore((state) => state.spinCube);
  const setSpinCube = useDebugStore((state) => state.setSpinCube);
  const metrics = useMetricsStore();
  const [showCampusData, setShowCampusData] = useState(false);

  return (
    <aside className="dev-overlay" aria-label="Development overlay">
      <h2>Development overlay</h2>
      <p>
        <a href="/dev/tracer" style={{ color: '#82bbec' }}>
          Open site-plan tracer
        </a>
      </p>
      <label>
        <input
          type="checkbox"
          checked={spinCube}
          onChange={(event) => setSpinCube(event.target.checked)}
        />
        Spin cube
      </label>
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
          checked={showCampusData}
          onChange={(event) => setShowCampusData(event.target.checked)}
        />
        Campus data
      </label>
      {showCampusData && (
        <section aria-label="Campus data validation" className="campus-data">
          <p data-testid="campus-validation-status">
            Seed loaded · {loadedCampus.campus.buildings.length} blocks ·{' '}
            {loadedCampus.campus.gates.length} gates ·{' '}
            {loadedCampus.warnings.length} warnings
          </p>
          <p>Inventory only. Unresolved geometry is not rendered.</p>
          <details>
            <summary>Validation warnings</summary>
            <ul>
              {loadedCampus.warnings.map((warning, index) => (
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
