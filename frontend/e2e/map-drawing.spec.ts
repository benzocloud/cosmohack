import { expect, test } from '@playwright/test';
import type { Map as MapLibreMap } from 'maplibre-gl';

test('контур по точкам с проверкой рёбер, отменой и сохранением', async ({ page }, testInfo) => {
  await page.route('https://basemaps.cartocdn.com/**', (route) =>
    route.fulfill({ json: { version: 8, sources: {}, layers: [] } }),
  );
  await page.route('https://server.arcgisonline.com/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/nXcAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.goto('/panel.html?mock=1');
  const mobile = testInfo.project.name === 'mobile';
  if (mobile) {
    await page
      .getByRole('navigation', { name: 'Основная навигация' })
      .getByRole('button', { name: 'Карта' })
      .click();
  }
  await page.waitForFunction(() => '__agroMap' in globalThis);
  await page.getByRole('button', { name: 'Отметить свою зону' }).click();

  const canvas = page.locator('.maplibregl-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Карта не видна');
  const cx = Math.round(box.x + box.width / 2);
  const cy = Math.round(box.y + box.height * (mobile ? 0.5 : 0.42));
  const finish = page.getByRole('button', { name: 'Завершить контур' });
  const click = (x: number, y: number) =>
    mobile ? page.touchscreen.tap(cx + x, cy + y) : page.mouse.click(cx + x, cy + y);
  const view = () =>
    page.evaluate(() => {
      const map = (globalThis as typeof globalThis & { __agroMap: MapLibreMap }).__agroMap;
      return { longitude: map.getCenter().lng, zoom: map.getZoom() };
    });

  const initialView = await view();
  if (mobile) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: cx, y: cy }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: cx + 60, y: cy }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await view()).longitude).toBeLessThan(initialView.longitude);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: cx - 25, y: cy },
        { x: cx + 25, y: cy },
      ],
    });
    for (const distance of [35, 45, 60]) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: cx - distance, y: cy },
          { x: cx + distance, y: cy },
        ],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await view()).zoom).toBeGreaterThan(initialView.zoom);
  } else {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await view()).longitude).toBeLessThan(initialView.longitude);
  }
  await page.waitForFunction(
    () => !(globalThis as typeof globalThis & { __agroMap: MapLibreMap }).__agroMap.isMoving(),
  );
  await expect(page.getByText('Вершин: 0')).toBeVisible();
  await expect(finish).toBeDisabled();

  await click(-80, -80);
  await expect(page.getByText('Вершин: 1')).toBeVisible();
  await click(80, -80);
  await expect(page.getByText('Вершин: 2')).toBeVisible();
  await click(80, 80);
  await expect(page.getByText('Вершин: 3')).toBeVisible();
  await page.getByRole('button', { name: 'Спутник', exact: true }).click();
  await page.waitForFunction(() => {
    const map = (globalThis as typeof globalThis & { __agroMap: MapLibreMap }).__agroMap;
    return map.getLayer('esri-imagery') && map.getLayer('draw-vertices');
  });
  await click(0, -105);
  await expect(page.getByText(/Ребро пересекает или повторяет границу/)).toBeVisible();
  await expect(page.getByText('Вершин: 3')).toBeVisible();
  await page.waitForFunction(() => {
    const map = (globalThis as typeof globalThis & { __agroMap: MapLibreMap }).__agroMap;
    return map
      .queryRenderedFeatures({ layers: ['draw-guides'] })
      .some((feature) => feature.properties.blocked);
  });

  await click(115, 35);
  await expect(page.getByText('Вершин: 4')).toBeVisible();
  await expect(page.getByText(/Линия замыкания пересекает или повторяет границу/)).toBeVisible();
  await expect(finish).toBeDisabled();

  await page.getByRole('button', { name: 'Отменить точку' }).click();
  await expect(page.getByText('Вершин: 3')).toBeVisible();
  await click(-80, 80);
  await expect(finish).toBeEnabled();
  if (mobile) await click(-80, -80);
  else await finish.click();

  await expect(page.getByRole('dialog')).toBeVisible();
  const saved = page.waitForResponse(
    (response) => response.url().endsWith('/api/areas') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Только сохранить' }).click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByRole('dialog')).toBeHidden();
});
