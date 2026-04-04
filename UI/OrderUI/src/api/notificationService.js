const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

export async function subscribeToOrderTopic({ token, orderId }) {
  const res = await fetch(`${BASE_URL}/api/notifications/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, order_id: orderId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.error || "Failed to subscribe to notifications");
  }

  return res.json();
}

