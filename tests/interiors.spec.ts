import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { startNewGame, teleport } from './helpers';

interface Space {
  id: string;
  code?: string;
  name: string;
}
interface CampusData {
  buildings: {
    id: string;
    floors: { id: string; label: string; spaces: Space[] }[];
  }[];
}
const campus = JSON.parse(
  readFileSync(new URL('../data/campus.json', import.meta.url), 'utf8'),
) as CampusData;
// Blocks with interiors so far (M7 delivers F, D, C, B, A, E in that order).
const enabled = [
  .../INTERIOR_BLOCKS: readonly string\[\] = \[([^\]]*)\]/
    .exec(
      readFileSync(
        new URL('../src/world/interiors.ts', import.meta.url),
        'utf8',
      ),
    )![1]!
    .matchAll(/'([A-Z])'/g),
].map((m) => m[1]!);

// Smaller viewport: software-rendered WebGL is fill-rate bound indoors.
test.use({ viewport: { width: 800, height: 450 } });

for (const id of enabled) {
  test(`${id}: teleport to every room anchor and verify its label; interior budget`, async ({
    page,
  }) => {
    test.setTimeout(480_000);
    // Headless WebGL renders in software: the Low preset (no sun shadows)
    // keeps 100+ teleports fast. Budgets are checked separately below.
    await page.addInitScript(() =>
      localStorage.setItem(
        'fast-lahore.settings.v1',
        JSON.stringify({ graphics: 'low', volume: 0.8 }),
      ),
    );
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await startNewGame(page);
    await page.getByRole('checkbox', { name: 'Labels' }).uncheck();
    const building = campus.buildings.find((b) => b.id === id)!;
    let worstCalls = 0,
      worstTriangles = 0;
    for (const floor of building.floors)
      for (const space of floor.spaces) {
        await teleport(page, `room:${space.id}`);
        // HUD location: block, floor label and the room's code (or name).
        await expect(page.getByTestId('hud-location')).toContainText(
          `${id} · `,
        );
        await expect(page.getByTestId('hud-location')).toContainText(
          floor.label,
        );
        await expect(page.getByTestId('hud-location')).toContainText(
          space.code ?? space.name,
        );
        worstCalls = Math.max(
          worstCalls,
          Number(await page.getByTestId('draw-calls').textContent()),
        );
        worstTriangles = Math.max(
          worstTriangles,
          Number(await page.getByTestId('triangles').textContent()),
        );
      }
    // Interior budget (ARCHITECTURE §7): ≤ 250 draw calls, ≤ 800k triangles.
    expect(worstCalls).toBeLessThanOrEqual(250);
    expect(worstTriangles).toBeLessThanOrEqual(800_000);

    // Placeholders are flagged in the debug view: the generated layout (walls)
    // changes colour with the confidence toggle.
    const canvas = page.locator('canvas');
    const hide = {
      style: '.dev-overlay, header, .hud-clock { visibility: hidden; }',
    };
    const flagged = await canvas.screenshot(hide);
    await page.getByRole('checkbox', { name: 'Confidence colors' }).uncheck();
    await expect
      .poll(async () => (await canvas.screenshot(hide)).equals(flagged))
      .toBe(false);
    await page.screenshot({ path: `test-results/m7-${id}.png` });
    console.log(
      `${id}: worst draw calls ${worstCalls}, triangles ${worstTriangles}`,
    );
    expect(errors).toEqual([]);
  });
}
