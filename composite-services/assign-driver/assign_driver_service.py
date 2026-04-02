import os
import json
import math
import httpx

from shared.AMQP_Publisher import AMQPPublisher

NEW_ORDERS_URL = os.getenv("NEW_ORDERS_URL", "https://personal-dkkhoptv.outsystemscloud.com/NewOrders/rest/OrdersAPI")
ETA_TRACKING_URL = os.getenv("ETA_TRACKING_URL", "http://eta-tracking:8087")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")

# Fallback coordinates when OutSystems has no values yet
DEFAULT_DROPOFF_LAT = 1.3521   # Singapore downtown (customer)
DEFAULT_DROPOFF_LNG = 103.8198
DEFAULT_KITCHEN_LAT = 1.3350   # Tiong Bahru area (kitchen, ~2km from downtown)
DEFAULT_KITCHEN_LNG = 103.8050

# Rider payout configuration — all tuneable via env vars
RIDER_MAX_RADIUS_KM = float(os.getenv("RIDER_MAX_RADIUS_KM", "5.0"))
RIDER_BASE_FEE      = float(os.getenv("RIDER_BASE_FEE", "3.00"))
RIDER_PER_KM_RATE   = float(os.getenv("RIDER_PER_KM_RATE", "1.50"))
RIDER_MIN_PAYOUT    = float(os.getenv("RIDER_MIN_PAYOUT", "4.99"))

publisher = AMQPPublisher()

# Shared HTTP client — reuses TCP/TLS connections across requests
http = httpx.AsyncClient(timeout=10.0)


# ── Haversine distance ───────────────────────────────────────────────────────

def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in km between two lat/lng points."""
    R = 6371  # Earth radius in km
    to_rad = math.radians
    d_lat = to_rad(lat2 - lat1)
    d_lng = to_rad(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2))
         * math.sin(d_lng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def calculate_payout(pickup_km: float, delivery_km: float) -> float:
    """Distance-based rider payout: base fee + per-km rate for both legs."""
    total_km = pickup_km + delivery_km
    payout = RIDER_BASE_FEE + (RIDER_PER_KM_RATE * total_km)
    return round(max(payout, RIDER_MIN_PAYOUT), 2)


# ── Order normalisation ──────────────────────────────────────────────────────

def _normalize_outsystems_order(raw: dict) -> dict:
    """Map OutSystems PascalCase fields to the snake_case contract the UI expects.

    Kitchen and coordinate fields use ``or`` defaults so that when OutSystems
    adds KitchenId / KitchenLat / KitchenLng / etc., they flow through
    automatically with zero code changes.
    """
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
        "kitchen_id": raw.get("KitchenId") or None,
        "kitchen_name": raw.get("KitchenName") or "Cloud Kitchen",
        "kitchen_address": raw.get("KitchenAddress") or "Kitchen address pending",
        "kitchen_lat": float(raw.get("KitchenLat") or DEFAULT_KITCHEN_LAT),
        "kitchen_lng": float(raw.get("KitchenLng") or DEFAULT_KITCHEN_LNG),
        "dropoff_lat": float(raw.get("CLat") or DEFAULT_DROPOFF_LAT),
        "dropoff_lng": float(raw.get("CLang") or DEFAULT_DROPOFF_LNG),
        "payment_id": raw.get("PaymentId", ""),
    }


async def get_available_orders(
    rider_lat: float | None = None,
    rider_lng: float | None = None,
) -> tuple[dict, int]:
    """
    Fetches all pending (unassigned) orders from the OutSystems Orders API.
    Filters to pending orders and normalises field names for the UI.

    When *rider_lat* / *rider_lng* are supplied the response is enriched with:
      - pickup_distance_km   (rider → kitchen)
      - delivery_distance_km (kitchen → customer)
      - payout               (distance-based)
    and orders beyond RIDER_MAX_RADIUS_KM from the kitchen are excluded.
    """
    resp = await http.get(f"{NEW_ORDERS_URL}/GetPending")

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

    # Enrich with distances, payout, and radius filter when rider location known
    if rider_lat is not None and rider_lng is not None:
        enriched = []
        for order in orders:
            pickup_km = round(
                haversine_km(rider_lat, rider_lng, order["kitchen_lat"], order["kitchen_lng"]),
                2,
            )
            # Skip orders outside the rider's radius
            if pickup_km > RIDER_MAX_RADIUS_KM:
                continue

            delivery_km = round(
                haversine_km(order["kitchen_lat"], order["kitchen_lng"],
                             order["dropoff_lat"], order["dropoff_lng"]),
                2,
            )
            order["pickup_distance_km"] = pickup_km
            order["delivery_distance_km"] = delivery_km
            order["payout"] = calculate_payout(pickup_km, delivery_km)
            enriched.append(order)
        orders = enriched

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
        f"{NEW_ORDERS_URL}/GetOrder",
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
        f"{NEW_ORDERS_URL}/UpdateKitchenStatus",
        params={"OrderId": order_id},
        content='"driver_assigned"',
        headers={"Content-Type": "text/plain"},
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
