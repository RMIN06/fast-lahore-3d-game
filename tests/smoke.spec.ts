import { expect, test } from '@playwright/test';

test('renders the M3 campus greybox overview within budget without browser errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'M4 · Player controller' }),
  ).toBeVisible();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  // The M3 overview is the free debug camera from M4 onwards.
  await expect(page.getByTestId('player-mode')).toHaveText('first');
  await page.getByRole('checkbox', { name: 'Free camera (orbit)' }).check();
  await expect(page.getByTestId('player-mode')).toHaveText('free');
  await expect(
    page.getByRole('complementary', { name: 'Development overlay' }),
  ).toBeVisible();
  await expect
    .poll(async () => Number(await page.getByTestId('fps').textContent()))
    .toBeGreaterThan(0);

  // Performance budget (ARCHITECTURE.md §7, outdoors).
  await expect
    .poll(async () =>
      Number(await page.getByTestId('draw-calls').textContent()),
    )
    .toBeGreaterThan(10);
  expect(
    Number(await page.getByTestId('draw-calls').textContent()),
  ).toBeLessThanOrEqual(400);
  expect(
    Number(await page.getByTestId('triangles').textContent()),
  ).toBeLessThanOrEqual(1_500_000);

  // M3 acceptance: floor counts per block, unknown counts flagged as placeholder.
  const floors = {
    A: '1 above ground · floors unknown (placeholder)',
    B: '3 above ground + 1 basement',
    C: '3 above ground + 1 basement',
    D: '3 above ground + 1 basement',
    E: '1 above ground · floors unknown (placeholder)',
    F: '4 above ground + 2 basements',
  };
  for (const [id, text] of Object.entries(floors))
    await expect(page.getByTestId(`floors-${id}`)).toHaveText(text);
  await expect(page.getByText('Gate-5', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/m3-greybox.png' });

  // Debug toggles change the rendered image; labels can be hidden.
  const hide = { style: '.dev-overlay, .world-label { visibility: hidden; }' };
  const coloured = await canvas.screenshot(hide);
  await page.getByRole('checkbox', { name: 'Confidence colors' }).uncheck();
  await expect
    .poll(async () => (await canvas.screenshot(hide)).equals(coloured))
    .toBe(false);
  const neutral = await canvas.screenshot(hide);
  await page.getByRole('checkbox', { name: 'Collision shapes' }).check();
  await expect
    .poll(async () => (await canvas.screenshot(hide)).equals(neutral))
    .toBe(false);
  await page.getByRole('checkbox', { name: 'Labels' }).uncheck();
  await expect(page.getByTestId('floors-A')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/m3-neutral-colliders.png' });

  // Orbit camera responds to dragging.
  const before = await canvas.screenshot(hide);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(async () => (await canvas.screenshot(hide)).equals(before))
    .toBe(false);

  await page
    .getByRole('checkbox', { name: 'Campus data', exact: true })
    .check();
  await expect(page.getByTestId('campus-validation-status')).toHaveText(
    /Site plan loaded · 6 blocks · 4 gates · 16 areas · \d+ warnings/,
  );
  console.log(
    'M3 renderer metrics:',
    await page.getByRole('complementary').innerText(),
  );
  expect(errors).toEqual([]);
});
