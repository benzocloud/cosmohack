package handler

import (
	"math"

	"github.com/Benzocloud/cosmohack/backend/internal/domain"
)

func validateGeometry(g domain.Polygon, lim Limits) error {
	if g.Type != "Polygon" {
		return errInvalidGeometry
	}

	if len(g.Coordinates) != 1 {
		return errInvalidGeometry
	}

	ring := g.Coordinates[0]
	if len(ring) < 4 {
		return errInvalidGeometry
	}

	first, last := ring[0], ring[len(ring)-1]
	if len(first) != 2 || len(last) != 2 || first[0] != last[0] || first[1] != last[1] {
		return errInvalidGeometry
	}

	for _, p := range ring {
		if len(p) != 2 {
			return errInvalidGeometry
		}

		lon, lat := p[0], p[1]
		if lon < -180 || lon > 180 || lat < -90 || lat > 90 {
			return errInvalidGeometry
		}

		if math.IsNaN(lon) || math.IsNaN(lat) || math.IsInf(lon, 0) || math.IsInf(lat, 0) {
			return errInvalidGeometry
		}
	}

	n := len(ring) - 1
	if n < 3 {
		return errInvalidGeometry
	}

	maxVertices := lim.VerticesMax
	if maxVertices <= 0 {
		maxVertices = lim.MaxVertices
	}

	if maxVertices > 0 && n > maxVertices {
		return errLimitExceeded
	}

	maxAreaKm2 := lim.AreaHaMax / 100
	if maxAreaKm2 <= 0 {
		maxAreaKm2 = lim.MaxAreaKm2
	}

	if maxAreaKm2 > 0 {
		area := ringAreaKm2(ring[:n])
		if area > maxAreaKm2 {
			return errLimitExceeded
		}
	}

	return nil
}

func ringAreaKm2(ring [][]float64) float64 {
	// Площадь по сферической формуле на сфере 6371 км; нужна только если лимит задан.
	const r = 6371.0

	if len(ring) < 3 {
		return 0
	}

	var sum float64

	for i := range ring {
		j := (i + 1) % len(ring)
		lon1 := ring[i][0] * math.Pi / 180
		lon2 := ring[j][0] * math.Pi / 180
		lat1 := ring[i][1] * math.Pi / 180
		lat2 := ring[j][1] * math.Pi / 180
		sum += (lon2 - lon1) * (2 + math.Sin(lat1) + math.Sin(lat2))
	}

	return math.Abs(sum) * r * r / 2
}
