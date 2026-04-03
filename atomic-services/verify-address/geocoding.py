import os
import requests
from fastapi import HTTPException

GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")
GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json"


def validate_address_input(address: str) -> None:
    """Validate basic address input."""
    if not address or not address.strip():
        raise HTTPException(status_code=400, detail="Address cannot be empty")
    
    if len(address) < 3:
        raise HTTPException(status_code=400, detail="Address is too short")


def geocode_address(address: str) -> dict:
    """
    Geocode address using Google Maps API with Singapore bias.
    
    Args:
        address: The address to geocode
        
    Returns:
        dict with keys: lat, lng, formatted_address
        
    Raises:
        HTTPException: If geocoding fails or address is invalid
    """
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="GOOGLE_MAPS_API_KEY not configured")
    
    validate_address_input(address)
    
    # Bias search towards Singapore
    search_address = f"{address}, Singapore"
    params = {"address": search_address, "key": GOOGLE_MAPS_API_KEY}
    
    try:
        resp = requests.get(GEOCODING_URL, params=params, timeout=10)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise HTTPException(status_code=503, detail=f"Google Maps API unreachable: {exc}")
    
    body = resp.json()
    status = body.get("status", "")
    
    if status == "ZERO_RESULTS":
        raise HTTPException(status_code=404, detail=f"Please enter a valid Singapore address: {address}")
    if status != "OK":
        raise HTTPException(status_code=500, detail=f"Google Maps API error: {status}")
    
    result = body["results"][0]
    formatted_address = result["formatted_address"]
    
    # Validate result is in Singapore
    if "Singapore" not in formatted_address:
        raise HTTPException(status_code=400, detail="This service is limited to Singapore only")
    
    # Validate address has meaningful content (not just country centroid)
    address_components = result.get("address_components", [])
    has_specific_location = any(
        comp_type in comp.get("types", [])
        for comp_type in ["route", "street_address", "premise", "point_of_interest"]
        for comp in address_components
    )
    
    if not has_specific_location:
        raise HTTPException(status_code=400, detail="Please enter a specific street address or location")
    
    return {
        "lat": result["geometry"]["location"]["lat"],
        "lng": result["geometry"]["location"]["lng"],
        "formatted_address": formatted_address
    }
