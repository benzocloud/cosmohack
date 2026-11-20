import { Layer, Source } from 'react-map-gl/maplibre';

import { type Ring, type Vertex, toPolygonGeometry } from '@/lib/geo';

const edgeColor = '#2978AA';
const blockedColor = '#C8102E';

export function DrawPreview({
  vertices,
  finishedGeometry,
  closingBlocked,
  preview,
}: {
  vertices: Ring;
  finishedGeometry: GeoJSON.Polygon | null;
  closingBlocked: boolean;
  preview: { point: Vertex; blocked: boolean } | null;
}) {
  const features: GeoJSON.Feature[] = [];
  const last = vertices[vertices.length - 1];
  const polygon =
    finishedGeometry ??
    (vertices.length >= 3 && !closingBlocked ? toPolygonGeometry(vertices) : null);
  if (polygon) {
    features.push({
      type: 'Feature',
      geometry: polygon,
      properties: finishedGeometry ? { kind: 'edge' } : null,
    });
  }
  const addLine = (kind: 'edge' | 'guide', coordinates: Ring, blocked = false) => {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates },
      properties: { kind, blocked },
    });
  };
  if (!finishedGeometry) {
    if (vertices.length >= 2) addLine('edge', vertices);
    if (vertices.length >= 3) addLine('guide', [last, vertices[0]], closingBlocked);
    if (last && preview) addLine('guide', [last, preview.point], preview.blocked);
    vertices.forEach((point, index) => {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: point },
        properties: { first: index === 0 },
      });
    });
  }

  return (
    <Source id="draw-preview" type="geojson" data={{ type: 'FeatureCollection', features }}>
      <Layer id="draw-fill" type="fill" paint={{ 'fill-color': edgeColor, 'fill-opacity': 0.2 }} />
      <Layer
        id="draw-edges"
        type="line"
        filter={['==', ['get', 'kind'], 'edge']}
        paint={{ 'line-color': edgeColor, 'line-width': 3 }}
      />
      <Layer
        id="draw-guides"
        type="line"
        filter={['==', ['get', 'kind'], 'guide']}
        paint={{
          'line-color': ['case', ['==', ['get', 'blocked'], true], blockedColor, edgeColor],
          'line-width': 3,
          'line-dasharray': [2, 2],
        }}
      />
      <Layer
        id="draw-vertices"
        type="circle"
        paint={{
          'circle-color': ['case', ['==', ['get', 'first'], true], edgeColor, '#FFFFFF'],
          'circle-radius': ['case', ['==', ['get', 'first'], true], 7, 5],
          'circle-stroke-color': ['case', ['==', ['get', 'first'], true], '#FFFFFF', edgeColor],
          'circle-stroke-width': 2,
        }}
      />
    </Source>
  );
}
