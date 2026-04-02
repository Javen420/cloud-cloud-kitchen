import json
import math
import os
from urllib.parse import urlsplit, urlunsplit

import httpx

from shared.AMQP_Publisher import AMQPPublisher

NEW_ORDERS_URL = os.getenv(
    "NEW_ORDERS_URL",
    "https://personal-dkkhoptv.outsystemscloud.com/NewOrders/rest/OrdersAPI",
)
ETA_TRACKING_URL = os.getenv("ETA_TRACKING_URL", "http://eta-tracking:8087")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")

DEFAULT_DROPOFF_LAT = 1.3521
DEFAULT_DROPOFF_LNG = 103.8198
DEFAULT_KITCHEN_LAT = 1.3350
DEFAULT_KITCHEN_LNG = 103.8050

RIDER_MAX_RADIUS_KM = float(os.getenv("RIDER_MAX_RADIUS_KM", "5.0"))
RIDER_BASE_FEE = float(os.getenv("RIDER_BASE_FEE", "3.00"))
RIDER_PER_KM_RATE = float(os.getenv("RIDER_PER_KM_RATE", "1.50"))
RIDER_MIN_PAYOUT = float(os.getenv("RIDER_MIN_PAYOUT", "4.99"))

publisher = AMQPPublisher()
http = httpx.AsyncClient(timeout=10.0)


def _sanitize_base_url(url: str) -> str:
    parts = urlsplit(url.strip())
    return urlunsplit((parts.scheme, parts.netloc, parts.path.rstrip("/"), "", ""))


