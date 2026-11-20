import { useState } from 'react';
import type { FormEvent } from 'react';
import { gameClock, useClockStore } from '../state/clock-store';
import { DAYS, SPEEDS, formatTime, parseTime } from '../systems/time';

/** Time panel (T): pause, speed, set time and day (GAMEPLAY_SPEC §4). */
export function TimePanel() {
  const panelOpen = useClockStore((s) => s.panelOpen);
  // Mounted only while open so its fields start from the current game time.
  return panelOpen ? <TimePanelBody /> : null;
}

function TimePanelBody() {
  const { label, speed, paused, setSpeed, setPaused, setTime, setPanelOpen } =
    useClockStore();
  const [time, setTimeText] = useState(() => formatTime(gameClock.minutes));
  const [day, setDay] = useState(() => gameClock.day);
  const [error, setError] = useState('');

  const apply = (event: FormEvent) => {
    event.preventDefault();
    try {
      setTime(parseTime(time), day);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="time-panel" role="dialog" aria-label="Time panel">
      <h2>Time · {label}</h2>
      <div className="time-panel__row" role="group" aria-label="Speed">
        <button aria-pressed={paused} onClick={() => setPaused(!paused)}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        {SPEEDS.map((s) => (
          <button
            key={s}
            aria-pressed={!paused && speed === s}
            onClick={() => {
              setSpeed(s);
              setPaused(false);
            }}
          >
            ×{s}
          </button>
        ))}
      </div>
      <form className="time-panel__row" onSubmit={apply}>
        <label>
          Day
          <select
            value={day}
            onChange={(event) => setDay(Number(event.target.value))}
          >
            {DAYS.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Time
          <input
            type="time"
            value={time}
            onChange={(event) => setTimeText(event.target.value)}
            required
          />
        </label>
        <button type="submit">Set time</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <p>1 real minute = 1 game hour at ×1. Press T or Esc to close.</p>
      <button onClick={() => setPanelOpen(false)}>Close</button>
    </section>
  );
}
