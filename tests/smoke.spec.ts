import { expect, test } from '@playwright/test';

test('renders the scene and live dev metrics without browser errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'M0 · Scene scaffold' }),
  ).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Development overlay' }),
  ).toBeVisible();
  await expect
    .poll(async () => Number(await page.getByTestId('fps').textContent()))
    .toBeGreaterThan(0);
  await expect
    .poll(async () =>
      Number(await page.getByTestId('draw-calls').textContent()),
    )
    .toBe(2);
  await expect(page.getByTestId('triangles')).toHaveText('14');
  const spin = page.getByRole('checkbox', { name: 'Spin cube' });
  await spin.uncheck();
  await expect(spin).not.toBeChecked();
  // Hide the changing DOM metrics when comparing the underlying WebGL pixels.
  const screenshotOptions = { style: '.dev-overlay { visibility: hidden; }' };
  const pausedFrame = await page
    .locator('canvas')
    .screenshot(screenshotOptions);
  expect(
    (await page.locator('canvas').screenshot(screenshotOptions)).equals(
      pausedFrame,
    ),
  ).toBe(true);
  await spin.check();
  await expect(spin).toBeChecked();
  await expect
    .poll(async () =>
      (await page.locator('canvas').screenshot(screenshotOptions)).equals(
        pausedFrame,
      ),
    )
    .toBe(false);
  console.log(
    'M0 renderer metrics:',
    await page.getByRole('complementary').innerText(),
  );
  await page.screenshot({ path: 'test-results/m0-scaffold.png' });
  await page
    .getByRole('checkbox', { name: 'Campus data', exact: true })
    .check();
  await expect(page.getByTestId('campus-validation-status')).toHaveText(
    /Seed loaded · 6 blocks · 4 gates · \d+ warnings/,
  );
  await page.getByText('Validation warnings', { exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Campus data validation' }),
  ).toContainText('boundary.polygon: Unresolved polygon');
  await page.screenshot({ path: 'test-results/m1-data-foundation.png' });
  expect(errors).toEqual([]);
});
