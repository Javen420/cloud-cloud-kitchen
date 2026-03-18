package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"cloudKitchen/ETACalculator/internal/haversine"
	"cloudKitchen/ETACalculator/internal/routes"
)

type ETAResult struct {
	OrderID          string `json:"order_id"`
	DriverID         string `json:"driver_id"`
	EstimatedMinutes int    `json:"estimated_minutes"`
	DistanceMeters   int    `json:"distance_meters"`
	Source           string `json:"source"`
	CalculatedAt     string `json:"calculated_at"`
}

type Handler struct {
	google *routes.Client
}

func New(g *routes.Client) *Handler {
	return &Handler{google: g}
}

func (h *Handler) CalculateETA(w http.ResponseWriter, r *http.Request) {
	orderID := r.URL.Query().Get("order_id")
	driverID := r.URL.Query().Get("driver_id")
	driverLat, _ := strconv.ParseFloat(r.URL.Query().Get("driver_lat"), 64)
	driverLng, _ := strconv.ParseFloat(r.URL.Query().Get("driver_lng"), 64)
	dropoffLat, _ := strconv.ParseFloat(r.URL.Query().Get("dropoff_lat"), 64)
	dropoffLng, _ := strconv.ParseFloat(r.URL.Query().Get("dropoff_lng"), 64)

	if orderID == "" || driverID == "" {
		writeJSON(w, 400, map[string]string{"error": "order_id and driver_id required"})
		return
	}

	// Try Google Routes
	origin := routes.LatLng{Latitude: driverLat, Longitude: driverLng}
	dest := routes.LatLng{Latitude: dropoffLat, Longitude: dropoffLng}

	var minutes int
	var distMeters int
	var source string

	routeResp, err := h.google.GetRoute(r.Context(), origin, dest)
	if err != nil || len(routeResp.Routes) == 0 {
		log.Printf("Google Routes failed, using haversine: %v", err)
		minutes, distMeters = haversine.FallbackETA(driverLat, driverLng, dropoffLat, dropoffLng)
		source = "haversine_fallback"
	} else {
		seconds, err := routes.ParseDurationSeconds(routeResp.Routes[0].Duration)
		if err != nil {
			minutes, distMeters = haversine.FallbackETA(driverLat, driverLng, dropoffLat, dropoffLng)
			source = "haversine_fallback"
		} else {
			minutes = (seconds + 30) / 60
			if minutes < 1 {
				minutes = 1
			}
			distMeters = routeResp.Routes[0].DistanceMeters
			source = "google_routes"
		}
	}

	result := &ETAResult{
		OrderID:          orderID,
		DriverID:         driverID,
		EstimatedMinutes: minutes,
		DistanceMeters:   distMeters,
		Source:           source,
		CalculatedAt:     time.Now().UTC().Format(time.RFC3339),
	}

	writeJSON(w, 200, result)
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, map[string]string{"status": "ok"})
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
