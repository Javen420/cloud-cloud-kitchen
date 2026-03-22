import os
import requests
from dataclasses import dataclass
from typing import List, Tuple

GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "AIzaSyB0VLJJcl0UBt3AVpHWrWciNFPraN_bdoE")
GEOCODING_URL       = "https://maps.googleapis.com/maps/api/geocode/json"
DISTANCE_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json"


@dataclass
class DistanceResult:
    destination_index: int
    distance_meters: float
    duration_seconds: float
    status: str  # "OK", "NOT_FOUND", "ZERO_RESULTS", etc.


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
    ) -> List[DistanceResult]:
        """
        Query the Distance Matrix API for one origin against N destinations.

        Args:
            origin: (lat, lng) of the delivery address.
            destinations: list of (lat, lng) for each candidate kitchen.
            mode: travel mode — "driving" | "walking" | "bicycling" | "transit"

        Returns:
            List[DistanceResult] in the same order as `destinations`.

        Raises:
            MapsClientError: on HTTP errors or API-level REQUEST_DENIED / INVALID_REQUEST.
        """
        origin_str = f"{origin[0]},{origin[1]}"
        dest_str = "|".join(f"{lat},{lng}" for lat, lng in destinations)

        params = {
            "origins": origin_str,
            "destinations": dest_str,
            "mode": mode,
            "key": self._api_key,
        }

        try:
            resp = requests.get(DISTANCE_MATRIX_URL, params=params, timeout=10)
            resp.raise_for_status()
        except requests.RequestException as exc:
            raise MapsClientError(f"HTTP request to Google Maps failed: {exc}") from exc

        body = resp.json()
        top_status = body.get("status", "")

        if top_status not in ("OK",):
            raise MapsClientError(
                f"Google Maps API error: {top_status} — {body.get('error_message', '')}"
            )

        rows = body.get("rows", [])
        if not rows:
            raise MapsClientError("Google Maps returned no rows.")

        elements = rows[0].get("elements", [])
        results: List[DistanceResult] = []

        for idx, element in enumerate(elements):
            el_status = element.get("status", "UNKNOWN")
            if el_status == "OK":
                results.append(
                    DistanceResult(
                        destination_index=idx,
                        distance_meters=element["distance"]["value"],
                        duration_seconds=element["duration"]["value"],
                        status="OK",
                    )
                )
            else:
                # Keep entry so indices stay aligned; caller decides how to handle.
                results.append(
                    DistanceResult(
                        destination_index=idx,
                        distance_meters=float("inf"),
                        duration_seconds=float("inf"),
                        status=el_status,
                    )
                )

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
    ) -> Tuple[int, DistanceResult]:
        """
        Returns (index, DistanceResult) for the closest reachable destination,
        ranked by driving distance. Origin is a (lat, lng) tuple.

        Raises:
            MapsClientError: if no destination is reachable.
        """
        results = self.distance_matrix(origin, destinations, mode)
        reachable = [r for r in results if r.status == "OK"]
        if not reachable:
            raise MapsClientError("No reachable destinations found.")
        best = min(reachable, key=lambda r: r.distance_meters)
        return best.destination_index, best

    def nearest_from_address(
        self,
        address: str,
        destinations: List[Tuple[float, float]],
        mode: str = "driving",
    ) -> Tuple[int, DistanceResult]:
        """
        Geocodes `address`, then finds the nearest destination.
        This is the primary entry point for the assignment flow.

        Args:
            address:      delivery address string from the orders table.
            destinations: list of (lat, lng) for each candidate kitchen.

        Returns:
            (index into destinations, DistanceResult) for the nearest kitchen.
        """
        origin = self.geocode(address)
        return self.nearest(origin, destinations, mode)