SANITIZED_NEW_ORDERS_URL = _sanitize_base_url(NEW_ORDERS_URL)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371
    to_rad = math.radians
    d_lat = to_rad(lat2 - lat1)
    d_lng = to_rad(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(to_rad(lat1))
        * math.cos(to_rad(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def calculate_payout(pickup_km: float, delivery_km: float) -> float:
    total_km = pickup_km + delivery_km
    payout = RIDER_BASE_FEE + (RIDER_PER_KM_RATE * total_km)
    return round(max(payout, RIDER_MIN_PAYOUT), 2)


def _parse_items(raw_items):
    try:
        items = json.loads(raw_items) if isinstance(raw_items, str) else raw_items
    except (json.JSONDecodeError, TypeError):
        items = []
    return items if isinstance(items, list) else []


def _safe_float(value, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _safe_kitchen_id(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if text in {"", "0", "null", "None"}:
        return None
    return text


def _normalize_outsystems_order(raw: dict) -> dict:
    return {
        "id": str(raw.get("OrderId", "")),
        "user_id": raw.get("CustId", ""),
        "delivery_address": raw.get("DeliveryAddress", ""),
        "total_amount": int(raw.get("TotalPrice", 0) or 0),
        "items": _parse_items(raw.get("Items", "[]")),
        "status": (raw.get("KitchenAssignStatus") or "pending").lower(),
        "kitchen_id": _safe_kitchen_id(raw.get("KitchenId")),
        "kitchen_name": raw.get("KitchenName") or "Cloud Kitchen",
        "kitchen_address": raw.get("KitchenAddress") or "Kitchen address pending",
        "kitchen_lat": _safe_float(raw.get("KitchenLat"), DEFAULT_KITCHEN_LAT),
        "kitchen_lng": _safe_float(raw.get("KitchenLong"), DEFAULT_KITCHEN_LNG),
        "dropoff_lat": _safe_float(raw.get("CLat"), DEFAULT_DROPOFF_LAT),
        "dropoff_lng": _safe_float(raw.get("CLong"), DEFAULT_DROPOFF_LNG),
        "payment_id": raw.get("PaymentId", ""),
    }


async def _get_all_orders() -> list[dict]:
    resp = await http.get(f"{SANITIZED_NEW_ORDERS_URL}/GetAll")
    if resp.status_code != 200:
        raise RuntimeError(f"Failed to fetch orders: {resp.status_code}")
    payload = resp.json()
    raw_orders = payload if isinstance(payload, list) else []
    return [_normalize_outsystems_order(order) for order in raw_orders]


async def _get_order(order_id: str) -> dict | None:
    resp = await http.get(
        f"{SANITIZED_NEW_ORDERS_URL}/GetOrder",
        params={"OrderId": order_id},
    )
    if resp.status_code != 200:
        return None
    body = resp.json()
    raw = body[0] if isinstance(body, list) and body else body
    if not raw:
        return None
    return _normalize_outsystems_order(raw)


async def get_available_orders(
    rider_lat: float | None = None,
    rider_lng: float | None = None,
) -> tuple[dict, int]:
    try:
        orders = await _get_all_orders()
    except RuntimeError:
        return {"error": "Failed to fetch available orders."}, 502

    ready_orders = [
        order
        for order in orders
        if order["status"] == "finished_cooking" and order["kitchen_id"]
    ]

    if rider_lat is not None and rider_lng is not None:
        enriched = []
        for order in ready_orders:
            pickup_km = round(
                haversine_km(
                    rider_lat,
                    rider_lng,
                    order["kitchen_lat"],
                    order["kitchen_lng"],
                ),
                2,
            )
            if pickup_km > RIDER_MAX_RADIUS_KM:
                continue

            delivery_km = round(
                haversine_km(
                    order["kitchen_lat"],
                    order["kitchen_lng"],
                    order["dropoff_lat"],
                    order["dropoff_lng"],
                ),
                2,
            )
            order["pickup_distance_km"] = pickup_km
            order["delivery_distance_km"] = delivery_km
            order["payout"] = calculate_payout(pickup_km, delivery_km)
            enriched.append(order)

        ready_orders = enriched

    ready_orders.sort(
        key=lambda order: (
            order.get("pickup_distance_km", math.inf),
            -int(order["id"]) if order["id"].isdigit() else 0,
        )
    )
    return {"orders": ready_orders}, 200


async def assign_driver(
    order_id: str,
    driver_id: str,
    driver_lat: float,
    driver_lng: float,
    dropoff_lat: float | None = None,
    dropoff_lng: float | None = None,
) -> tuple[dict, int]:
    current_order = await _get_order(order_id)
    if not current_order:
        return {"error": "Order not found."}, 404

    if current_order["status"] != "finished_cooking":
        return {
            "error": "Order is no longer available for driver assignment.",
            "status": current_order["status"],
        }, 409

    customer_id = current_order["user_id"]
    dropoff_lat = dropoff_lat or current_order["dropoff_lat"]
    dropoff_lng = dropoff_lng or current_order["dropoff_lng"]

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

    update_payload = {
        "KitchenId": str(current_order.get("kitchen_id") or ""),
        "KitchenLong": str(current_order.get("kitchen_lng") or ""),
        "KitchenLat": str(current_order.get("kitchen_lat") or ""),
        "KitchenAddress": current_order.get("kitchen_address") or "",
        "KitchenAssignStatus": "driver_assigned",
    }

    status_resp = await http.patch(
        f"{SANITIZED_NEW_ORDERS_URL}/UpdateKitchenStatus",
        params={"OrderId": order_id},
        json=update_payload,
    )
    if status_resp.status_code != 200:
        return {"error": "Failed to update order status."}, 502

    await publisher.publish(
        "driver.assigned",
        {
            "order_id": order_id,
            "driver_id": driver_id,
            "customer_id": customer_id,
            "status": "driver_assigned",
            "driver_lat": driver_lat,
            "driver_lng": driver_lng,
            "dropoff_lat": dropoff_lat,
            "dropoff_lng": dropoff_lng,
            "message": "A driver has been assigned to your order and is on the way!",
        },
    )

    return {
        "order_id": order_id,
        "driver_id": driver_id,
        "status": "driver_assigned",
        "dropoff_lat": dropoff_lat,
        "dropoff_lng": dropoff_lng,
    }, 200
