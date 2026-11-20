import { area as turfArea } from '@turf/area';
import { kinks } from '@turf/kinks';

import type { Limits } from '@/api/adapters/limits';
import { MAP_LABELS } from '@/lib/labels';

/**
 * Клиентская геометрия полигона (frontend-plan §8, lib/geo).
 * corrections §1: самопересечение и число вершин проверяются ВСЕГДА;
 * площадь и остальные лимиты — только если useLimits вернул не null.
 * Числа лимитов приходят из бэкенда — в коде их нет.
 * Серверная проверка остаётся окончательной (бриф §3A).
 */

export type Vertex = [number, number];
export type Ring = Vertex[];

function turn(a: Vertex, b: Vertex, c: Vertex): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: Vertex, b: Vertex, point: Vertex, cross: number, tolerance: number): boolean {
  return (
    point[0] >= Math.min(a[0], b[0]) - tolerance &&
    point[0] <= Math.max(a[0], b[0]) + tolerance &&
    point[1] >= Math.min(a[1], b[1]) - tolerance &&
    point[1] <= Math.max(a[1], b[1]) + tolerance &&
    Math.abs(cross) <= tolerance * Math.hypot(b[0] - a[0], b[1] - a[1])
  );
}

function segmentsIntersect(a: Vertex, b: Vertex, c: Vertex, d: Vertex, tolerance: number): boolean {
  const abc = turn(a, b, c);
  const abd = turn(a, b, d);
  const cda = turn(c, d, a);
  const cdb = turn(c, d, b);
  return (
    (abc * abd < 0 && cda * cdb < 0) ||
    onSegment(a, b, c, abc, tolerance) ||
    onSegment(a, b, d, abd, tolerance) ||
    onSegment(c, d, a, cda, tolerance) ||
    onSegment(c, d, b, cdb, tolerance)
  );
}

function edgesOverlap(shared: Vertex, a: Vertex, b: Vertex, tolerance: number): boolean {
  const cross = turn(shared, a, b);
  return onSegment(shared, a, b, cross, tolerance) || onSegment(shared, b, a, cross, tolerance);
}

/** Сравнивает добавляемое ребро с открытой цепочкой; замыкание проверяется отдельно. */
export function drawEdgeIntersects(
  ring: Ring,
  to: Vertex,
  closing = false,
  tolerance = 0,
): boolean {
  const last = ring.length - 1;
  if (last < 0) return false;
  const from = ring[last];
  if (Math.hypot(from[0] - to[0], from[1] - to[1]) <= tolerance) return true;

  for (let i = 0; i < last; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    if (i === last - 1) {
      if (edgesOverlap(from, a, to, tolerance)) return true;
    } else if (closing && i === 0) {
      if (edgesOverlap(to, b, from, tolerance)) return true;
    } else if (segmentsIntersect(from, to, a, b, tolerance)) {
      return true;
    }
  }
  return false;
}

/** Замкнутый GeoJSON-полигон из незамкнутого набора вершин. */
export function toPolygonGeometry(ring: Ring): GeoJSON.Polygon {
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed =
    first && last && first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
  return { type: 'Polygon', coordinates: [closed] };
}

/** Закрывает внешнее кольцо перед отправкой GeoJSON на сервер. */
export function closePolygonGeometry(geometry: GeoJSON.Polygon): GeoJSON.Polygon {
  const rings = geometry.coordinates.map((ring, index) => {
    if (index !== 0 || ring.length === 0) return ring;
    const normalized = removeConsecutiveDuplicates(ring);
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) return normalized;
    return [...normalized, first];
  });
  return { ...geometry, coordinates: rings };
}

export function isSelfIntersecting(ring: Ring): boolean {
  const normalized = removeConsecutiveDuplicates(ring);
  if (normalized.length < 4) return false;
  return kinks(toPolygonGeometry(normalized)).features.length > 0;
}

function removeConsecutiveDuplicates<T extends number[]>(ring: T[]): T[] {
  return ring.filter((point, index) => {
    const previous = ring[index - 1];
    return !previous || point[0] !== previous[0] || point[1] !== previous[1];
  });
}

export function polygonAreaHa(ring: Ring): number {
  if (ring.length < 3) return 0;
  return turfArea(toPolygonGeometry(ring)) / 10_000;
}

export function analysisAreaError(geometry: GeoJSON.Polygon, limits: Limits | null) {
  const minimum = limits?.areaHaMin;
  if (minimum === undefined) return null;

  const area = polygonAreaHa(geometry.coordinates[0] as Ring);
  if (area >= minimum) return null;
  return `Для анализа нужно не менее ${minimum.toLocaleString('ru-RU')} га. Увеличьте площадь контура.`;
}

export interface PolygonValidation {
  ok: boolean;
  error?: string;
}

/** Самопересечение и минимум вершин — всегда; лимиты — только при известном limits. */
export function validatePolygon(ring: Ring, limits: Limits | null): PolygonValidation {
  if (ring.length < 3) {
    return { ok: false, error: MAP_LABELS.tooFewVertices };
  }
  if (isSelfIntersecting(ring)) {
    return { ok: false, error: MAP_LABELS.selfIntersection };
  }
  if (limits && ring.length > limits.verticesMax) {
    return { ok: false, error: MAP_LABELS.verticesLimit(limits.verticesMax) };
  }
  if (limits && polygonAreaHa(ring) > limits.areaHaMax) {
    return { ok: false, error: MAP_LABELS.areaLimit(limits.areaHaMax) };
  }
  return { ok: true };
}

export interface PeriodValidation {
  ok: boolean;
  error?: string;
}

/** Период: from ≤ to всегда; ограничение длины — только при известном лимите. */
export function validatePeriod(from: string, to: string, limits: Limits | null): PeriodValidation {
  if (!from || !to || from > to) {
    return { ok: false, error: MAP_LABELS.badPeriod };
  }
  if (limits?.minDate && from < limits.minDate) {
    return { ok: false, error: MAP_LABELS.periodBeforeMinDate(limits.minDate) };
  }
  if (limits?.periodDaysMax !== undefined) {
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
    if (days > limits.periodDaysMax) {
      return { ok: false, error: MAP_LABELS.periodLimit(limits.periodDaysMax) };
    }
  }
  return { ok: true };
}
