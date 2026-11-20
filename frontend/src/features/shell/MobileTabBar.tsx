import { SCAFFOLD } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { type MobileTab, useUi } from '@/store/ui';
import { LineChart, Map as MapIcon, Rows3 } from 'lucide-react';

const TABS: { id: MobileTab; label: string; Icon: typeof MapIcon }[] = [
  { id: 'areas', label: SCAFFOLD.mobileTabAreas, Icon: Rows3 },
  { id: 'map', label: SCAFFOLD.mobileTabMap, Icon: MapIcon },
  { id: 'analysis', label: SCAFFOLD.mobileTabAnalysis, Icon: LineChart },
];

/**
 * Нижняя навигация телефона: Участки · Карта · Анализ (frontend-plan §6.3).
 * Выбор участка, события и даты сохраняется при переключении — они живут в URL/stores.
 */
export function MobileTabBar() {
  const mobileTab = useUi((s) => s.mobileTab);
  const setMobileTab = useUi((s) => s.setMobileTab);

  return (
    <nav
      aria-label={SCAFFOLD.mainNavigation}
      className="flex shrink-0 bg-surface-muted pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      {TABS.map(({ id, label, Icon }) => {
        const active = mobileTab === id;
        return (
          <button
            key={id}
            type="button"
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            onClick={() => setMobileTab(id)}
            className={cn(
              'tap-target flex flex-1 flex-col items-center justify-center gap-1 text-2xs font-medium',
              active ? 'text-action' : 'text-ink-tertiary',
            )}
          >
            <span
              className={cn(
                'grid h-7 w-14 place-items-center rounded-full',
                active && 'bg-action-soft',
              )}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            {label}
          </button>
        );
      })}
    </nav>
  );
}
