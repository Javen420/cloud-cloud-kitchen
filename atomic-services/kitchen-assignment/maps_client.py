from typing import List, Tuple

from haversine import distance_km, estimate_duration_seconds, distance_result



class MapsClientError(Exception):
    """Raised when the Maps API returns an unexpected error."""


class MapsClient:
    """
    Thin wrapper around haversine-based distance calculations.
    """

    def __init__(self):
        pass

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

