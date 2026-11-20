import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAppStore } from '../state/app-store';
import { loadedCampus } from '../world/campus';
import {
  BODIES,
  DEFAULT_AVATAR,
  HAIR_STYLES,
  OUTFIT_COLORS,
  SKIN_TONES,
  rollNumberWarning,
} from '../systems/save';
import type { Avatar } from '../systems/save';
import { playerConfigFor } from '../systems/player-controller';

/** Registration (GAMEPLAY_SPEC §1): fictional, local only. */
export function RegisterScreen() {
  const startNewGame = useAppStore((s) => s.startNewGame);
  const setScreen = useAppStore((s) => s.setScreen);
  const departments = loadedCampus.campus.departments;
  const [rollNumber, setRollNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [avatar, setAvatar] = useState<Avatar>(DEFAULT_AVATAR);
  const warning = rollNumber.trim() ? rollNumberWarning(rollNumber) : undefined;
  const ready = rollNumber.trim().length > 0 && departmentId !== '';
  const height = playerConfigFor(avatar.body).height;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    startNewGame({
      rollNumber: rollNumber.trim(),
      ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      departmentId,
      avatar,
    });
  };
  const pick = <K extends keyof Avatar>(key: K, value: Avatar[K]) =>
    setAvatar((a) => ({ ...a, [key]: value }));

  return (
    <div className="screen register-screen">
      <form className="title-card register" onSubmit={submit}>
        <h1>Register</h1>
        <label>
          Roll number *
          <input
            value={rollNumber}
            onChange={(e) => setRollNumber(e.target.value)}
            placeholder="23L-1234"
            required
            aria-describedby="roll-warning"
          />
        </label>
        <p id="roll-warning" role="status" className="warning">
          {warning ?? ''}
        </p>
        <label>
          Display name (optional)
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
          />
        </label>
        <label>
          Department *
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            required
          >
            <option value="">Choose…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="avatar">
          <legend>Avatar</legend>
          <div className="avatar__options">
            <div role="radiogroup" aria-label="Body">
              {BODIES.map((b) => (
                <label key={b}>
                  <input
                    type="radio"
                    name="body"
                    checked={avatar.body === b}
                    onChange={() => pick('body', b)}
                  />
                  {b === 'male' ? 'Male' : 'Female'}
                </label>
              ))}
            </div>
            <p className="swatch-label">Skin tone</p>
            <div className="swatches" role="radiogroup" aria-label="Skin tone">
              {SKIN_TONES.map((c, i) => (
                <button
                  type="button"
                  key={c}
                  role="radio"
                  aria-checked={avatar.skinTone === c}
                  aria-label={`Skin tone ${i + 1}`}
                  style={{ background: c }}
                  onClick={() => pick('skinTone', c)}
                />
              ))}
            </div>
            <label>
              Hair
              <select
                value={avatar.hair}
                onChange={(e) => pick('hair', e.target.value as Avatar['hair'])}
              >
                {HAIR_STYLES.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <p className="swatch-label">Outfit colour</p>
            <div
              className="swatches"
              role="radiogroup"
              aria-label="Outfit colour"
            >
              {OUTFIT_COLORS.map((c, i) => (
                <button
                  type="button"
                  key={c}
                  role="radio"
                  aria-checked={avatar.outfitColor === c}
                  aria-label={`Outfit colour ${i + 1}`}
                  style={{ background: c }}
                  onClick={() => pick('outfitColor', c)}
                />
              ))}
            </div>
          </div>
          {/* Placeholder body preview until the M8 character models. */}
          <svg
            className="avatar__preview"
            viewBox="0 0 60 200"
            aria-label="Avatar preview"
            role="img"
          >
            <rect
              x={14}
              y={200 - height * 100}
              width={32}
              height={height * 100 - 26}
              rx={16}
              fill={avatar.outfitColor}
            />
            <circle
              cx={30}
              cy={200 - height * 100 + 2}
              r={13}
              fill={avatar.skinTone}
            />
            <text
              x={30}
              y={196}
              textAnchor="middle"
              fontSize={9}
              fill="#b6c6cc"
            >
              {height.toFixed(2)} m
            </text>
          </svg>
        </fieldset>
        <div className="menu menu--row">
          <button type="button" onClick={() => setScreen('title')}>
            Back
          </button>
          <button type="submit" disabled={!ready}>
            Start
          </button>
        </div>
        <p className="panel__hint">
          Only the department list known from the campus map is offered (see
          OPEN_QUESTIONS #7). Everything stays in this browser.
        </p>
      </form>
    </div>
  );
}
