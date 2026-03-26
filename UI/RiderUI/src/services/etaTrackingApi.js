const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/**
 * Fetches ETA from the ETA Tracking composite service.
 * The service validates driver ownership via X-Driver-ID header.
 *
 * Returns an object with: estimated_minutes, distance_km, source, order_id, driver_id
 */
export async function getEtaTracking(orderId, driverLat, driverLng, driverId) {
  const params = new URLSearchParams({
    driver_lat: driverLat,
    driver_lng: driverLng,
  });

  const resp = await fetch(`${BASE_URL}/api/v1/eta/${orderId}?${params}`, {
    headers: {
      "X-Driver-ID": driverId,
    },
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(
      body.detail?.message || body.message || `ETA fetch failed (${resp.status})`,
    );
  }

  return resp.json();
}
