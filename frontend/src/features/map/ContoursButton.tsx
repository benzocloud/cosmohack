import type { ContoursResult } from '@/api/adapters/contours';
import { isAppError } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EMPTY, MAP_LABELS, SCAFFOLD } from '@/lib/labels';
import { Info, LoaderCircle, Search } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Кнопка поиска контуров со состояниями плана §6.4:
 * idle / loading / empty / failed / ok / stale. Запрос делает MapView по кнопке;
 * после сдвига карты состояние становится stale.
 */
export function ContoursButton({
  loading,
  stale,
  result,
  error,
  onSearch,
  onDraw,
}: {
  loading: boolean;
  stale: boolean;
  result: ContoursResult | null;
  error?: unknown;
  onSearch: () => void;
  onDraw: () => void;
}) {
  const status = error ? 'failed' : (result?.status ?? null);
  const errorCode = isAppError(error) ? error.code : undefined;
  const searchAreaTooLarge = errorCode === 'limit_exceeded';
  const okResult = result?.status === 'ok' ? result : null;

  useEffect(() => {
    if (!error || searchAreaTooLarge || stale || loading) return;
    const id = toast.error(
      errorCode === 'source_unavailable' ? MAP_LABELS.sourceUnavailable : EMPTY.contoursFailed,
      {
        description: MAP_LABELS.retryHint,
        closeButton: true,
        duration: 7_000,
        richColors: true,
      },
    );
    return () => {
      toast.dismiss(id);
    };
  }, [error, errorCode, searchAreaTooLarge, stale, loading]);

  const label = loading
    ? MAP_LABELS.searching
    : stale && status !== null
      ? MAP_LABELS.stale
      : status === 'empty'
        ? EMPTY.contoursNotFound
        : status === 'failed'
          ? MAP_LABELS.retrySearch
          : SCAFFOLD.findContours;

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-surface p-1.5 shadow-1">
      <div className="flex items-start gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal py-2"
              disabled={loading}
              onClick={onSearch}
            >
              {loading ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <Search aria-hidden />
              )}
              {label}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{MAP_LABELS.searchTooltip}</TooltipContent>
        </Tooltip>
      </div>

      {/* ok: N контуров + примечание о неполноте каталога по ⓘ */}
      {okResult && !stale && (
        <div className="flex items-center justify-between gap-2 px-1 text-2xs text-ink-secondary">
          <span>{MAP_LABELS.contoursCount(okResult.contours.length)}</span>
          {okResult.coverageNote && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 min-h-6 min-w-6"
                  aria-label={okResult.coverageNote}
                >
                  <Info className="size-3.5" aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{okResult.coverageNote}</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}

      {/* empty: не ошибка — предлагаем нарисовать свой участок */}
      {status === 'empty' && !stale && (
        <Button
          variant="outline"
          size="sm"
          className="h-auto min-h-11 whitespace-normal py-2"
          onClick={onDraw}
        >
          {SCAFFOLD.drawArea}
        </Button>
      )}

      {searchAreaTooLarge && !stale && !loading && (
        <p className="px-1 text-2xs text-verdict-confirmed" role="alert">
          {MAP_LABELS.searchAreaTooLarge}
        </p>
      )}
    </div>
  );
}
