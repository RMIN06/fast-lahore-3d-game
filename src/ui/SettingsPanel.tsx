import { useAppStore } from '../state/app-store';
import { GRAPHICS } from '../systems/save';

/** Graphics preset and volume (PRD §5). Volume is stored now; audio arrives in M12. */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  return (
    <section className="panel" role="dialog" aria-label="Settings">
      <h2>Settings</h2>
      <fieldset>
        <legend>Graphics preset</legend>
        {GRAPHICS.map((preset) => (
          <label key={preset}>
            <input
              type="radio"
              name="graphics"
              value={preset}
              checked={settings.graphics === preset}
              onChange={() => setSettings({ graphics: preset })}
            />
            {preset[0]!.toUpperCase() + preset.slice(1)}
          </label>
        ))}
      </fieldset>
      <p className="panel__hint">
        Low: no sun shadows, native resolution. Medium: 1024 shadows. High: 2048
        shadows, sharper image.
      </p>
      <label>
        Volume {Math.round(settings.volume * 100)}%
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(settings.volume * 100)}
          onChange={(event) =>
            setSettings({ volume: Number(event.target.value) / 100 })
          }
          aria-label="Volume"
        />
      </label>
      <p className="panel__hint">Campus audio arrives in M12.</p>
      <button onClick={onClose}>Back</button>
    </section>
  );
}
