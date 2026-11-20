import { expect, test } from '@playwright/test';

test('временный сбой скрывается, подсказка об области остаётся', async ({ page }, testInfo) => {
  await page.route('https://basemaps.cartocdn.com/**', (route) =>
    route.fulfill({ json: { version: 8, sources: {}, layers: [] } }),
  );
  await page.route('**/api/areas', (route) => route.fulfill({ json: { areas: [] } }));
  let error = { status: 500, code: 'source_unavailable' };
  await page.route('**/api/regions/contours?*', (route) =>
    route.fulfill({ status: error.status, json: { error: { code: error.code } } }),
  );
  await page.goto('/panel.html');
  if (testInfo.project.name === 'mobile') {
    await page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('button', { name: 'Карта' })
      .click();
  }
  await page.waitForFunction(() => '__agroMap' in globalThis);
  await page.clock.install();

  const search = page
    .getByRole('button', { name: 'Найти контуры в этой области', exact: true })
    .first();
  const basemap = page.getByRole('button', { name: 'Спутник', exact: true });
  const [searchBox, basemapBox] = await Promise.all([search.boundingBox(), basemap.boundingBox()]);
  if (!searchBox || !basemapBox) throw new Error('Панель карты не видна');
  expect(searchBox.y).toBeCloseTo(basemapBox.y);
  expect(searchBox.height).toBeCloseTo(basemapBox.height);
  expect(basemapBox.height).toBeGreaterThanOrEqual(44);
  expect(basemapBox.x - (searchBox.x + searchBox.width)).toBeGreaterThanOrEqual(8);
  const retry = page.getByRole('button', { name: 'Повторить поиск контуров', exact: true });
  const message = page.getByText('Сервис контуров временно недоступен', { exact: true });
  await search.click();
  await expect(message).toBeVisible();
  await expect(page.locator('[data-sonner-toaster]')).toHaveAttribute('data-x-position', 'center');
  await expect(page.locator('[data-sonner-toaster]')).toHaveAttribute('data-y-position', 'top');

  await page.getByRole('button', { name: 'Close toast' }).click();
  await expect(message).toBeHidden();
  await retry.click();
  await expect(message).toBeVisible();
  await page.clock.fastForward(8_000);
  await expect(message).toBeHidden();
  await expect(retry).toBeEnabled();

  error = { status: 422, code: 'limit_exceeded' };
  await retry.click();
  const hint = page.getByRole('alert').filter({ hasText: 'Приблизьте карту' });
  await expect(hint).toBeVisible();
  await page.clock.fastForward(8_000);
  await expect(hint).toBeVisible();
  await expect(message).toBeHidden();
});
