import { useState } from 'react';
import { clearSave, useAppStore } from '../state/app-store';
import { SettingsPanel } from './SettingsPanel';
import { loadedCampus } from '../world/campus';
import { DAYS, formatTime } from '../systems/time';

/** Title (PRD §5): Continue restores the local save; New game goes to registration. */
export function TitleScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const continueGame = useAppStore((s) => s.continueGame);
  const peekSave = useAppStore((s) => s.peekSave);
  const message = useAppStore((s) => s.saveMessage);
  const [showSettings, setShowSettings] = useState(false);
  const [, refresh] = useState(0);
  const save = peekSave();
  const saved = save?.ok ? save.save : undefined;
  const department = saved
    ? loadedCampus.campus.departments.find(
        (d) => d.id === saved.profile.departmentId,
      )?.name
    : undefined;

  return (
    <div className="screen title-screen">
      <div className="title-card">
        <p className="eyebrow">FAST NUCES · LAHORE</p>
        <h1>FAST Lahore Campus</h1>
        <p>A single-player walk through campus life. Development build.</p>
        {showSettings ? (
          <SettingsPanel onClose={() => setShowSettings(false)} />
        ) : (
          <div className="menu">
            <button
              disabled={!saved}
              onClick={() => continueGame()}
              data-testid="continue"
            >
              Continue
            </button>
            {saved && (
              <p className="panel__hint" data-testid="save-summary">
                {saved.profile.displayName || saved.profile.rollNumber} ·{' '}
                {department ?? saved.profile.departmentId} ·{' '}
                {DAYS[saved.time.day]} {formatTime(saved.time.minutes)}
              </p>
            )}
            {save && !save.ok && (
              <p role="alert">Saved game could not be loaded: {save.error}</p>
            )}
            <button onClick={() => setScreen('register')}>New game</button>
            {saved && (
              <p className="panel__hint">New game replaces your saved game.</p>
            )}
            <button onClick={() => setShowSettings(true)}>Settings</button>
            {saved && (
              <button
                className="link"
                onClick={() => {
                  clearSave();
                  refresh((n) => n + 1);
                }}
              >
                Delete save
              </button>
            )}
            {message && <p className="panel__hint">{message}</p>}
          </div>
        )}
        <p className="panel__hint">
          Registration is fictional and stays in this browser. No real FAST
          student data is used.
        </p>
      </div>
    </div>
  );
}
