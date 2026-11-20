import { useState } from 'react';
import { useAppStore } from '../state/app-store';
import { SettingsPanel } from './SettingsPanel';
import { CampusMap } from './CampusMap';
import { loadedCampus } from '../world/campus';

/** Pause menu (PRD §5): resume, save, settings, time controls, exit to title. */
function PauseMenu() {
  const setOverlay = useAppStore((s) => s.setOverlay);
  const saveNow = useAppStore((s) => s.saveNow);
  const exitToTitle = useAppStore((s) => s.exitToTitle);
  const message = useAppStore((s) => s.saveMessage);
  return (
    <section className="panel" role="dialog" aria-label="Pause menu">
      <h2>Paused</h2>
      <div className="menu">
        <button onClick={() => setOverlay(null)}>Resume</button>
        <button onClick={() => saveNow()}>Save</button>
        <button onClick={() => setOverlay('settings')}>Settings</button>
        <button onClick={() => setOverlay('time')}>Time controls</button>
        <button onClick={() => exitToTitle()}>Exit to title</button>
      </div>
      {message && (
        <p className="panel__hint" role="status" data-testid="save-message">
          {message}
        </p>
      )}
      <p className="panel__hint">
        Game time is paused while this menu is open.
      </p>
    </section>
  );
}

const TABS = ['Map', 'Timetable', 'Messages', 'Tasks'] as const;

/** Phone shell (GAMEPLAY_SPEC §5). Timetable, messages and tasks arrive in M10. */
function Phone() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Map');
  const setOverlay = useAppStore((s) => s.setOverlay);
  const profile = useAppStore((s) => s.profile);
  const department = loadedCampus.campus.departments.find(
    (d) => d.id === profile?.departmentId,
  );
  return (
    <section className="panel phone" role="dialog" aria-label="Phone">
      <h2>Phone</h2>
      <div role="tablist" className="phone__tabs">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
        <button onClick={() => setOverlay('settings')}>Settings</button>
      </div>
      <div role="tabpanel" aria-label={tab} className="phone__body">
        {tab === 'Map' && <CampusMap />}
        {tab === 'Timetable' && (
          <p>
            {department?.name ?? 'Your department'} timetable: generated class
            schedules arrive with tasks (M10). Template pending (OPEN_QUESTIONS
            #18).
          </p>
        )}
        {tab === 'Messages' && <p>No messages yet. Friends arrive in M10.</p>}
        {tab === 'Tasks' && <p>No tasks yet. The task list arrives in M10.</p>}
      </div>
      <p className="panel__hint">P or Esc to close.</p>
    </section>
  );
}

/** Full-screen campus map (M). */
function MapOverlay() {
  return (
    <section
      className="map-overlay"
      role="dialog"
      aria-label="Campus map overlay"
    >
      <CampusMap large />
      <p className="panel__hint">M or Esc to close.</p>
    </section>
  );
}

export function Overlays() {
  const overlay = useAppStore((s) => s.overlay);
  const setOverlay = useAppStore((s) => s.setOverlay);
  if (overlay === 'pause') return <PauseMenu />;
  if (overlay === 'settings')
    return <SettingsPanel onClose={() => setOverlay('pause')} />;
  if (overlay === 'phone') return <Phone />;
  if (overlay === 'map') return <MapOverlay />;
  return null;
}
