import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { exportNavMesh, init } from 'recast-navigation';
import { generateSoloNavMesh } from 'recast-navigation/generators';
import { loadCampus } from '../src/world/campus-loader';
import { campusPhysics } from '../src/world/interiors';
import {
  NAVMESH_CONFIG,
  navMeshInput,
  navMeshInputHash,
} from '../src/systems/navmesh';

// Offline navmesh build (ARCHITECTURE §4, M9): one multi-level navmesh for the
// campus from the same collider geometry the player walks on.

const root = new URL('../', import.meta.url);
const out = new URL('public/navmesh/', root);

try {
  await init();
  const campus = loadCampus(
    JSON.parse(await readFile(new URL('data/campus.json', root), 'utf8')),
    { mode: 'site-plan' },
  ).campus;
  const physics = campusPhysics(campus);
  const input = navMeshInput(campus, physics.colliders, physics.groundHoles);
  const inputHash = navMeshInputHash(input.positions, input.indices);
  const started = Date.now();
  const result = generateSoloNavMesh(
    input.positions,
    input.indices,
    NAVMESH_CONFIG,
  );
  if (!result.success)
    throw new Error(`Navmesh generation failed: ${result.error}`);
  const data = exportNavMesh(result.navMesh);
  await mkdir(out, { recursive: true });
  await writeFile(new URL('campus.bin', out), data);
  const meta = {
    inputHash,
    config: NAVMESH_CONFIG,
    inputTriangles: input.indices.length / 3,
    bytes: data.length,
  };
  await writeFile(
    new URL('campus.json', out),
    JSON.stringify(meta, null, 2) + '\n',
  );
  console.log(
    `Wrote ${fileURLToPath(new URL('campus.bin', out))} (${data.length} bytes, ${meta.inputTriangles} input triangles, ${Date.now() - started} ms).`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
