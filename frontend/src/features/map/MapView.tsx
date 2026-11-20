import { bbox as turfBbox } from '@turf/bbox';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Layer, Source, type MapRef } from 'react-map-gl/maplibre';

import type { Contour, ContoursResult } from '@/api/adapters/contours';
import type { AppError } from '@/api/client';
import { useAreas, useContours, useLimits } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cssVar } from '@/lib/chart-theme';
import {
  type Ring,
  type Vertex,
  drawEdgeIntersects,
  polygonAreaHa,
  toPolygonGeometry,
  validatePolygon,
} from '@/lib/geo';
import { MAP_LABELS } from '@/lib/labels';
import { useDraft } from '@/store/draft';
import { selectionActions, useSelection } from '@/store/selection';
import { useUi } from '@/store/ui';
import { PenLine } from 'lucide-react';
import { AddAreaDialog, type AddAreaSource } from './AddAreaDialog';
import { BasemapSwitcher } from './BasemapSwitcher';
import { ContourPopover, type ContourPopoverState } from './ContourPopover';
import { ContoursButton } from './ContoursButton';
import { DrawPreview } from './DrawPreview';
import { DrawToolbar } from './DrawToolbar';
import { MapEmptyHint } from './MapEmptyHint';
import { MapLegend } from './MapLegend';
import {
  DEFAULT_MAP_VIEW,
  MOCK_MAP_VIEW,
  OPENFREEMAP_STYLE_URL,
  POSITRON_STYLE_URL,
  SATELLITE_STYLE,
  readLastMapView,
  saveLastMapView,
} from './map-style';

/**
 * Карта (frontend-plan §8): подложка + векторные полигоны и черновик участка,
 * никакой растровой статистики NDVI без подтверждённого источника.
 *
 * Порядок слоёв: contours-fill → contours-line → areas-fill → areas-line →
 * areas-line-none → selected-halo → selected-line → слои черновика.
 * Цвет полигона = итог сохранённого lastResult за подписанный период; перекраска
 * по выбранной дате графика не делается (бриф §3C).
 *
 * Растровый NDVI-слой намеренно отсутствует до подтверждённого backend URL.
 */

// Цвета статусов — из токенов §2.2; альфа заливки 0.22 ≈ 0x38 в 8-значном hex
const VERDICT_FILL_ALPHA = '38';
const hex = (name: string, fallback: string) => cssVar(name, fallback).replace('#', '');

function mercatorVertex(vertex: Vertex): Vertex {
  const { x, y } = maplibregl.MercatorCoordinate.fromLngLat(vertex);
  return [x, y];
}

const verdictColorExpr = (alpha: string): ExpressionSpecification => [
  'match',
  ['get', 'verdict'],
  'normal',
  `#${hex('--verdict-normal', '1B7F3B')}${alpha}`,
  'candidate',
  `#${hex('--verdict-candidate', 'C77700')}${alpha}`,
  'confirmed',
  `#${hex('--verdict-confirmed', 'C8102E')}${alpha}`,
  'insufficient_data',
  `#${hex('--verdict-insufficient', '6B7785')}${alpha}`,
  `#${hex('--verdict-none', 'A8B3C0')}00`,
];

