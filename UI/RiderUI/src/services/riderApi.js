const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/** When Supabase has no dropoff_lat/lng, use a Singapore centroid so assign + ETA still work. */
const DEFAULT_DROPOFF_LAT = 1.3521;
const DEFAULT_DROPOFF_LNG = 103.8198;

/**
 * Transforms a raw order record from new-orders/Supabase into the
 * shape expected by all RiderUI components.
 */
function normalizeOrder(raw) {
  const itemCount = Array.isArray(raw.items) ? raw.items.length : 0;
  const totalCents = raw.total_amount || 0;
  // Estimate rider payout as a flat delivery fee portion
  const payoutDollars = parseFloat(((totalCents * 0.1) / 100).toFixed(2));

  return {
    id: raw.id,
    paymentStatus: "SUCCESS",
    riderEligible: raw.status === "pending",
    payout: payoutDollars > 0 ? payoutDollars : 4.99,
    distanceFromRider: "Calculating...",
    etaToPickup: "Calculating...",
    etaToCustomer: "Calculating...",
    totalEta: "Calculating...",
    pickupStore: "Cloud Kitchen",
    pickupAddress: "Kitchen address pending assignment",
    pickupInstruction: "Show order code to kitchen staff.",
    dropoffAddress: raw.delivery_address || "Address unavailable",
    customerName: raw.user_id ? raw.user_id.slice(0, 8) : "Customer",
    items: itemCount,
    orderCode: (raw.id || "").slice(-4).toUpperCase() || "----",
    // raw coordinates for ETA calls
    dropoff_lat: raw.dropoff_lat ?? null,
    dropoff_lng: raw.dropoff_lng ?? null,
    status: raw.status,
  };
}

/**
 * Fetches all pending (driver-unassigned) orders from the Assign Driver CS.
 */
export async function getAvailableOrders() {
  const resp = await fetch(`${BASE_URL}/api/v1/driver/orders`);
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
  const lat = dropoffLat ?? DEFAULT_DROPOFF_LAT;
  const lng = dropoffLng ?? DEFAULT_DROPOFF_LNG;
  const resp = await fetch(`${BASE_URL}/api/v1/driver/assign`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: orderId,
      driver_id: driverId,
      driver_lat: driverLat,
      driver_lng: driverLng,
      dropoff_lat: lat,
      dropoff_lng: lng,
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
