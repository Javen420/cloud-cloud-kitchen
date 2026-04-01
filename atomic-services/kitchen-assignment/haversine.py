import math

def to_rad(deg: float) -> float:
    """Converts degrees to radians"""
    return deg * math.pi / 180

def distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Haversine distance between two lat/lng points in km.
    """
    R = 6371.0  # Earth radius km
    d_lat = to_rad(abs(lat1 - lat2))
    d_lng = to_rad(abs(lng1 - lng2))
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) *
         math.sin(d_lng / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def estimate_duration_seconds(dist_km: float) -> int:
    """
    Conservative ETA at 30 km/h avg speed.
    """
    duration_h = dist_km / 30
    duration_sec = duration_h * 3600
    return max(int(math.ceil(duration_sec)), 60)  # Min 1 min

def distance_result(dist_km: float) -> dict:
    """Mock DistanceResult for compatibility."""
    dist_m = dist_km * 1000
    dur_s = estimate_duration_seconds(dist_km)
    return {'distance_meters': dist_m, 'duration_seconds': dur_s, 'status': 'OK'}