export function MapView({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const demoMode = useUi((s) => s.demoMode);
  const basemap = useUi((s) => s.basemap);
  const drawRequest = useUi((s) => s.drawRequest);
  const drawMode = useDraft((s) => s.drawMode);
  const vertices = useDraft((s) => s.vertices);
  const setVertices = useDraft((s) => s.setVertices);
  const cancelDrawing = useDraft((s) => s.cancelDrawing);
  const finishedGeometry = useDraft((s) => s.finishedGeometry);
  const setFinishedGeometry = useDraft((s) => s.setFinishedGeometry);
  const selectedAreaId = useSelection((s) => s.selectedAreaId);
  const selectionSource = useSelection((s) => s.selectionSource);

  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const mapRef = useRef<MapRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const areasQuery = useAreas();
  const areas = areasQuery.data ?? [];

  const [bbox, setBbox] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [styleBroken, setStyleBroken] = useState(false);
  // dev-удобство: ?mock_case=empty|failed переключает сценарий фикстур контуров
  const mockCase = new URLSearchParams(window.location.search).get('mock_case') ?? undefined;
  const contoursQuery = useContours(bbox, mockCase);
  const contoursResult: ContoursResult | null = contoursQuery.data ?? null;

  const [contourPopover, setContourPopover] = useState<ContourPopoverState | null>(null);
  const [addSource, setAddSource] = useState<AddAreaSource | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [hoverVertex, setHoverVertex] = useState<Vertex | null>(null);
  const [rejectedVertex, setRejectedVertex] = useState<Vertex | null>(null);

  const drawing = drawMode === 'drawing' && !finishedGeometry;
  // В моке стартуем над фикстурными контурами; иначе — сохранённый вид/Ростов-на-Дону
  const initialView = useMemo(
    () => (demoMode ? MOCK_MAP_VIEW : (readLastMapView() ?? DEFAULT_MAP_VIEW)),
    [demoMode],
  );

  const resetDrawPreview = useCallback(() => {
    setHoverVertex(null);
    setRejectedVertex(null);
  }, []);
  const stopDrawing = useCallback(() => {
    resetDrawPreview();
    cancelDrawing();
  }, [cancelDrawing, resetDrawPreview]);

  useEffect(() => {
    if (!drawing) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') stopDrawing();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawing, stopDrawing]);

  // Выбор из списка → fitBounds; выбор кликом по карте — без подлёта (бриф §3C)
  const prevSelected = useRef<string | null>(null);
  useEffect(() => {
    if (
      selectedAreaId &&
      selectedAreaId !== prevSelected.current &&
      selectionSource === 'list' &&
      mapInstance
    ) {
      const area = areas.find((item) => item.id === selectedAreaId);
      if (area) {
        const [west, south, east, north] = turfBbox(area.geometry);
        mapInstance.fitBounds(
          [
            [west, south],
            [east, north],
          ],
          { padding: 48, maxZoom: 15, duration: 400 },
        );
      }
    }
    prevSelected.current = selectedAreaId;
  }, [selectedAreaId, selectionSource, areas, mapInstance]);

  const searchContours = () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    const { _sw: sw, _ne: ne } = bounds as unknown as {
      _sw: { lng: number; lat: number };
      _ne: { lng: number; lat: number };
    };
    const searchBbox = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
    if (searchBbox === bbox) {
      void contoursQuery.refetch();
    } else {
      setBbox(searchBbox);
    }
    setStale(false);
    setContourPopover(null);
  };

  const startDrawing = useCallback(() => {
    resetDrawPreview();
    setContourPopover(null);
    useDraft.getState().startDrawing();
  }, [resetDrawPreview]);

  const lastDrawRequest = useRef(0);
  useEffect(() => {
    if (drawRequest <= lastDrawRequest.current) return;
    lastDrawRequest.current = drawRequest;
    startDrawing();
  }, [drawRequest, startDrawing]);

  // Завершённый черновик → диалог добавления
  useEffect(() => {
    if (!finishedGeometry) return;
    setAddSource({ kind: 'drawn', label: 'Нарисован вручную', geometry: finishedGeometry });
    setAddOpen(true);
  }, [finishedGeometry]);

  const openAddFromContour = (contour: Contour) => {
    setAddSource({
      kind: 'contour',
      label: 'Контур OpenStreetMap',
      externalId: contour.externalId ?? contour.id,
      provider: contour.provider,
      name: contour.name,
      geometry: contour.geometry,
    });
    setAddOpen(true);
  };

  const closeAddDialog = () => {
    setAddOpen(false);
    stopDrawing();
  };

  const handleSaved = (
    area: { id: string },
    startError: AppError | null,
    period: { from: string; to: string },
  ) => {
    closeAddDialog();
    if (startError) {
      // «Сохранено, запуск не удался» → участок остаётся с кнопкой «Запустить анализ»
      useUi.getState().setPendingStart({ areaId: area.id, period });
    }
    selectionActions.selectArea(area.id, 'list');
  };

  const limits = useLimits().data ?? null;
  const projectedVertices = useMemo(() => vertices.map(mercatorVertex), [vertices]);
  const closingBlocked = useMemo(
    () =>
      vertices.length >= 3 &&
      (drawEdgeIntersects(vertices, vertices[0], true) ||
        // Учитываем погрешность преобразования координат, независимо от масштаба.
        drawEdgeIntersects(projectedVertices, projectedVertices[0], true, 1e-12)),
    [vertices, projectedVertices],
  );
  const validation = useMemo(
    () =>
      closingBlocked
        ? { ok: false, error: MAP_LABELS.closingIntersection }
        : validatePolygon(vertices, limits),
    [closingBlocked, vertices, limits],
  );
  const isClosing = (point: Vertex) => point === vertices[0];
  const edgeBlocked = (point: Vertex) => {
    // Один пиксель в нормализованных координатах Web Mercator.
    const tolerance = 1 / (512 * 2 ** (mapInstance?.getZoom() ?? initialView.zoom));
    return (
      drawEdgeIntersects(vertices, point) ||
      drawEdgeIntersects(projectedVertices, mercatorVertex(point), false, tolerance)
    );
  };
  const drawTarget = (event: maplibregl.MapMouseEvent): Vertex => {
    const coordinates: Vertex = [event.lngLat.lng, event.lngLat.lat];
    if (vertices.length < 3) return coordinates;
    const first = event.target.project(vertices[0]);
    const hitRadius =
      'pointerType' in event.originalEvent && event.originalEvent.pointerType === 'touch' ? 18 : 10;
    return first.dist(event.point) <= hitRadius ? vertices[0] : coordinates;
  };
  const finishDrawing = () => {
    if (validation.ok) {
      resetDrawPreview();
      setFinishedGeometry(toPolygonGeometry(vertices));
    }
  };
  const previewVertex = hoverVertex ?? rejectedVertex;

  const areasFC = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: areas.map((area) => ({
        type: 'Feature' as const,
        geometry: area.geometry,
        properties: {
          areaId: area.id,
          verdict: area.lastResult?.verdict ?? 'none',
        },
      })),
    }),
    [areas],
  );

  const contoursFC = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: (contoursResult?.contours ?? []).map((contour) => ({
        type: 'Feature' as const,
        geometry: contour.geometry,
        properties: { contourId: contour.id },
      })),
    }),
    [contoursResult],
  );

  const mapStyle =
    styleBroken && basemap === 'map'
      ? OPENFREEMAP_STYLE_URL
      : basemap === 'satellite'
        ? SATELLITE_STYLE
        : POSITRON_STYLE_URL;
  return (
    <div className="relative h-full min-h-0 w-full" ref={containerRef}>
      <MapGL
        ref={mapRef}
        mapLib={maplibregl}
        mapStyle={mapStyle}
        initialViewState={initialView}
        style={{ width: '100%', height: '100%' }}
        cursor={
          drawing ? (hoverVertex && isClosing(hoverVertex) ? 'pointer' : 'crosshair') : undefined
        }
        doubleClickZoom={!drawing}
        onWheel={(event) => {
          const wheel = event.originalEvent;
          // Горизонтальный жест двигает карту на любой платформе, Ctrl+wheel масштабирует.
          if (wheel.ctrlKey || wheel.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return;
          if (!wheel.deltaX && (!wheel.deltaY || !navigator.platform.startsWith('Mac'))) return;

          event.preventDefault();
          wheel.preventDefault();
          event.target.panBy([wheel.deltaX, wheel.deltaY], { duration: 0 });
        }}
        attributionControl={false}
        onLoad={(event) => {
          if (import.meta.env.DEV) {
            (window as unknown as { __agroMap?: maplibregl.Map }).__agroMap = event.target;
          }
          setMapInstance(event.target);
        }}
        onError={() => {
          // сбой подложки Positron → разово уходим на запасной стиль (§1)
          if (!styleBroken && basemap === 'map') setStyleBroken(true);
        }}
        onMoveEnd={(event) => {
          const { longitude, latitude, zoom } = event.viewState;
          saveLastMapView({ longitude, latitude, zoom });
          if (bbox) setStale(true);
        }}
        onMouseMove={drawing ? (event) => setHoverVertex(drawTarget(event)) : undefined}
        onMouseOut={drawing ? () => setHoverVertex(null) : undefined}
        onMoveStart={drawing ? () => setHoverVertex(null) : undefined}
        onClick={(event) => {
          if (drawing) {
            const point = drawTarget(event);
            if (isClosing(point)) {
              finishDrawing();
            } else if (edgeBlocked(point)) {
              setRejectedVertex(point);
            } else if (!limits || vertices.length < limits.verticesMax) {
              setVertices([...vertices, point]);
              resetDrawPreview();
            }
            return;
          }
          const areasFeatures = event.target.queryRenderedFeatures(event.point, {
            layers: ['areas-fill'],
          });
          const areaId = areasFeatures[0]?.properties?.areaId;
          if (typeof areaId === 'string') {
            selectionActions.selectArea(areaId, 'map');
            return;
          }
          const contourFeatures = event.target.queryRenderedFeatures(event.point, {
            layers: ['contours-fill'],
          });
          const contourId = contourFeatures[0]?.properties?.contourId;
          if (typeof contourId === 'string' && contoursResult) {
            const contour = contoursResult.contours.find((item) => item.id === contourId);
            if (contour) {
              // точка клика ограничивается контейнером карты, чтобы карточка не вылезала
              const rect = containerRef.current?.getBoundingClientRect();
              const px = Math.max(8, Math.min(event.point.x, (rect?.width ?? 320) - 270));
              const py = Math.max(8, Math.min(event.point.y, (rect?.height ?? 240) - 240));
              setContourPopover({
                contour,
                areaHa: polygonAreaHa(contourToRing(contour.geometry)).toFixed(1),
                point: { x: px, y: py },
              });
            }
          }
        }}
      >
        <Source id="contours" type="geojson" data={contoursFC}>
          <Layer
            id="contours-fill"
            type="fill"
            paint={{ 'fill-color': cssVar('--contour-found-fill', 'rgba(45,91,227,.08)') }}
          />
          <Layer
            id="contours-line"
            type="line"
            paint={{
              'line-color': cssVar('--contour-found', '#2D5BE3'),
              'line-width': 1.5,
              'line-dasharray': [2, 2],
            }}
          />
        </Source>

        <Source id="areas" type="geojson" data={areasFC}>
          <Layer
            id="areas-fill"
            type="fill"
            paint={{ 'fill-color': verdictColorExpr(VERDICT_FILL_ALPHA) }}
          />
          <Layer
            id="areas-line"
            type="line"
            filter={['!=', ['get', 'verdict'], 'none'] as FilterSpecification}
            paint={{ 'line-color': verdictColorExpr('FF'), 'line-width': 2 }}
          />
          <Layer
            id="areas-line-none"
            type="line"
            filter={['==', ['get', 'verdict'], 'none'] as FilterSpecification}
            paint={{
              'line-color': cssVar('--verdict-none', '#A8B3C0'),
              'line-width': 2,
              'line-dasharray': [2, 2],
            }}
          />
          {/* выбранный: белое гало + тёмная обводка независимо от статуса (§8) */}
          <Layer
            id="areas-selected-halo"
            type="line"
            filter={['==', ['get', 'areaId'], selectedAreaId ?? '—'] as FilterSpecification}
            paint={{ 'line-color': '#FFFFFF', 'line-width': 6 }}
          />
          <Layer
            id="areas-selected-line"
            type="line"
            filter={['==', ['get', 'areaId'], selectedAreaId ?? '—'] as FilterSpecification}
            paint={{ 'line-color': cssVar('--area-selected-outline', '#151A21'), 'line-width': 3 }}
          />
        </Source>

        {(drawing || finishedGeometry) && (
          <DrawPreview
            vertices={vertices}
            finishedGeometry={finishedGeometry}
            closingBlocked={closingBlocked}
            preview={
              previewVertex && !isClosing(previewVertex)
                ? { point: previewVertex, blocked: edgeBlocked(previewVertex) }
                : null
            }
          />
        )}
      </MapGL>

      <div className="absolute inset-x-3 top-3 z-10 flex items-start gap-2">
        <ContoursButton
          loading={contoursQuery.isFetching}
          stale={stale}
          result={contoursResult}
          error={contoursQuery.error}
          onSearch={searchContours}
          onDraw={startDrawing}
        />
        <BasemapSwitcher />
      </div>

      {!drawing && (
        <div className="absolute bottom-4 right-4 z-20">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-12 border-border bg-action-soft text-ink shadow-1 hover:bg-surface-hover"
                aria-label="Отметить свою зону"
                onClick={startDrawing}
              >
                <PenLine aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Отметить свою зону на карте</TooltipContent>
          </Tooltip>
        </div>
      )}

      {areas.length === 0 && !drawing && (
        <MapEmptyHint onSearch={searchContours} onDraw={startDrawing} />
      )}

      {drawing && (
        <DrawToolbar
          validation={validation}
          vertexCount={vertices.length}
          vertexLimitReached={limits !== null && vertices.length === limits.verticesMax}
          warning={rejectedVertex ? MAP_LABELS.edgeIntersection : null}
          onUndo={() => {
            setVertices(vertices.slice(0, -1));
            resetDrawPreview();
          }}
          onFinish={finishDrawing}
          onCancel={stopDrawing}
        />
      )}

      {!drawing && <MapLegend />}

      <ContourPopover
        state={contourPopover}
        onClose={() => setContourPopover(null)}
        onAdd={openAddFromContour}
        variant={variant}
      />

      <AddAreaDialog
        source={addSource}
        open={addOpen}
        areasCount={areas.length}
        onOpenChange={(open) => {
          if (!open) closeAddDialog();
        }}
        onSaved={handleSaved}
      />
    </div>
  );
}

function contourToRing(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): Ring {
  return (
    geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0][0]
  ) as Ring;
}
