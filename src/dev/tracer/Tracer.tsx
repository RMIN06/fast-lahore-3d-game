import { useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent } from 'react';
import seedInput from '../../../data/campus.seed.json';
import type { Campus, Confidence, Vec2 } from '../../types/campus';
import { loadCampus } from '../../world/campus-loader';
import { campusSchema } from '../../world/campus-schema';
import { validateCampus } from '../../systems/campus-validation';
import {
  fitScale,
  sitePlanSummary,
  traceToCampus,
  worldToPixel,
} from '../../systems/site-plan';
import type {
  DistanceReference,
  ImageCalibration,
  TraceTarget,
} from '../../systems/site-plan';
import './tracer.css';

const seed = loadCampus(seedInput).campus;
const colors: Record<Confidence, string> = {
  measured: '#7fd6ab',
  traced: '#82bbec',
  estimated: '#e5c373',
  placeholder: '#ee8d8d',
};
const pointsString = (points: Vec2[]) =>
  points.map((point) => point.join(',')).join(' ');
const center = (points: Vec2[]): Vec2 => [
  points.reduce((n, p) => n + p[0], 0) / points.length,
  points.reduce((n, p) => n + p[1], 0) / points.length,
];

function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Tracer() {
  const [campus, setCampus] = useState<Campus>(seed);
  const [history, setHistory] = useState<Campus[]>([]);
  const [view, setView] = useState<'schematic' | 'image' | 'world'>(
    'schematic',
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Vec2>([0, 0]);
  const [image, setImage] = useState<{
    url: string;
    name: string;
    width: number;
    height: number;
  }>();
  const imageRef = useRef<string>();
  const [origin, setOrigin] = useState<Vec2>();
  const [rotation, setRotation] = useState('0');
  const [references, setReferences] = useState<DistanceReference[]>([]);
  const [pick, setPick] = useState<'origin' | 'reference' | 'outline'>(
    'origin',
  );
  const [points, setPoints] = useState<Vec2[]>([]);
  const [referencePoints, setReferencePoints] = useState<Vec2[]>([]);
  const [meters, setMeters] = useState('');
  const [referenceLabel, setReferenceLabel] = useState('');
  const [source, setSource] = useState('');
  const [metricSource, setMetricSource] = useState(false);
  const [calibration, setCalibration] = useState<ImageCalibration>();
  const [targetKey, setTargetKey] = useState('boundary');
  const [confidence, setConfidence] = useState<Confidence>('placeholder');
  const [heading, setHeading] = useState('');
  const [labels, setLabels] = useState(true);
  const [confidenceColors, setConfidenceColors] = useState(true);
  const [message, setMessage] = useState(
    'Start with a scaled satellite image or inspect the unscaled schematic inventory.',
  );
  const drag = useRef<number>();
  const locked = history.length > 0;
  const targets: { key: string; label: string; target: TraceTarget }[] = [
    { key: 'boundary', label: 'Campus boundary', target: { kind: 'boundary' } },
    ...campus.buildings.map((b) => ({
      key: `building:${b.id}`,
      label: `${b.id} · ${b.label}`,
      target: { kind: 'building' as const, id: b.id },
    })),
    ...campus.areas.map((a) => ({
      key: `area:${a.id}`,
      label: a.label,
      target: { kind: 'area' as const, id: a.id },
    })),
    ...campus.gates.map((g) => ({
      key: `gate:${g.id}`,
      label: g.label,
      target: { kind: 'gate' as const, id: g.id },
    })),
    ...campus.buildings.map((b) => ({
      key: `entry:${b.id}`,
      label: `${b.id} · main entrance`,
      target: {
        kind: 'entry' as const,
        id: 'main',
        buildingId: b.id,
        floor: 'G',
      },
    })),
  ];
  const selected = targets.find((t) => t.key === targetKey)!;
  const summary = sitePlanSummary(campus);
  const result = validateCampus(campus, { mode: 'site-plan' });
  const errors = result.issues.filter((issue) => issue.severity === 'error');
  const allPoints = [
    ...(campus.boundary.polygon ?? []),
    ...campus.buildings.flatMap((b) => b.footprint ?? []),
    ...campus.areas.flatMap((a) => a.polygon ?? []),
    ...campus.gates.flatMap((g) => (g.position ? [g.position] : [])),
    ...campus.buildings.flatMap((b) =>
      b.entries.flatMap((entry) => (entry.position ? [entry.position] : [])),
    ),
  ];
  const minX = Math.min(0, ...allPoints.map((p) => p[0])) - 15,
    minZ = Math.min(0, ...allPoints.map((p) => p[1])) - 15;
  const worldWidth = Math.max(0, ...allPoints.map((p) => p[0])) - minX + 15,
    worldHeight = Math.max(0, ...allPoints.map((p) => p[1])) - minZ + 15;
  const dimensions =
    view === 'schematic'
      ? seed.meta.schematicMap.sizePx
      : view === 'image'
        ? [image?.width ?? 1320, image?.height ?? 891]
        : [worldWidth, worldHeight];
  const viewBox = `${(view === 'world' ? minX : 0) + dimensions[0]! * ((1 - 1 / zoom) / 2 + pan[0])} ${(view === 'world' ? minZ : 0) + dimensions[1]! * ((1 - 1 / zoom) / 2 + pan[1])} ${dimensions[0]! / zoom} ${dimensions[1]! / zoom}`;
  const size =
    view === 'world'
      ? Math.max(worldWidth, worldHeight) / 170
      : Math.max(...dimensions) / 170;

  const run = (action: () => void) => {
    try {
      action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const readImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setMessage('Choose a PNG, JPEG or WebP image.');
      return;
    }
    if (locked) {
      setMessage(
        'Reset the trace session before changing its source image. Export your draft first.',
      );
      return;
    }
    const url = URL.createObjectURL(file);
    const bitmap = new Image();
    bitmap.src = url;
    try {
      await bitmap.decode();
    } catch {
      URL.revokeObjectURL(url);
      setMessage('This image could not be decoded.');
      return;
    }
    if (imageRef.current) URL.revokeObjectURL(imageRef.current);
    imageRef.current = url;
    setImage({
      url,
      name: file.name,
      width: bitmap.naturalWidth,
      height: bitmap.naturalHeight,
    });
    setOrigin(undefined);
    setReferences([]);
    setCalibration(undefined);
    setPoints([]);
    setReferencePoints([]);
    setSource(file.name);
    setMetricSource(false);
    setView('image');
    setPick('origin');
    setMessage(
      'Image stays in this browser. Mark Gate-5, set image rotation, then add two measured references.',
    );
  };
  const readCampus = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = campusSchema.parse(JSON.parse(await file.text()));
      const checked = validateCampus(parsed);
      const blocking = checked.issues.filter(
        (issue) => issue.severity === 'error' && issue.code !== 'boundary-area',
      );
      if (blocking.length)
        throw new Error(
          blocking.map((issue) => `${issue.path}: ${issue.message}`).join('\n'),
        );
      setCampus(parsed);
      setTargetKey('boundary');
      setHistory([]);
      setCalibration(undefined);
      setPoints([]);
      setView('world');
      setMessage(
        `Loaded ${file.name}; ${checked.issues.length} validation findings. Recalibrate an image before tracing.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  const coordinates = (event: PointerEvent<SVGSVGElement>): Vec2 => {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) throw new Error('Drawing surface is not ready.');
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    return [point.x, point.y];
  };
  const clicked = (event: PointerEvent<SVGSVGElement>) =>
    run(() => {
      if (view !== 'image' || !image) return;
      const point = coordinates(event);
      if (pick === 'origin') {
        if (!locked) {
          setOrigin(point);
          setCalibration(undefined);
        }
      } else if (pick === 'reference') {
        if (!locked) {
          setReferencePoints((previous) => [...previous.slice(-1), point]);
          setCalibration(undefined);
        }
      } else setPoints((previous) => [...previous, point]);
    });
  const addReference = () =>
    run(() => {
      if (
        referencePoints.length !== 2 ||
        !Number.isFinite(Number(meters)) ||
        Number(meters) <= 0 ||
        !referenceLabel.trim()
      )
        throw new Error(
          'Pick two reference endpoints and supply their measured distance and source label.',
        );
      setReferences([
        ...references,
        {
          from: referencePoints[0]!,
          to: referencePoints[1]!,
          meters: Number(meters),
          label: referenceLabel,
        },
      ]);
      setReferencePoints([]);
      setMeters('');
      setReferenceLabel('');
      setCalibration(undefined);
    });
  const calibrate = () =>
    run(() => {
      if (
        !origin ||
        !image ||
        !source.trim() ||
        !metricSource ||
        !Number.isFinite(Number(rotation))
      )
        throw new Error(
          'Choose the origin, record a source and rotation, and confirm this image supports metric tracing.',
        );
      const fit = fitScale(references);
      const date = new Date().toLocaleDateString('en-CA');
      setCalibration({
        ...fit,
        origin,
        rotationDeg: Number(rotation),
        references,
        source,
        date,
      });
      setPick('outline');
      setMessage(
        `Calibration: ${fit.metersPerPixel.toFixed(4)} m/px; residual ${fit.residualPct.toFixed(2)}%. Trace an exterior outline. This does not verify its source accuracy.`,
      );
    });
  const apply = () =>
    run(() => {
      if (!calibration) throw new Error('Calibrate the image first.');
      const next = traceToCampus(
        campus,
        selected.target,
        points,
        calibration,
        confidence,
        heading.trim() ? Number(heading) : undefined,
      );
      setHistory([...history, campus]);
      setCampus(next);
      setPoints([]);
      setMessage(
        `Applied ${selected.label}. Room inventory preserved; ${sitePlanSummary(next).missing.length} exterior items remain unresolved.`,
      );
    });
  const exported = (ready: boolean) =>
    run(() => {
      if (ready && errors.length)
        throw new Error(
          'Resolve the M2 validation errors before exporting campus.json.',
        );
      download(
        ready ? 'campus.json' : 'campus.draft.json',
        JSON.stringify(campus, null, 2),
      );
      setMessage(
        ready
          ? 'Downloaded campus.json. Apply it with npm run apply:site-plan -- <path>.'
          : 'Downloaded an unfinished draft; it is not an accepted M2 site plan.',
      );
    });
  const geometry = (polygon: Vec2[]) =>
    view === 'image' && calibration
      ? polygon.map((p) => worldToPixel(p, calibration))
      : polygon;
  const displayPolygon = (
    id: string,
    polygon: Vec2[] | null,
    level: Confidence,
    label: string,
  ) => {
    if (!polygon || (view === 'image' && !calibration)) return null;
    const displayed = geometry(polygon),
      position = center(displayed);
    return (
      <g key={id}>
        <polygon
          data-testid={`shape-${id}`}
          points={pointsString(displayed)}
          fill={confidenceColors ? colors[level] : '#82bbec'}
          fillOpacity={0.14}
          stroke={confidenceColors ? colors[level] : '#82bbec'}
          strokeWidth={size / 4}
          strokeDasharray={
            level === 'placeholder' ? `${size} ${size / 2}` : undefined
          }
        />
        {labels && (
          <text x={position[0]} y={position[1]} fontSize={size * 1.7}>
            {label}
            {level === 'placeholder' ? ' [placeholder]' : ''}
          </text>
        )}
      </g>
    );
  };

  return (
    <main className="tracer-app">
      <div className="tracer-toolbar">
        <div>
          <p>FAST LAHORE / M2 · DEVELOPMENT TOOL</p>
          <h1>Campus site-plan tracer</h1>
        </div>
        <nav aria-label="Tracer navigation">
          <a href="/">Scene</a>
          <button
            onClick={() => setView('schematic')}
            aria-pressed={view === 'schematic'}
          >
            Schematic
          </button>
          <button
            onClick={() => setView('image')}
            aria-pressed={view === 'image'}
          >
            Trace image
          </button>
          <button
            onClick={() => setView('world')}
            aria-pressed={view === 'world'}
          >
            World plan
          </button>
        </nav>
      </div>
      <div className="tracer-layout">
        <aside className="tracer-controls" aria-label="Tracing controls">
          <section>
            <h2>1 · Source and scale</h2>
            <label>
              Reference image
              <input
                aria-label="Reference image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  void readImage(event);
                }}
                disabled={locked}
              />
            </label>
            <p>Local image only. No reference is bundled or uploaded.</p>
            <label>
              Source / measurement citation
              <input
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setCalibration(undefined);
                }}
                disabled={locked}
              />
            </label>
            <label>
              Image rotation to world (°)
              <input
                type="number"
                value={rotation}
                onChange={(e) => {
                  setRotation(e.target.value);
                  setCalibration(undefined);
                }}
                disabled={locked}
              />
            </label>
            <p>
              0°: image top north. 180°: image top south. Confirm against the
              source.
            </p>
            <label className="tracer-check">
              <input
                type="checkbox"
                checked={metricSource}
                onChange={(e) => {
                  setMetricSource(e.target.checked);
                  setCalibration(undefined);
                }}
                disabled={locked}
              />
              Source has a reliable metric scale; it is not the schematic
              student map
            </label>
            <button
              disabled={!image || locked}
              onClick={() => {
                setPick('origin');
                setView('image');
              }}
            >
              Mark Gate-5 origin
            </button>
            <p>
              Origin:{' '}
              {origin
                ? origin.map((n) => n.toFixed(1)).join(', ') + ' px'
                : 'not marked'}
            </p>
            <button
              disabled={!image || locked}
              onClick={() => {
                setPick('reference');
                setReferencePoints([]);
                setView('image');
              }}
            >
              Pick reference endpoints
            </button>
            <p>
              {referencePoints.length}/2 endpoints · {references.length}{' '}
              recorded distances
            </p>
            <label>
              Reference distance (m)
              <input
                type="number"
                min="0"
                value={meters}
                onChange={(e) => setMeters(e.target.value)}
                disabled={locked}
              />
            </label>
            <label>
              Reference label
              <input
                value={referenceLabel}
                onChange={(e) => setReferenceLabel(e.target.value)}
                disabled={locked}
              />
            </label>
            <button
              disabled={locked || referencePoints.length !== 2}
              onClick={addReference}
            >
              Add distance reference
            </button>
            <ol>
              {references.map((ref, i) => (
                <li key={i}>
                  {ref.label} · {ref.meters} m
                </li>
              ))}
            </ol>
            <button
              disabled={locked || references.length < 2}
              onClick={calibrate}
            >
              Fit metric scale
            </button>
            {calibration && (
              <p data-testid="calibration-status">
                {calibration.metersPerPixel.toFixed(4)} m/px · residual{' '}
                {calibration.residualPct.toFixed(2)}%
              </p>
            )}
          </section>
          <section>
            <h2>2 · Trace exterior data</h2>
            <label>
              Target
              <select
                value={targetKey}
                onChange={(e) => {
                  setTargetKey(e.target.value);
                  setPoints([]);
                }}
              >
                {targets.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Confidence
              <select
                value={confidence}
                onChange={(e) => setConfidence(e.target.value as Confidence)}
              >
                {Object.keys(colors).map((level) => (
                  <option key={level}>{level}</option>
                ))}
              </select>
            </label>
            {selected.target.kind === 'gate' && (
              <label>
                Observed gate heading (°)
                <input
                  type="number"
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                />
              </label>
            )}
            <button
              disabled={!calibration || !image}
              onClick={() => {
                setPick('outline');
                setView('image');
              }}
            >
              Draw{' '}
              {selected.target.kind === 'gate' ||
              selected.target.kind === 'entry'
                ? 'point'
                : 'outline'}
            </button>
            <button
              disabled={!calibration || !image}
              onClick={() =>
                run(() => {
                  if (!calibration) return;
                  const target = selected.target;
                  const existing =
                    target.kind === 'boundary'
                      ? campus.boundary.polygon
                      : target.kind === 'building'
                        ? campus.buildings.find((b) => b.id === target.id)
                            ?.footprint
                        : target.kind === 'area'
                          ? campus.areas.find((a) => a.id === target.id)
                              ?.polygon
                          : target.kind === 'gate'
                            ? campus.gates.find((g) => g.id === target.id)
                                ?.position
                              ? [
                                  campus.gates.find((g) => g.id === target.id)!
                                    .position!,
                                ]
                              : null
                            : campus.buildings
                                  .find((b) => b.id === target.buildingId)
                                  ?.entries.find((e) => e.id === target.id)
                                  ?.position
                              ? [
                                  campus.buildings
                                    .find((b) => b.id === target.buildingId)!
                                    .entries.find((e) => e.id === target.id)!
                                    .position!,
                                ]
                              : null;
                  if (!existing)
                    throw new Error(
                      'This target has no existing geometry to edit.',
                    );
                  setPoints(existing.map((p) => worldToPixel(p, calibration)));
                  setPick('outline');
                  setView('image');
                })
              }
            >
              Edit existing geometry
            </button>
            <p>
              {points.length} draft points. Click corners; drag a handle to
              adjust.
            </p>
            <div className="tracer-actions">
              <button
                disabled={!points.length}
                onClick={() => setPoints(points.slice(0, -1))}
              >
                Undo point
              </button>
              <button disabled={!points.length} onClick={() => setPoints([])}>
                Clear points
              </button>
            </div>
            <button disabled={!calibration || !points.length} onClick={apply}>
              Apply trace
            </button>
            <button
              disabled={!history.length}
              onClick={() => {
                setCampus(history.at(-1)!);
                setHistory(history.slice(0, -1));
                setPoints([]);
              }}
            >
              Undo applied trace
            </button>
          </section>
          <section>
            <h2>3 · Review and export</h2>
            <label className="tracer-check">
              <input
                type="checkbox"
                checked={labels}
                onChange={(e) => setLabels(e.target.checked)}
              />
              Labels
            </label>
            <label className="tracer-check">
              <input
                type="checkbox"
                checked={confidenceColors}
                onChange={(e) => setConfidenceColors(e.target.checked)}
              />
              Confidence colors
            </label>
            <label>
              Load campus JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  void readCampus(e);
                }}
              />
            </label>
            <button onClick={() => exported(false)}>Export draft</button>
            <button disabled={errors.length > 0} onClick={() => exported(true)}>
              Export campus.json
            </button>
            <p>
              Write-back is a validated CLI step. Drafts never overwrite
              campus.json.
            </p>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    'Discard current edits and calibration? Export a draft first if you need it.',
                  )
                ) {
                  setCampus(seed);
                  setHistory([]);
                  setCalibration(undefined);
                  setOrigin(undefined);
                  setReferences([]);
                  setPoints([]);
                  setReferencePoints([]);
                  setMessage('Session reset to the original seed.');
                }
              }}
            >
              Reset trace session
            </button>
          </section>
        </aside>
        <div className="tracer-workspace">
          <div className="tracer-status" role="status">
            {message}
          </div>
          <div className="tracer-view-label">
            {view === 'schematic'
              ? 'SCHEMATIC · PIXELS · NOT TO SCALE · TOP = SOUTH (UNVERIFIED)'
              : view === 'world'
                ? 'WORLD PLAN · METERS · NORTH ↑ · EAST → · GATE-5 ORIGIN'
                : `${image?.name ?? 'NO IMAGE SELECTED'} · PIXELS · ${pick.toUpperCase()} PICK MODE`}
          </div>
          <div
            className="tracer-view-controls"
            aria-label="Plan viewport controls"
          >
            <button
              onClick={() => setZoom(Math.min(8, zoom * 1.5))}
              disabled={zoom >= 8}
            >
              Zoom in
            </button>
            <button
              onClick={() => setZoom(Math.max(1, zoom / 1.5))}
              disabled={zoom <= 1}
            >
              Zoom out
            </button>
            <button
              aria-label="Pan left"
              onClick={() => setPan([pan[0] - 0.15 / zoom, pan[1]])}
            >
              ←
            </button>
            <button
              aria-label="Pan right"
              onClick={() => setPan([pan[0] + 0.15 / zoom, pan[1]])}
            >
              →
            </button>
            <button
              aria-label="Pan up"
              onClick={() => setPan([pan[0], pan[1] - 0.15 / zoom])}
            >
              ↑
            </button>
            <button
              aria-label="Pan down"
              onClick={() => setPan([pan[0], pan[1] + 0.15 / zoom])}
            >
              ↓
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan([0, 0]);
              }}
            >
              Fit view
            </button>
            <span>{zoom.toFixed(1)}×</span>
          </div>
          <svg
            className="tracer-surface"
            data-testid="trace-surface"
            aria-label="Campus tracing surface"
            role="img"
            viewBox={viewBox}
            onPointerDown={clicked}
            onPointerMove={(event) => {
              if (drag.current !== undefined) {
                const point = coordinates(event);
                setPoints((previous) =>
                  previous.map((p, i) => (i === drag.current ? point : p)),
                );
              }
            }}
            onPointerUp={() => {
              drag.current = undefined;
            }}
            onPointerCancel={() => {
              drag.current = undefined;
            }}
          >
            {view === 'image' && image && (
              <image
                href={image.url}
                width={image.width}
                height={image.height}
              />
            )}
            {view === 'schematic' ? (
              <>
                {seed.areas.map(
                  (a) =>
                    a.schematicBoxPx && (
                      <g key={a.id}>
                        <rect
                          x={a.schematicBoxPx[0]}
                          y={a.schematicBoxPx[1]}
                          width={a.schematicBoxPx[2]}
                          height={a.schematicBoxPx[3]}
                          fill="#7fd6ab"
                          fillOpacity=".1"
                          stroke="#739a88"
                        />
                        {labels && (
                          <text
                            x={a.schematicBoxPx[0] + a.schematicBoxPx[2] / 2}
                            y={a.schematicBoxPx[1] + a.schematicBoxPx[3] / 2}
                            fontSize="10"
                          >
                            {a.label}
                          </text>
                        )}
                      </g>
                    ),
                )}
                {seed.buildings.map(
                  (b) =>
                    b.schematicBoxPx && (
                      <g key={b.id} data-testid={`schematic-${b.id}`}>
                        <rect
                          x={b.schematicBoxPx[0]}
                          y={b.schematicBoxPx[1]}
                          width={b.schematicBoxPx[2]}
                          height={b.schematicBoxPx[3]}
                          fill="#82bbec"
                          fillOpacity=".2"
                          stroke="#82bbec"
                          strokeDasharray="6 4"
                        />
                        {labels && (
                          <text
                            x={b.schematicBoxPx[0] + b.schematicBoxPx[2] / 2}
                            y={b.schematicBoxPx[1] + b.schematicBoxPx[3] / 2}
                            fontSize="19"
                          >
                            {b.id} · {b.label}
                          </text>
                        )}
                      </g>
                    ),
                )}
                {seed.gates.map(
                  (g) =>
                    g.schematicPx && (
                      <g key={g.id}>
                        <circle
                          cx={g.schematicPx[0]}
                          cy={g.schematicPx[1]}
                          r="5"
                          fill="#e5c373"
                        />
                        {labels && (
                          <text
                            x={g.schematicPx[0]}
                            y={g.schematicPx[1] + 20}
                            fontSize="13"
                          >
                            {g.label}
                          </text>
                        )}
                      </g>
                    ),
                )}
              </>
            ) : (
              <>
                {campus.areas.map((a) =>
                  displayPolygon(a.id, a.polygon, a.confidence, a.label),
                )}
                {campus.buildings.map((b) =>
                  displayPolygon(b.id, b.footprint, b.confidence, b.id),
                )}
                {displayPolygon(
                  'boundary',
                  campus.boundary.polygon,
                  campus.boundary.confidence,
                  'Boundary',
                )}
                {campus.gates.map((g) => {
                  if (!g.position || (view === 'image' && !calibration))
                    return null;
                  const p = geometry([g.position])[0]!;
                  return (
                    <g key={g.id}>
                      <circle
                        cx={p[0]}
                        cy={p[1]}
                        r={size}
                        fill={colors[g.confidence]}
                      />
                      {labels && (
                        <text x={p[0]} y={p[1] + size * 3} fontSize={size * 2}>
                          {g.label}
                        </text>
                      )}
                    </g>
                  );
                })}
                {campus.buildings.flatMap((building) =>
                  building.entries.map((entry) => {
                    if (!entry.position || (view === 'image' && !calibration))
                      return null;
                    const p = geometry([entry.position])[0]!;
                    return (
                      <g key={`${building.id}:${entry.id}`}>
                        <rect
                          x={p[0] - size}
                          y={p[1] - size}
                          width={size * 2}
                          height={size * 2}
                          stroke="#e5c373"
                          fill="none"
                        />
                        {labels && (
                          <text
                            x={p[0]}
                            y={p[1] - size * 2}
                            fontSize={size * 1.5}
                          >
                            {building.id} · {entry.label ?? entry.id}
                          </text>
                        )}
                      </g>
                    );
                  }),
                )}
              </>
            )}
            {view === 'image' && (
              <>
                {origin && (
                  <g>
                    <circle
                      cx={origin[0]}
                      cy={origin[1]}
                      r={size}
                      stroke="#fff"
                      fill="none"
                    />
                    <text
                      x={origin[0]}
                      y={origin[1] - size * 2}
                      fontSize={size * 2}
                    >
                      G5 origin
                    </text>
                  </g>
                )}
                {references.map((ref, i) => (
                  <line
                    key={i}
                    x1={ref.from[0]}
                    y1={ref.from[1]}
                    x2={ref.to[0]}
                    y2={ref.to[1]}
                    stroke="#e5c373"
                    strokeWidth={size / 3}
                  />
                ))}
                {referencePoints.map((p, i) => (
                  <circle key={i} cx={p[0]} cy={p[1]} r={size} fill="#e5c373" />
                ))}
                <polyline
                  points={pointsString(points)}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={size / 3}
                />
                {points.map((p, i) => (
                  <circle
                    key={i}
                    cx={p[0]}
                    cy={p[1]}
                    r={size}
                    fill="#fff"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      drag.current = i;
                      event.currentTarget.ownerSVGElement?.setPointerCapture(
                        event.pointerId,
                      );
                    }}
                  />
                ))}
              </>
            )}
          </svg>
          <section
            className="tracer-validation"
            aria-label="Site plan validation"
          >
            <h2>M2 readiness</h2>
            <p data-testid="site-plan-status">
              {summary.area === null
                ? 'Boundary not traced'
                : `${summary.area.toFixed(1)} m²`}{' '}
              · {summary.missing.length} unresolved exterior items ·{' '}
              {errors.length} errors
            </p>
            <p>
              Required boundary: 42,997.8–58,173.6 m². Interior warnings remain
              for later milestones.
            </p>
            <div className="tracer-legend">
              {Object.entries(colors).map(([name, color]) => (
                <span key={name} style={{ color }}>
                  {name}
                </span>
              ))}
            </div>
            <details>
              <summary>Validation details ({result.issues.length})</summary>
              <ul>
                {result.issues.map((issue, i) => (
                  <li key={i}>
                    {issue.severity} · {issue.path}: {issue.message}
                  </li>
                ))}
              </ul>
            </details>
          </section>
        </div>
      </div>
    </main>
  );
}
