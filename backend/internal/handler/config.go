package handler

import "net/http"

type publicConfig struct {
	AreaHaMin     float64 `json:"area_ha_min,omitempty"`
	AreaHaMax     float64 `json:"area_ha_max"`
	VerticesMax   int     `json:"vertices_max"`
	PeriodDaysMax int     `json:"period_days_max"`
	MinDate       string  `json:"min_date"`
}

func (h *handler) getConfig(w http.ResponseWriter, _ *http.Request) {
	areaHaMax := h.limits.AreaHaMax
	if areaHaMax <= 0 {
		areaHaMax = h.limits.MaxAreaKm2 * 100
	}

	verticesMax := h.limits.VerticesMax
	if verticesMax <= 0 {
		verticesMax = h.limits.MaxVertices
	}

	writeJSON(w, http.StatusOK, publicConfig{
		AreaHaMin: h.limits.AreaHaMin, AreaHaMax: areaHaMax, VerticesMax: verticesMax,
		PeriodDaysMax: h.limits.PeriodDaysMax, MinDate: h.limits.MinDate,
	})
}
