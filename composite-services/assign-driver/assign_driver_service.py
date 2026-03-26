import os
import httpx

from shared.AMQP_Publisher import AMQPPublisher

NEW_ORDERS_URL = os.getenv("NEW_ORDERS_URL", "http://new-orders:8082")
ETA_TRACKING_URL = os.getenv("ETA_TRACKING_URL", "http://eta-tracking:8087")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")

publisher = AMQPPublisher()


async def get_available_orders() -> tuple[dict, int]:
    """
    Fetches all pending (unassigned) orders from the new-orders service.
    These are orders confirmed by payment but not yet picked up by a driver.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(f"{NEW_ORDERS_URL}/api/v1/orders/unassigned")

    if resp.status_code != 200:
        return {"error": "Failed to fetch available orders."}, 502

    return resp.json(), 200


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
      1. Fetch order details (delivery address + coordinates)
      2. Store dropoff in ETA Tracking cache (so ETA queries work immediately)
      3. Update order status to 'driver_assigned' in new-orders
      4. Publish driver.assigned event to RabbitMQ
      5. Return confirmation
    """

    # ── Step 1: Fetch order details ──────────────────────────────────────────
    async with httpx.AsyncClient(timeout=10.0) as client:
        order_resp = await client.get(f"{NEW_ORDERS_URL}/api/v1/orders/{order_id}")

    if order_resp.status_code == 404:
        return {"error": "Order not found."}, 404

    if order_resp.status_code != 200:
        return {"error": "Failed to fetch order details."}, 502

    order_data = order_resp.json().get("order", {})
    customer_id = order_data.get("user_id") or order_data.get("customer_id", "")
    # Use coordinates from DB first; fall back to caller-supplied values
    dropoff_lat = order_data.get("dropoff_lat") or dropoff_lat
    dropoff_lng = order_data.get("dropoff_lng") or dropoff_lng
    dropoff_address = order_data.get("delivery_address", "")

    if dropoff_lat is None or dropoff_lng is None:
        return {
            "error": "Order is missing delivery coordinates. Supply dropoff_lat/dropoff_lng in the request body."
        }, 422

    # ── Step 2: Store dropoff in ETA Tracking cache ──────────────────────────
    async with httpx.AsyncClient(timeout=10.0) as client:
        eta_resp = await client.post(
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

    # ── Step 3: Update order status ──────────────────────────────────────────
    async with httpx.AsyncClient(timeout=10.0) as client:
        status_resp = await client.put(
            f"{NEW_ORDERS_URL}/api/v1/orders/{order_id}/status",
            json={"status": "driver_assigned"},
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
