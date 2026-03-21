const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8081";

export async function submitOrder(orderData) {
  const res = await fetch(`${BASE_URL}/api/v1/order/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(orderData),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || "Order submission failed");
  }

  return res.json();
}

export async function getOrderStatus(orderId) {
  const res = await fetch(`${BASE_URL}/api/v1/order/${orderId}`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detail || "Failed to fetch order");
  }

  return res.json();
}
