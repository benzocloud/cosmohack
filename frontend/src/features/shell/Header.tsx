import { useStartAnalysis } from '@/api/mutations';
import { useArea, useJob, useLimits } from '@/api/queries';
import type { Period } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { analysisAreaError, validatePeriod } from '@/lib/geo';
import { jobStatusText } from '@/lib/job-status';
import { SCAFFOLD } from '@/lib/labels';
import { useSelection } from '@/store/selection';
import { useUi } from '@/store/ui';
import { CalendarDays } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DemoBadge } from './DemoBadge';

/**
 * Шапка 56px на десктопе/планшете, 48px на телефоне (frontend-plan §6.1, §6.3).
 * Период и запуск анализа используют тот же API, что и диалог добавления участка.
 */
export function Header({ areaCardVisible = false }: { areaCardVisible?: boolean }) {
  const demoMode = useUi((s) => s.demoMode);
  const selectedAreaId = useSelection((s) => s.selectedAreaId);
  const areaQuery = useArea(selectedAreaId);
  const limitsQuery = useLimits();
  const start = useStartAnalysis();
  const [period, setPeriod] = useState<Period | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const trackedJobId = jobId ?? areaQuery.data?.activeJob?.id ?? null;
  const { job } = useJob(trackedJobId);

  useEffect(() => {
    if (selectedAreaId !== areaQuery.data?.id) {
      setPeriod(null);
      setJobId(null);
    }
  }, [selectedAreaId, areaQuery.data?.id]);

  useEffect(() => {
    if (!areaQuery.data) return;
    setPeriod(areaQuery.data.period ?? areaQuery.data.lastResult?.period ?? null);
  }, [areaQuery.data]);

  const selectedPeriod = period ?? areaQuery.data?.period ?? areaQuery.data?.lastResult?.period;
  const periodValidation = selectedPeriod
    ? validatePeriod(selectedPeriod.from, selectedPeriod.to, limitsQuery.data ?? null)
    : { ok: false };
  const areaError = areaQuery.data
    ? analysisAreaError(areaQuery.data.geometry, limitsQuery.data ?? null)
    : null;
  const canRun = Boolean(
    selectedAreaId &&
      selectedPeriod?.from &&
      selectedPeriod.to &&
      periodValidation.ok &&
      !areaError,
  );
  const periodError =
    selectedAreaId && selectedPeriod?.from && selectedPeriod.to && !periodValidation.ok
      ? periodValidation.error
      : null;
  const announcement =
    (areaCardVisible ? null : areaError) ??
    periodError ??
    (start.isError ? 'Не удалось запустить анализ. Повторите попытку.' : null);
  const status = jobStatusText(job);

  const updatePeriod = (field: keyof Period, value: string) => {
    setPeriod((current) => ({
      from: current?.from ?? selectedPeriod?.from ?? '',
      to: current?.to ?? selectedPeriod?.to ?? '',
      [field]: value,
    }));
  };

  const runAnalysis = () => {
    if (!selectedAreaId || !selectedPeriod || !canRun || !periodValidation.ok || start.isPending)
      return;
    setJobId(null);
    start.mutate(
      { areaId: selectedAreaId, period: selectedPeriod },
      { onSuccess: ({ jobId: nextJobId }) => setJobId(nextJobId) },
    );
  };

  return (
    <header className="shrink-0 bg-app px-3 sm:px-4">
      <div className="flex h-14 items-center gap-2 sm:gap-3 lg:h-16 xl:grid xl:grid-cols-[1fr_auto_1fr]">
        <a
          href="/"
          className="tap-target flex shrink-0 items-center rounded-md xl:justify-self-start"
        >
          <img
            src="/brand/benzolens-horizontal-primary.svg"
            width={136}
            height={41}
            className="h-auto w-24 min-[360px]:w-[112px] sm:w-[136px] lg:w-40"
            alt={SCAFFOLD.appTitle}
          />
        </a>

        <div className="mx-auto hidden min-w-0 items-center gap-3 rounded-full bg-surface-muted px-3 py-1 lg:flex">
          <span className="max-w-52 truncate text-sm font-medium text-ink-secondary">
            {areaQuery.data?.name ??
              (selectedAreaId ? 'Выбранный участок' : SCAFFOLD.noAreaSelected)}
          </span>
          <div className="flex items-center gap-2 text-2xs text-ink-tertiary">
            <CalendarDays className="size-5 shrink-0" aria-hidden />
            <Input
              type="date"
              value={selectedPeriod?.from ?? ''}
              min={limitsQuery.data?.minDate}
              onChange={(event) => updatePeriod('from', event.target.value)}
              aria-label="Период анализа с"
              className="block h-8 w-[136px] bg-surface text-2xs"
              disabled={!selectedAreaId}
            />
            <span>—</span>
            <Input
              type="date"
              value={selectedPeriod?.to ?? ''}
              min={limitsQuery.data?.minDate}
              onChange={(event) => updatePeriod('to', event.target.value)}
              aria-label="Период анализа по"
              className="block h-8 w-[136px] bg-surface text-2xs"
              disabled={!selectedAreaId}
            />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1 sm:gap-2 xl:justify-self-end">
          <DemoBadge demo={demoMode} />
          <Button
            size="sm"
            disabled={
              !canRun ||
              start.isPending ||
              Boolean(job && (job.status === 'queued' || job.status === 'running'))
            }
            onClick={runAnalysis}
            className="min-h-10 px-2 sm:px-3"
          >
            {start.isPending
              ? 'Запуск…'
              : job && (job.status === 'queued' || job.status === 'running')
                ? status.text
                : SCAFFOLD.runAnalysis}
          </Button>
        </div>
      </div>
      {announcement && (
        <p role="alert" className="pb-2 text-xs text-verdict-confirmed sm:text-right">
          {announcement}
        </p>
      )}
    </header>
  );
}
