import { useMemo } from 'react';
import { loadedCampus } from '../world/campus';
import { campusBounds } from '../systems/campus-geometry';
import { centroid } from '../world/campus-meshes';
import { usePlayerStore } from '../state/player-store';
import type { Vec2 } from '../types/campus';

const AREA_FILL: Record<string, string> = {
  lawn: '#4d7a3f',
  ground: '#3f8a52',
  court: '#8f8d86',
  parking: '#4b4f53',
  path: '#a99a7f',
};
const points = (polygon: Vec2[]) => polygon.map((p) => p.join(',')).join(' ');

/** North-up campus map from campus data with the player's position (phone and M). */
export function CampusMap({ large = false }: { large?: boolean }) {
  const { campus } = loadedCampus;
  const position = usePlayerStore((s) => s.position);
  const yaw = usePlayerStore((s) => s.yaw);
  const view = useMemo(() => {
    const { center, size } = campusBounds(campus);
    const pad = size * 0.08;
    return `${center[0] - size / 2 - pad} ${center[1] - size / 2 - pad} ${size + pad * 2} ${size + pad * 2}`;
  }, [campus]);
  const [x, , z] = position;
  const dx = -Math.sin(yaw) * 9,
    dz = -Math.cos(yaw) * 9;

  return (
    <svg
      className={large ? 'campus-map campus-map--large' : 'campus-map'}
      viewBox={view}
      role="img"
      aria-label="Campus map"
    >
      {campus.boundary.polygon && (
        <polygon
          points={points(campus.boundary.polygon)}
          fill="#6f6c64"
          stroke="#9b5a44"
          strokeWidth={1.5}
        />
      )}
      {campus.areas.map((area) =>
        area.polygon ? (
          <polygon
            key={area.id}
            points={points(area.polygon)}
            fill={AREA_FILL[area.kind] ?? '#9a8a6a'}
            opacity={0.9}
          />
        ) : null,
      )}
      {campus.buildings.map((b) => {
        if (!b.footprint) return null;
        const [cx, cz] = centroid(b.footprint);
        return (
          <g key={b.id}>
            <polygon
              points={points(b.footprint)}
              fill="#c9c2b6"
              stroke="#3a3a3a"
            />
            <text
              x={cx}
              y={cz}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={large ? 7 : 10}
              fill="#1c2228"
            >
              {large ? `${b.id} · ${b.label}` : b.id}
            </text>
          </g>
        );
      })}
      {campus.gates.map((g) =>
        g.position ? (
          <g key={g.id}>
            <circle
              cx={g.position[0]}
              cy={g.position[1]}
              r={2.5}
              fill="#f0d58c"
            />
            {large && (
              <text
                x={g.position[0] + 4}
                y={g.position[1] - 4}
                fontSize={6}
                fill="#f0d58c"
              >
                {g.label}
              </text>
            )}
          </g>
        ) : null,
      )}
      <g data-testid="map-player">
        <line
          x1={x}
          y1={z}
          x2={x + dx}
          y2={z + dz}
          stroke="#ff4f6d"
          strokeWidth={2}
        />
        <circle
          cx={x}
          cy={z}
          r={3.5}
          fill="#ff4f6d"
          stroke="white"
          strokeWidth={1}
        />
      </g>
      <text
        x={campusBounds(campus).center[0]}
        y={campusBounds(campus).center[1] - campusBounds(campus).size / 2}
        textAnchor="middle"
        fontSize={9}
        fill="#ecf2f5"
      >
        N ↑
      </text>
    </svg>
  );
}
