const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Caches the dropoff location in the ETA Tracking CS (Redis).
 * Must be called before getEtaTracking will work for an order.
 */
async function initDropoff({ orderId, driverId, customerId, dropoffLat, dropoffLng }) {
  const resp = await fetch(`${BASE_URL}/api/v1/eta/dropoff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: String(orderId),
      driver_id: driverId,
      customer_id: customerId || "",
      dropoff_lat: dropoffLat,
      dropoff_lng: dropoffLng,
    }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(
      body.detail?.message || body.message || `Dropoff init failed (${resp.status})`,
    );
  }

  return resp.json();
}

/**
 * Fetches ETA from the ETA Tracking composite service.
 * The service validates driver ownership via X-Driver-ID header.
 *
 * Returns: { estimated_minutes, distance_meters, source, order_id, driver_id }
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

/**
 * Ensures dropoff is cached in ETA Tracking CS, then fetches the ETA.
 * UI → Kong → ETA Tracking CS → ETA Calculator (Go)
 */
export async function initAndGetEta({ orderId, driverId, customerId, driverLat, driverLng, dropoffLat, dropoffLng }) {
  await initDropoff({ orderId, driverId, customerId, dropoffLat, dropoffLng });
  return getEtaTracking(orderId, driverLat, driverLng, driverId);
}
