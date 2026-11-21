import { useState } from 'react';
import { useDebugStore } from '../state/debug-store';
import type { DebugToggle } from '../state/debug-store';
import { useMetricsStore } from './metrics-store';
import { useNpcStore } from '../state/npc-store';
import { useTaskStore } from '../state/task-store';
import { taskTeleport } from './task-teleport';
import { usePlayerStore } from '../state/player-store';
import { useClockStore } from '../state/clock-store';
import { loadedCampus } from '../world/campus';
import { gateSpawn } from '../systems/campus-geometry';
import { interiorLayouts } from '../world/interiors';

const TOGGLES: [DebugToggle, string][] = [
  ['confidenceColors', 'Confidence colors'],
  ['labels', 'Labels'],
  ['colliders', 'Collision shapes'],
  ['navmesh', 'Navmesh'],
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
  const npcs = useNpcStore();
  const player = usePlayerStore();
  const gatesOpen = useClockStore((s) => s.gatesOpen);
  const openGates = Object.entries(gatesOpen)
    .filter(([, open]) => open)
    .map(([id]) => id);
  const [showCampusData, setShowCampusData] = useState(false);
  const [target, setTarget] = useState('gate:origin');
  const [taskTarget, setTaskTarget] = useState('');
  useTaskStore((s) => s.rev);
  const engine = useTaskStore((s) => s.engine);
  const focus = useTaskStore((s) => s.focus);
  const seated = useTaskStore((s) => s.seated);
  const hint = engine.hint();
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
      <label>
        Teleport
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          aria-label="Teleport target"
        >
          <option value="gate:origin">Inside Gate-5 (origin)</option>
          {interiorLayouts(loadedCampus.campus).flatMap((l) =>
            l.floors.flatMap((f) =>
              f.rooms.map((r) => (
                <option key={r.spaceId} value={`room:${r.spaceId}`}>
                  {r.spaceId}
                </option>
              )),
            ),
          )}
          {loadedCampus.campus.anchors.map((a) =>
            a.position ? (
              <option key={a.id} value={a.id}>
                {a.id}
              </option>
            ) : null,
          )}
        </select>
      </label>
      <button
        disabled={!player.ready || player.mode === 'free'}
        onClick={() => {
          const { campus } = loadedCampus;
          if (target === 'gate:origin') {
            const spawn = gateSpawn(campus);
            player.requestTeleport({
              position: [spawn.position[0], 0, spawn.position[1]],
              yaw: spawn.yaw,
            });
            return;
          }
          if (target.startsWith('room:')) {
            const room = interiorLayouts(campus)
              .flatMap((l) => l.floors.flatMap((f) => f.rooms))
              .find((r) => `room:${r.spaceId}` === target);
            if (room)
              player.requestTeleport({
                position: room.anchor,
                yaw: player.yaw,
              });
            return;
          }
          const anchor = campus.anchors.find((a) => a.id === target);
          if (anchor?.position)
            player.requestTeleport({
              position: anchor.position,
              yaw: (-(anchor.heading ?? 0) * Math.PI) / 180,
            });
        }}
      >
        Teleport
      </button>
      <div className="dev-actions" role="group" aria-label="Animation actions">
        <button
          aria-pressed={player.animAction === 'sit'}
          onClick={() =>
            player.requestAction(
              player.animAction === 'sit' ? undefined : 'sit',
            )
          }
        >
          Sit
        </button>
        <button onClick={() => player.requestAction('kick')}>Kick</button>
        <button onClick={() => player.requestAction('swing')}>Swing</button>
        <a href="/dev/characters" style={{ color: '#82bbec' }}>
          Characters
        </a>
      </div>
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
        <dt>Animation</dt>
        <dd data-testid="player-animation">{player.animation}</dd>
        <dt>NPCs</dt>
        <dd>
          <span data-testid="npc-status">{npcs.status}</span> · present{' '}
          <span data-testid="npc-present">{npcs.present}</span> · active{' '}
          <span data-testid="npc-active">{npcs.active}</span> · drawn{' '}
          <span data-testid="npc-rendered">{npcs.rendered}</span> · stuck{' '}
          <span data-testid="npc-stuck">{npcs.stuck}</span>
        </dd>
        <dt>Open gates</dt>
        <dd data-testid="gates-open">
          {openGates.length ? openGates.join(', ') : 'none'}
        </dd>
      </dl>
      <dl aria-label="Task state">
        <dt>Task</dt>
        <dd>
          <span data-testid="task-id">{engine.active?.task.id ?? 'none'}</span>{' '}
          step{' '}
          <span data-testid="task-step-index">
            {engine.active?.index ?? -1}
          </span>{' '}
          <span data-testid="task-step-kind">{engine.step?.kind ?? ''}</span>
        </dd>
        <dt>Targets</dt>
        <dd>
          <span data-testid="task-targets">
            {hint?.fixtures.slice(0, 4).join(' ')}
          </span>
          <span data-testid="task-places">
            {hint?.places.slice(0, 3).join(' ')}
          </span>
          <span data-testid="task-actor">{hint?.actor ?? ''}</span>
        </dd>
        <dt>Focus</dt>
        <dd>
          <span data-testid="focus-id">{focus?.id ?? ''}</span>
          {seated ? (
            <span data-testid="seated-id"> seated {seated.id}</span>
          ) : null}
        </dd>
        <dt>Last</dt>
        <dd data-testid="task-last">
          {engine.last ? `${engine.last.taskId}:${engine.last.result}` : ''}
        </dd>
        <dt>Done</dt>
        <dd data-testid="tasks-completed">{engine.completed.join(' ')}</dd>
      </dl>
      <label>
        Go to
        <input
          type="text"
          value={taskTarget}
          aria-label="Task target"
          placeholder="fixture:… actor:… space:… area:… gate:…"
          onChange={(event) => setTaskTarget(event.target.value)}
        />
      </label>
      <button
        disabled={!player.ready || player.mode === 'free'}
        onClick={() => {
          const to = taskTeleport(taskTarget.trim());
          if (to) player.requestTeleport(to);
        }}
      >
        Go
      </button>
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
