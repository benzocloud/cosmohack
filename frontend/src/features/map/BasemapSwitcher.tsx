import { Button } from '@/components/ui/button';
import { MAP_LABELS } from '@/lib/labels';
import { useUi } from '@/store/ui';
import { Map as MapIcon, Satellite } from 'lucide-react';

/**
 * Переключатель подложки в углу карты (уточнение FE-3).
 * Подпись = режим, в который переключаемся; выбор живёт в ui-store + localStorage.
 */
export function BasemapSwitcher() {
  const basemap = useUi((s) => s.basemap);
  const setBasemap = useUi((s) => s.setBasemap);
  const toSatellite = basemap === 'map';

  const label = toSatellite ? MAP_LABELS.basemapToSatellite : MAP_LABELS.basemapToMap;
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-11 shrink-0 border-border bg-surface text-ink shadow-1"
      onClick={() => setBasemap(toSatellite ? 'satellite' : 'map')}
    >
      {toSatellite ? <Satellite aria-hidden /> : <MapIcon aria-hidden />}
      {label}
    </Button>
  );
}
