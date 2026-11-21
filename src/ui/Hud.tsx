import { useEffect, useState } from 'react';
import { useClockStore } from '../state/clock-store';
import { usePlayerStore } from '../state/player-store';
import { useAppStore } from '../state/app-store';
import { useTaskStore } from '../state/task-store';
import { locationLabel, useWorldStore } from '../state/world-store';

const DAY_TYPE = {
  weekday: 'classes',
  saturday: 'light activity',
  sunday: 'campus quiet',
} as const;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
const NOTICE_MS = 4500;

/** Compass bearing (degrees) the camera faces, from its yaw. */
const bearingOf = (yaw: number) =>
  ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;

/** Interaction prompt under the crosshair: "E · Sit — Cafe table". */
function Prompt() {
  const focus = useTaskStore((s) => s.focus);
  const seated = useTaskStore((s) => s.seated);
  const overlay = useAppStore((s) => s.overlay);
  if (overlay) return null;
  const text = seated
    ? `E · Stand up (${seated.label})`
    : focus
      ? `E · ${focus.verb} — ${focus.label}`
      : undefined;
  if (!text) return null;
  return (
    <p
      className="interact-prompt"
      data-testid="interact-prompt"
      data-focus={focus?.id ?? ''}
    >
      {text}
    </p>
  );
}

/** Short-lived message (task complete, quiet zone, a shelf's label…). */
function Notice() {
  const notice = useTaskStore((s) => s.notice);
  const [shown, setShown] = useState<number>();
  useEffect(() => {
    if (!notice) return;
    setShown(notice.id);
    const timer = setTimeout(() => setShown(undefined), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice || shown !== notice.id) return null;
  return (
    <p className="task-notice" role="status" data-testid="task-notice">
      {notice.text}
    </p>
  );
}

/** HUD (GAMEPLAY_SPEC §5): time and weekday, compass, active task line. */
export function Hud() {
  const { label, speed, paused, dayType } = useClockStore();
  const yaw = usePlayerStore((s) => s.yaw);
  const profile = useAppStore((s) => s.profile);
  const bearing = bearingOf(yaw);
  const location = useWorldStore((s) => s.location);
  useTaskStore((s) => s.rev);
  const engine = useTaskStore((s) => s.engine);
  const hint = engine.hint();
  return (
    <>
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
        <span className="hud-task" data-testid="task-line">
          {profile?.displayName || profile?.rollNumber} ·{' '}
          {engine.active && hint
            ? `${engine.active.task.title}: ${hint.text}`
            : 'no active task (P → Tasks)'}
        </span>
        <span>E use · Esc pause · T time · P phone · M map</span>
      </div>
      <Prompt />
      <Notice />
    </>
  );
}
