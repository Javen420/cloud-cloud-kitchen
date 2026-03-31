/**
 * Coordinate fulfilment service (composite) — same contract as the legacy HTML dashboard.
 * Dev: Vite proxies `/coord` → `VITE_COORDINATE_PROXY_TARGET` (default http://localhost:8094).
 */
const BASE = import.meta.env.VITE_COORDINATE_BASE || "/coord";

export async function fetchOrdersByStatus(status) {
  const res = await fetch(`${BASE}/orders?status=${encodeURIComponent(status)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || res.statusText || "Failed to load orders");
  }
  return data.orders || [];
}

export async function updateOrderStatus(orderId, status) {
  const res = await fetch(`${BASE}/orders/${encodeURIComponent(orderId)}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || res.statusText || "Update failed");
  }
  return data;
}

/** True when coordinate-fulfilment is reachable. */
export async function fetchCoordinateHealth() {
  try {
    const res = await fetch(`${BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Load several statuses in parallel (for dashboard stats + “All” tab). */
export async function fetchOrdersByStatuses(statuses) {
  const lists = await Promise.all(
    statuses.map((s) => fetchOrdersByStatus(s)),
  );
  return Object.fromEntries(statuses.map((s, i) => [s, lists[i]]));
}
