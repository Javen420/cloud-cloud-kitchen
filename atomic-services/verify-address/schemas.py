from pydantic import BaseModel


class GeocodeResponse(BaseModel):
    address: str
    lat: float
    lng: float
    formatted_address: str
    source: str  # 'cache' or 'google'


class HealthResponse(BaseModel):
    status: str
    google_maps_key_set: bool
    redis_connected: bool
