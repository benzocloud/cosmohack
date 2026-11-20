import { create } from 'zustand';

/**
 * Режим рисования полигона и черновик геометрии (frontend-plan §5 store/draft, §8).
 * Клики по карте добавляют вершины. setFinishedGeometry открывает AddAreaDialog.
 * Валидация выполняется в lib/geo.ts с лимитами из useLimits (corrections §1).
 */
export type DrawMode = 'off' | 'drawing';

export interface DraftState {
  drawMode: DrawMode;
  /** Черновик: вершины [longitude, latitude] в порядке ввода (без замыкания). */
  vertices: [number, number][];
  /** Завершённый черновик: открытый AddAreaDialog предзаполняется им. */
  finishedGeometry: GeoJSON.Polygon | null;
  startDrawing: () => void;
  cancelDrawing: () => void;
  setVertices: (vertices: [number, number][]) => void;
  setFinishedGeometry: (geometry: GeoJSON.Polygon | null) => void;
}

export const useDraft = create<DraftState>()((set) => ({
  drawMode: 'off',
  vertices: [],
  finishedGeometry: null,
  startDrawing: () => set({ drawMode: 'drawing', vertices: [], finishedGeometry: null }),
  cancelDrawing: () => set({ drawMode: 'off', vertices: [], finishedGeometry: null }),
  setVertices: (vertices) => set({ vertices }),
  setFinishedGeometry: (finishedGeometry) => set({ finishedGeometry }),
}));
