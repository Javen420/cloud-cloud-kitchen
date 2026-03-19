package routes

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Client structs are for encapsulating the data and grouping
type Client struct {
	apiKey  string
	baseURL string
	http    *http.Client
}

type LatLng struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type Route struct {
	Routes []RouteResponse `json:"routes"`
}

type RouteResponse struct {
	Duration       string `json:"duration"`
	DistanceMeters int    `json:"distanceMeters"`
}

func NewClient(apiKey, baseURL string) *Client {
	return &Client{
		apiKey:  apiKey,
		baseURL: baseURL,
		http:    &http.Client{Timeout: 5 * time.Second},
	}
}

func (c *Client) GetRoute(ctx context.Context, origin, dest LatLng) (*Route, error) {
	body := map[string]any{
		"origin": map[string]any{
			"location": map[string]any{
				"latLng": map[string]any{
					"latitude":  origin.Latitude,
					"longitude": origin.Longitude,
				},
			},
		},
		"destination": map[string]any{
			"location": map[string]any{
				"latLng": map[string]any{
					"latitude":  dest.Latitude,
					"longitude": dest.Longitude,
				},
			},
		},
		"travelMode": "DRIVE",
	}

	//everything below is basically making the api req
	//encoding strings into JSON format
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}
	//assigning google url
	url := fmt.Sprintf("%s/directions/v2:computeRoutes", c.baseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	//header info, key + info
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-Api-Key", c.apiKey)
	req.Header.Set("X-Goog-FieldMask", "routes.duration,routes.distanceMeters")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("google routes %d: %s", resp.StatusCode, string(b))
	}

	var result Route
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}

	return &result, nil
}

func ParseDurationSeconds(d string) (int, error) {
	return strconv.Atoi(strings.TrimSuffix(d, "s"))
}
