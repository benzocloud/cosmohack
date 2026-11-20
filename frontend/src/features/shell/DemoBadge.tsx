import { Badge } from '@/components/ui/badge';
import { EMPTY } from '@/lib/labels';
import { FlaskConical } from 'lucide-react';

/**
 * Бейдж «Демонстрационные данные» — обязателен в mock-режиме
 * (design-brief §8, corrections §5); скрывается вне моков.
 */
export function DemoBadge({ demo }: { demo: boolean }) {
  if (!demo) return null;
  return (
    <Badge
      variant="outline"
      data-testid="demo-badge"
      className="shrink-0 whitespace-nowrap border-border-strong text-ink-secondary"
    >
      <FlaskConical aria-hidden />
      <span className="sr-only sm:not-sr-only">{EMPTY.demo}</span>
      <span className="sm:hidden" aria-hidden="true">
        Демо
      </span>
    </Badge>
  );
}
