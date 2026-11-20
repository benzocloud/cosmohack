import { Button } from '@/components/ui/button';
import type { PolygonValidation } from '@/lib/geo';
import { MAP_LABELS } from '@/lib/labels';

export function DrawToolbar({
  validation,
  vertexCount,
  vertexLimitReached,
  warning,
  onUndo,
  onFinish,
  onCancel,
}: {
  validation: PolygonValidation;
  vertexCount: number;
  vertexLimitReached: boolean;
  warning?: string | null;
  onUndo: () => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute bottom-4 left-1/2 z-20 flex w-[calc(100%-24px)] max-w-md -translate-x-1/2 flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-2xs text-ink-secondary">
        <span>{vertexCount < 3 ? MAP_LABELS.drawStartHint : MAP_LABELS.drawHint}</span>
        <span className="whitespace-nowrap">{MAP_LABELS.vertexCount(vertexCount)}</span>
      </div>
      {vertexCount >= 3 && !validation.ok && validation.error && (
        <p className="text-2xs text-verdict-confirmed">{validation.error}</p>
      )}
      {vertexLimitReached && (
        <p className="text-2xs text-ink-secondary">{MAP_LABELS.vertexLimitReached}</p>
      )}
      {warning && (
        <p className="text-2xs text-verdict-confirmed" role="alert">
          {warning}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="min-h-11" disabled={!validation.ok} onClick={onFinish}>
          {MAP_LABELS.finishDraw}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={vertexCount === 0}
          onClick={onUndo}
        >
          {MAP_LABELS.undoVertex}
        </Button>
        <Button variant="ghost" size="sm" className="min-h-11" onClick={onCancel}>
          {MAP_LABELS.cancelDraw}
        </Button>
      </div>
    </div>
  );
}
