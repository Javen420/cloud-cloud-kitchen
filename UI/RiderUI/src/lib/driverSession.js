/**
 * Generates and persists a driver ID for this browser session.
 * In a real app this would come from authentication.
 */
function generateId() {
  return "driver-" + Math.random().toString(36).slice(2, 10);
}

export function getDriverId() {
  let id = localStorage.getItem("rider_driver_id");
  if (!id) {
    id = generateId();
    localStorage.setItem("rider_driver_id", id);
  }
  return id;
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
