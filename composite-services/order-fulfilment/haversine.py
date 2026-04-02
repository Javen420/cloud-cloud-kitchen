"""
Haversine distance and travel-time helpers for manual customer ETA in order-fulfilment.
Kitchen prep (20 minutes) is applied in fulfilment_service, not here.
"""

import math


def to_rad(deg: float) -> float:
    return deg * math.pi / 180


def distance_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    d_lat = to_rad(abs(lat1 - lat2))
    d_lng = to_rad(abs(lng1 - lng2))
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(d_lng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def estimate_duration_seconds(dist_km: float, avg_speed_kmh: float = 30.0) -> int:
    duration_h = dist_km / avg_speed_kmh
    duration_sec = duration_h * 3600
    return max(int(math.ceil(duration_sec)), 60)
