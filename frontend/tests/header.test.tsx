import { adaptLimits } from '@/api/adapters/limits';
import { AppShell } from '@/app/AppShell';
import { Header } from '@/features/shell/Header';
import { SCAFFOLD } from '@/lib/labels';
import { useSelection } from '@/store/selection';
import { useUi } from '@/store/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/map/MapView', () => ({ MapView: () => null }));

const renderHeader = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Header />
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useSelection.setState({ selectedAreaId: null });
  useUi.setState({ demoMode: false, pendingStart: null });
});

describe('Header', () => {
  it('показывает название приложения и пустое состояние участка', () => {
    renderHeader();
    expect(screen.getByRole('img', { name: SCAFFOLD.appTitle })).toBeTruthy();
    expect(screen.getByText(SCAFFOLD.noAreaSelected)).toBeTruthy();
  });

  it('показывает DemoBadge только в mock-режиме', () => {
    renderHeader();
    expect(screen.queryByTestId('demo-badge')).toBeNull();
    act(() => useUi.getState().setDemoMode(true));
    expect(screen.getByTestId('demo-badge')).toBeTruthy();
  });

  it.each([
    { viewport: 'desktop', location: 'карточка' },
    { viewport: 'mobile', location: 'шапка' },
  ])('показывает ограничение площади один раз: $location', ({ viewport }) => {
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: viewport === 'desktop',
      media,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
    });
    const area = {
      id: 'small-area',
      name: 'Участок 2',
      source: { kind: 'drawn', label: 'Нарисован вручную' },
      period: { from: '2026-05-21', to: '2026-11-20' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0.00058, 0],
            [0.00058, 0.00058],
            [0, 0.00058],
            [0, 0],
          ],
        ],
      },
    };
    queryClient.setQueryData(['area', area.id], area);
    queryClient.setQueryData(['areas'], [area]);
    queryClient.setQueryData(
      ['limits'],
      adaptLimits({ area_ha_min: 0.5, area_ha_max: 25000, vertices_max: 512 }),
    );
    useSelection.setState({ selectedAreaId: area.id });
    useUi.setState({ pendingStart: { areaId: area.id, period: area.period } });
    render(
      <QueryClientProvider client={queryClient}>
        <AppShell />
      </QueryClientProvider>,
    );

    const button = screen.getByRole<HTMLButtonElement>('button', { name: SCAFFOLD.runAnalysis });
    expect(button.disabled).toBe(true);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Для анализа нужно не менее 0,5 га.');
    const owner =
      viewport === 'desktop'
        ? screen.getByRole('region', { name: 'Карточка участка' })
        : screen.getByRole('banner');
    expect(within(owner).getByRole('alert')).toBe(alert);
  });
});
