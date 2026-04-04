const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Haversine distance (km) between two lat/lng points.
 * Used client-side for quick distance estimates on the order list.
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Transforms a normalized order from assign-driver CS into the shape
 * expected by all RiderUI components.
 *
 * When the server supplies pickup_distance_km / delivery_distance_km / payout
 * (i.e. rider coords were sent), those values are used directly.
 * Otherwise falls back to the legacy 10%-of-total calculation.
 */
function normalizeOrder(raw) {
  const itemsList = Array.isArray(raw.items) ? raw.items : [];
  const itemCount = itemsList.length;

  // Prefer server-calculated payout; fall back to legacy 10% model
  const serverPayout = raw.payout;
  const legacyPayout = (() => {
    const totalCents = raw.total_amount || 0;
    const p = parseFloat(((totalCents * 0.1) / 100).toFixed(2));
    return p > 0 ? p : 4.99;
  })();

  return {
    id: raw.id,
    paymentStatus: "SUCCESS",
    riderEligible: raw.status === "pending",
    payout: serverPayout != null ? serverPayout : legacyPayout,
    pickupDistanceKm: raw.pickup_distance_km ?? null,
    deliveryDistanceKm: raw.delivery_distance_km ?? null,
    etaToPickup: "Calculating...",
    etaToCustomer: "Calculating...",
    totalEta: "Calculating...",
    pickupStore: raw.kitchen_name || "Cloud Kitchen",
    pickupAddress: raw.kitchen_address || "Kitchen address pending assignment",
    pickupInstruction: "Show order code to kitchen staff.",
    dropoffAddress: raw.delivery_address || "Address unavailable",
    customerName: raw.user_id ? raw.user_id.slice(0, 8) : "Customer",
    items: itemCount,
    itemsList,
    orderCode: (raw.id || "").slice(-4).toUpperCase() || "----",
    dropoff_lat: raw.dropoff_lat ?? null,
    dropoff_lng: raw.dropoff_lng ?? null,
    kitchen_lat: raw.kitchen_lat ?? null,
    kitchen_lng: raw.kitchen_lng ?? null,
    status: raw.status,
  };
}

/**
 * Fetches all pending (driver-unassigned) orders via the Assign Driver CS.
 * When riderLat / riderLng are provided the server filters by radius and
 * returns distance + payout fields.
 */
export async function getAvailableOrders(riderLat, riderLng) {
  const params = new URLSearchParams();
  if (riderLat != null) params.set("rider_lat", riderLat);
  if (riderLng != null) params.set("rider_lng", riderLng);
  const qs = params.toString();
  const url = `${BASE_URL}/api/v1/driver/orders${qs ? `?${qs}` : ""}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch available orders (${resp.status})`);
  }
  const data = await resp.json();
  return (data.orders || []).map(normalizeOrder);
}

/**
 * Assigns the current driver to an order.
 * Also triggers dropoff caching in ETA Tracking.
 */
export async function assignDriver({ orderId, driverId, driverLat, driverLng, dropoffLat, dropoffLng }) {
  const resp = await fetch(`${BASE_URL}/api/v1/driver/assign`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: orderId,
      driver_id: driverId,
      driver_lat: driverLat,
      driver_lng: driverLng,
      dropoff_lat: dropoffLat,
      dropoff_lng: dropoffLng,
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const msg =
      err.error ||
      (typeof err.detail === "string" ? err.detail : err.detail?.message) ||
      `Assignment failed (${resp.status})`;
    throw new Error(msg);
  }
  return resp.json();
}

export async function markPickedUp({ orderId, driverId }) {
  const resp = await fetch(`${BASE_URL}/api/v1/driver/pickup`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: orderId,
      driver_id: driverId,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const msg =
      err.error ||
      (typeof err.detail === "string" ? err.detail : err.detail?.message) ||
      `Pickup confirmation failed (${resp.status})`;
    throw new Error(msg);
  }

  return resp.json();
}

export async function markDelivered({ orderId, driverId }) {
  const resp = await fetch(`${BASE_URL}/api/v1/driver/deliver`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: orderId,
      driver_id: driverId,
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const msg =
      err.error ||
      (typeof err.detail === "string" ? err.detail : err.detail?.message) ||
      `Delivery update failed (${resp.status})`;
    throw new Error(msg);
  }

  return resp.json();
}

export async function getCurrentDriverOrders(driverId) {
  const params = new URLSearchParams({ driver_id: driverId });
  const resp = await fetch(`${BASE_URL}/api/v1/driver/current?${params.toString()}`);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `Failed to load current jobs (${resp.status})`);
  }
  const data = await resp.json();
  return (data.orders || []).map(normalizeOrder);
}
