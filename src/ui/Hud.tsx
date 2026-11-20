import { useClockStore } from '../state/clock-store';
import { usePlayerStore } from '../state/player-store';
import { useAppStore } from '../state/app-store';
import { locationLabel, useWorldStore } from '../state/world-store';

const DAY_TYPE = {
  weekday: 'classes',
  saturday: 'light activity',
  sunday: 'campus quiet',
} as const;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** Compass bearing (degrees) the camera faces, from its yaw. */
const bearingOf = (yaw: number) =>
  ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;

/** HUD (GAMEPLAY_SPEC §5): time and weekday, compass, active task line. */
export function Hud() {
  const { label, speed, paused, dayType } = useClockStore();
  const yaw = usePlayerStore((s) => s.yaw);
  const profile = useAppStore((s) => s.profile);
  const bearing = bearingOf(yaw);
  const location = useWorldStore((s) => s.location);
  return (
    <div className="hud-clock" aria-label="Game time">
      <strong data-testid="hud-clock">{label}</strong>
      <span>
        {paused ? 'paused' : `×${speed}`} · {DAY_TYPE[dayType]}
      </span>
      <span data-testid="hud-compass" className="hud-compass">
        {COMPASS[Math.round(bearing / 45) % 8]} {Math.round(bearing)}°
      </span>
      <span data-testid="hud-location" className="hud-location">
        {locationLabel(location)}
      </span>
      <span className="hud-task">
        {profile?.displayName || profile?.rollNumber} · no active task
      </span>
      <span>Esc pause · T time · P phone · M map</span>
    </div>
  );
}
