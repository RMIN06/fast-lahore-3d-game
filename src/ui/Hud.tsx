import { useClockStore } from '../state/clock-store';

const DAY_TYPE = {
  weekday: 'classes',
  saturday: 'light activity',
  sunday: 'campus quiet',
} as const;

/** HUD time and weekday (GAMEPLAY_SPEC §5). */
export function Hud() {
  const { label, speed, paused, dayType } = useClockStore();
  return (
    <div className="hud-clock" aria-label="Game time">
      <strong data-testid="hud-clock">{label}</strong>
      <span>
        {paused ? 'paused' : `×${speed}`} · {DAY_TYPE[dayType]} · T: time
      </span>
    </div>
  );
}
