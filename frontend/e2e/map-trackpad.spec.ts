import { expect, test } from '@playwright/test';
import type { Map as MapLibreMap } from 'maplibre-gl';

for (const platform of ['MacIntel', 'Win32', 'Linux x86_64']) {
  test(`жесты карты на ${platform}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile');
    await page.addInitScript((value) => {
      Object.defineProperty(navigator, 'platform', { value });
    }, platform);
    await page.route('https://basemaps.cartocdn.com/**', (route) =>
      route.fulfill({ json: { version: 8, sources: {}, layers: [] } }),
    );
    await page.goto('/panel.html?mock=1');
    await page.waitForFunction(() => '__agroMap' in globalThis);

    const view = () =>
      page.evaluate(() => {
        const map = (globalThis as typeof globalThis & { __agroMap: MapLibreMap }).__agroMap;
        const { lng, lat } = map.getCenter();
        return { lng, lat, zoom: map.getZoom() };
      });
    const canvas = page.locator('.maplibregl-canvas');
    const initial = await view();
    await canvas.dispatchEvent('wheel', { deltaX: 60, deltaMode: 0 });
    expect((await view()).lng).toBeGreaterThan(initial.lng);

    await canvas.dispatchEvent('wheel', { deltaX: -60, deltaY: 40, deltaMode: 0 });
    const panned = await view();
    expect(panned.lng).toBeCloseTo(initial.lng, 8);
    expect(panned.lat).toBeLessThan(initial.lat);
    expect(panned.zoom).toBe(initial.zoom);

    await page.getByRole('button', { name: 'Отметить свою зону' }).click();
    await canvas.dispatchEvent('wheel', { deltaX: 60, deltaY: 40, deltaMode: 0 });
    const drawingView = await view();
    expect(drawingView.lng).toBeGreaterThan(panned.lng);
    expect(drawingView.lat).toBeLessThan(panned.lat);
    expect(drawingView.zoom).toBe(panned.zoom);
    await canvas.dispatchEvent('wheel', { ctrlKey: true, deltaY: -40, deltaMode: 0 });
    await expect.poll(async () => (await view()).zoom).toBeGreaterThan(drawingView.zoom);
    await expect(page.getByText('Вершин: 0')).toBeVisible();
    await page.waitForFunction(
      () => !(globalThis as typeof globalThis & { __agroMap: MapLibreMap }).__agroMap.isMoving(),
    );
    const zoomedView = await view();
    await page.keyboard.press('Escape');

    if (platform === 'MacIntel') {
      await canvas.dispatchEvent('wheel', { deltaY: 40, deltaMode: 0 });
      const scrolled = await view();
      expect(scrolled.lat).toBeLessThan(zoomedView.lat);
      expect(scrolled.zoom).toBe(zoomedView.zoom);
      await canvas.dispatchEvent('wheel', { ctrlKey: true, deltaY: -40, deltaMode: 0 });
    } else {
      await canvas.dispatchEvent('wheel', { deltaY: -40, deltaMode: 0 });
    }
    await expect.poll(async () => (await view()).zoom).toBeGreaterThan(zoomedView.zoom);
  });
}
