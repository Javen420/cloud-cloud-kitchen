import { getCurrentRiderId } from "./riderAuth";

const ACTIVE_ORDER_KEY = "rider_active_order";

export function getDriverId() {
  return getCurrentRiderId();
}

export function saveActiveOrder(order, stage = "pickup") {
  if (!order) return;
  const driverId = getDriverId();
  if (!driverId) return;
  const payload = {
    driverId,
    stage,
    order,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(ACTIVE_ORDER_KEY, JSON.stringify(payload));
}

export function getActiveOrder() {
  const raw = localStorage.getItem(ACTIVE_ORDER_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.driverId !== getDriverId() || !parsed.order) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearActiveOrder() {
  localStorage.removeItem(ACTIVE_ORDER_KEY);
}

/**
 * Wraps the browser Geolocation API in a Promise.
 * Resolves with { lat, lng } or rejects with an error message.
 */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        // Fallback to Singapore downtown if permission denied / unavailable
        resolve({ lat: 1.3521, lng: 103.8198 });
      },
      { timeout: 5000 },
    );
  });
}
