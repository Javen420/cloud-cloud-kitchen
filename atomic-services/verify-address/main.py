from fastapi import FastAPI, Query
from schemas import GeocodeResponse, HealthResponse
from geocoding import geocode_address
from cache import get_cached_geocode, get_cached_geocode_by_formatted, cache_geocode, is_redis_healthy

app = FastAPI(title="Verify Address Service")


@app.get("/api/v1/verify", response_model=GeocodeResponse)
async def verify_address(address: str = Query(..., description="The address to verify")):
    """
    Verify and geocode an address in Singapore.
    
    Returns coordinates (lat, lng) and formatted address.
    Caches results for 24 hours using formatted address as key.
    """
    # Try cache first with user input
    cached_data = get_cached_geocode(address)
    if cached_data:
        return GeocodeResponse(
            address=address,
            lat=cached_data["lat"],
            lng=cached_data["lng"],
            formatted_address=cached_data["formatted_address"],
            source="cache"
        )
    
    # Call Google Maps API
    geo_data = geocode_address(address)
    
    # Cache using formatted address as key
    cache_geocode(geo_data["formatted_address"], geo_data)
    
    return GeocodeResponse(
        address=address,
        lat=geo_data["lat"],
        lng=geo_data["lng"],
        formatted_address=geo_data["formatted_address"],
        source="google"
    )


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        google_maps_key_set=bool(app.state.google_maps_key_set),
        redis_connected=is_redis_healthy()
    )


@app.on_event("startup")
async def startup():
    """Initialize app state on startup."""
    import os
    app.state.google_maps_key_set = bool(os.environ.get("GOOGLE_MAPS_API_KEY", ""))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8084)
