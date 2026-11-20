import { expect, test } from '@playwright/test';

const panelEntry = /\/(?:src\/main\.tsx|assets\/panel-[^/]+\.js)(?:\?|$)/;

test('загрузка панели и состояние до выбора участка', async ({ page }, testInfo) => {
  await page.route('https://basemaps.cartocdn.com/**', (route) =>
    route.fulfill({ json: { version: 8, sources: {}, layers: [] } }),
  );

  const period = { from: '2024-03-01', to: '2024-03-02' };
  const area = {
    id: 'sample',
    name: 'Участок без наблюдений',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [39, 45],
          [39.01, 45],
          [39, 45.01],
          [39, 45],
        ],
      ],
    },
    source: { kind: 'drawn' },
    created_at: '2024-03-02T12:00:00Z',
    shown_result: {
      result_version: 'v1',
      period,
      computed_at: '2024-03-02T12:00:00Z',
      status: 'insufficient_data',
    },
  };
  await page.route('**/api/config', (route) => route.fulfill({ status: 404 }));
  await page.route('**/api/areas', (route) => route.fulfill({ json: { areas: [area] } }));
  await page.route('**/api/areas/sample', (route) => route.fulfill({ json: area }));
  let baseline: number | null = null;
  await page.route('**/api/areas/sample/series?*', (route) =>
    route.fulfill({
      json: {
        area_id: area.id,
        result_version: 'v1',
        period,
        status: 'insufficient_data',
        method: 'no_estimate',
        missing_count: 1,
        series: [{ date: period.from, value: null, state: 'missing', baseline }],
      },
    }),
  );
  await page.route('**/api/areas/sample/events?*', (route) =>
    route.fulfill({ json: { area_id: area.id, result_version: 'v1', events: [] } }),
  );

  let resumeEntry: (() => void) | undefined;
  const entry = new Promise<void>((resolve) => {
    resumeEntry = resolve;
  });
  await page.route(panelEntry, async (route) => {
    await entry;
    await route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/panel.html', { waitUntil: 'commit' });
  const loading = page.getByRole('status').filter({ hasText: 'Загружаем панель' });
  try {
    await expect(loading).toBeVisible();
    await expect(loading.locator('.panel-spinner')).toHaveCSS('animation-name', 'none');
  } finally {
    resumeEntry?.();
  }
  await expect(loading).toBeHidden();

  const areaButton = page.getByRole('button', { name: /Участок без наблюдений/ });
  const nav = page.getByRole('navigation', { name: 'Основная навигация' });
  const mobile = testInfo.project.name === 'mobile';
  if (mobile) {
    await nav.getByRole('button', { name: 'Анализ', exact: true }).click();
  } else {
    await expect(page.getByRole('heading', { name: 'Выберите участок' })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Динамика NDVI' })).toBeVisible();
  await expect(page.getByText(/После выбора участка здесь появятся/)).toBeVisible();
  await expect(page.getByLabel('Загрузка результата')).toHaveCount(0);

  if (mobile) await nav.getByRole('button', { name: 'Участки', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Нарисовать участок' })).toHaveCSS(
    'border-radius',
    '8px',
  );
  await areaButton.click();
  if (mobile) await nav.getByRole('button', { name: 'Анализ', exact: true }).click();
  const noData = page.getByText('Нет пригодных спутниковых данных за выбранный период');
  const chart = page.locator('canvas[data-zr-dom-id]');
  await expect(noData).toBeVisible();
  await expect(chart).toHaveCount(0);

  baseline = 0.45;
  await page.reload();
  if (mobile) await nav.getByRole('button', { name: 'Анализ', exact: true }).click();
  await expect(noData).toBeVisible();
  await expect(chart).toHaveCount(1);
});

test('ошибка загрузки модуля заменяет стартовый индикатор', async ({ page }) => {
  await page.route(panelEntry, (route) => route.abort());
  await page.goto('/panel.html');
  await expect(page.getByRole('status')).toHaveText(
    'Не удалось загрузить панель. Обновите страницу.',
  );
  await expect(page.locator('.panel-spinner')).toHaveCount(0);
});
