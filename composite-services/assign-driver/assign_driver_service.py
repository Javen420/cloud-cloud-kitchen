import os
import json
import httpx

from shared.AMQP_Publisher import AMQPPublisher

NEW_ORDERS_URL = os.getenv("NEW_ORDERS_URL", "https://personal-dkkhoptv.outsystemscloud.com/NewOrders/rest/OrdersAPI")
ETA_TRACKING_URL = os.getenv("ETA_TRACKING_URL", "http://eta-tracking:8087")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")

# Singapore centroid fallback when OutSystems has no coordinates
DEFAULT_DROPOFF_LAT = 1.3521
DEFAULT_DROPOFF_LNG = 103.8198

publisher = AMQPPublisher()

# Shared HTTP client — reuses TCP/TLS connections across requests
http = httpx.AsyncClient(timeout=10.0)


def _normalize_outsystems_order(raw: dict) -> dict:
    """Map OutSystems PascalCase fields to the snake_case contract the UI expects."""
    items_raw = raw.get("Items", "[]")
    try:
        items = json.loads(items_raw) if isinstance(items_raw, str) else items_raw
    except (json.JSONDecodeError, TypeError):
        items = []

    return {
        "id": str(raw.get("OrderId", "")),
        "user_id": raw.get("CustId", ""),
        "delivery_address": raw.get("DeliveryAddress", ""),
        "total_amount": raw.get("TotalPrice", 0),
        "items": items if isinstance(items, list) else [],
        "status": (raw.get("KitchenAssignStatus") or "pending").lower(),
        "kitchen_id": None,
        "dropoff_lat": None,
        "dropoff_lng": None,
        "payment_id": raw.get("PaymentId", ""),
    }


async def get_available_orders() -> tuple[dict, int]:
    """
    Fetches all pending (unassigned) orders from the OutSystems Orders API.
    Filters to pending orders and normalises field names for the UI.
    """
    resp = await http.get(f"{NEW_ORDERS_URL}/api/v1/orders")

    if resp.status_code != 200:
        return {"error": "Failed to fetch available orders."}, 502

    raw_orders = resp.json()
    if not isinstance(raw_orders, list):
        raw_orders = raw_orders.get("orders", [])

    # Filter to pending only and normalise
    orders = [
        _normalize_outsystems_order(o)
        for o in raw_orders
        if (o.get("KitchenAssignStatus") or "pending").lower() == "pending"
    ]

    return {"orders": orders}, 200


async def assign_driver(
    order_id: str,
    driver_id: str,
    driver_lat: float,
    driver_lng: float,
    dropoff_lat: float | None = None,
    dropoff_lng: float | None = None,
) -> tuple[dict, int]:
    """
    Orchestrates driver assignment:
      1. Fetch order details from OutSystems
      2. Store dropoff in ETA Tracking cache (so ETA queries work immediately)
      3. Update order status to 'driver_assigned' in OutSystems
      4. Publish driver.assigned event to RabbitMQ
      5. Return confirmation
    """

    # ── Step 1: Fetch order details ──────────────────────────────────────────
    order_resp = await http.get(
        f"{NEW_ORDERS_URL}/api/v1/order",
        params={"OrderId": order_id},
    )

    if order_resp.status_code != 200:
        return {"error": "Failed to fetch order details."}, 502

    raw_list = order_resp.json()
    if not raw_list:
        return {"error": "Order not found."}, 404

    raw_order = raw_list[0] if isinstance(raw_list, list) else raw_list
    order_data = _normalize_outsystems_order(raw_order)

    customer_id = order_data["user_id"]
    dropoff_address = order_data["delivery_address"]
    # OutSystems has no coordinates — use caller-supplied or defaults
    dropoff_lat = dropoff_lat or DEFAULT_DROPOFF_LAT
    dropoff_lng = dropoff_lng or DEFAULT_DROPOFF_LNG

    # ── Step 2: Store dropoff in ETA Tracking cache ──────────────────────────
    eta_resp = await http.post(
        f"{ETA_TRACKING_URL}/api/v1/eta/dropoff",
        json={
            "order_id": order_id,
            "driver_id": driver_id,
            "customer_id": customer_id,
            "dropoff_lat": dropoff_lat,
            "dropoff_lng": dropoff_lng,
        },
    )

    if eta_resp.status_code != 200:
        return {"error": "Failed to register dropoff for ETA tracking."}, 502

    # ── Step 3: Update order status in OutSystems ────────────────────────────
    status_resp = await http.patch(
        f"{NEW_ORDERS_URL}/api/v1/orders/{order_id}",
        json="driver_assigned",
        headers={"Content-Type": "application/json"},
    )

    if status_resp.status_code != 200:
        return {"error": "Failed to update order status."}, 502

    # ── Step 4: Publish driver.assigned event ────────────────────────────────
    await publisher.publish("driver.assigned", {
        "order_id": order_id,
        "driver_id": driver_id,
        "customer_id": customer_id,
        "status": "driver_assigned",
        "message": "A driver has been assigned to your order and is on the way!",
        "dropoff_address": dropoff_address,
    })

    # ── Step 5: Return confirmation ──────────────────────────────────────────
    return {
        "order_id": order_id,
        "driver_id": driver_id,
        "status": "driver_assigned",
        "dropoff_lat": dropoff_lat,
        "dropoff_lng": dropoff_lng,
    }, 200
