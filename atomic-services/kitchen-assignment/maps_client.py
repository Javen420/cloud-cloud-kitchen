import os
import requests
from dataclasses import dataclass
from typing import List, Tuple

GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")
GEOCODING_URL       = "https://maps.googleapis.com/maps/api/geocode/json"
from .haversine import distance_km, estimate_duration_seconds, distance_result



class MapsClientError(Exception):
    """Raised when the Maps API returns an unexpected error."""


class MapsClient:
    """
    Thin, atomic wrapper around the Google Maps Distance Matrix API.
    """

    def __init__(self, api_key: str = GOOGLE_MAPS_API_KEY):
        if not api_key:
            raise MapsClientError(
                "GOOGLE_MAPS_API_KEY is not set. "
                "Export it as an environment variable before starting the service."
            )
        self._api_key = api_key

    def distance_matrix(
        self,
        origin: Tuple[float, float],
        destinations: List[Tuple[float, float]],
        mode: str = "driving",
    ) -> List[dict]:
        """
        Haversine distances from origin to all destinations.

        Returns list of dicts in destinations order:
            {'destination_index': int, 'distance_meters': float, 'duration_seconds': float, 'status': 'OK'}
        """
        results = []
        for idx, dest in enumerate(destinations):
            try:
                dist_km = distance_km(origin[0], origin[1], dest[0], dest[1])
                result = distance_result(dist_km)
                result['destination_index'] = idx
                results.append(result)
            except Exception:
                results.append({
                    'destination_index': idx,
                    'distance_meters': float('inf'),
                    'duration_seconds': float('inf'),
                    'status': 'ERROR'
                })
        return results

    def geocode(self, address: str) -> Tuple[float, float]:
        """
        Convert a human-readable address string into (lat, lng) coordinates.

        Args:
            address: e.g. "123 Orchard Rd, Singapore 238858"

        Returns:
            (lat, lng) float tuple of the best-match result.

        Raises:
            MapsClientError: if the address cannot be resolved.
        """
        params = {"address": address, "key": self._api_key}

        try:
            resp = requests.get(GEOCODING_URL, params=params, timeout=10)
            resp.raise_for_status()
        except requests.RequestException as exc:
            raise MapsClientError(f"HTTP request to Geocoding API failed: {exc}") from exc

        body = resp.json()
        status = body.get("status", "")

        if status == "ZERO_RESULTS":
            raise MapsClientError(f"Geocoding returned no results for address: '{address}'")
        if status != "OK":
            raise MapsClientError(
                f"Geocoding API error: {status} — {body.get('error_message', '')}"
            )

        location = body["results"][0]["geometry"]["location"]
        return location["lat"], location["lng"]

    def nearest(
        self,
        origin: Tuple[float, float],
        destinations: List[Tuple[float, float]],
        mode: str = "driving",
    ) -> Tuple[int, dict]:
        """
        Returns (index, result_dict) for closest destination by haversine distance.
        """
        results = self.distance_matrix(origin, destinations, mode)
        reachable = [r for r in results if r['status'] == "OK"]
        if not reachable:
            raise MapsClientError("No reachable destinations found.")
        best = min(reachable, key=lambda r: r['distance_meters'])
        return best['destination_index'], best

    def nearest_from_address(
        self,
        address: str,
        destinations: List[Tuple[float, float]],
        mode: str = "driving",
    ) -> Tuple[int, dict]:
        """
        Geocodes address → haversine nearest kitchen.
        Returns (index, result_dict) with distance_meters, duration_seconds.
        """
        origin = self.geocode(address)
        return self.nearest(origin, destinations, mode)
