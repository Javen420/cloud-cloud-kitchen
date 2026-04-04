import json
import math
import os
from urllib.parse import urlsplit, urlunsplit

import httpx
import redis.asyncio as redis

from shared.AMQP_Publisher import AMQPPublisher

NEW_ORDERS_URL = os.getenv(
    "NEW_ORDERS_URL",
    "https://personal-dkkhoptv.outsystemscloud.com/NewOrders/rest/OrdersAPI",
)
ETA_TRACKING_URL = os.getenv("ETA_TRACKING_URL", "http://eta-tracking:8087")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
REDIS_ADDR = os.getenv("REDIS_ADDR", "redis:6379")
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")

RIDER_MAX_RADIUS_KM = float(os.getenv("RIDER_MAX_RADIUS_KM", "5.0"))
RIDER_BASE_FEE = float(os.getenv("RIDER_BASE_FEE", "3.00"))
RIDER_PER_KM_RATE = float(os.getenv("RIDER_PER_KM_RATE", "1.50"))
RIDER_MIN_PAYOUT = float(os.getenv("RIDER_MIN_PAYOUT", "4.99"))

publisher = AMQPPublisher()
http = httpx.AsyncClient(timeout=10.0)
_redis_client = None


def _sanitize_base_url(url: str) -> str:
    parts = urlsplit(url.strip())
    return urlunsplit((parts.scheme, parts.netloc, parts.path.rstrip("/"), "", ""))


SANITIZED_NEW_ORDERS_URL = _sanitize_base_url(NEW_ORDERS_URL)
ACTIVE_DRIVER_STATUSES = {"cooking", "finished_cooking", "driver_assigned", "out_for_delivery"}


def _get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        host, port = REDIS_ADDR.split(":")
        _redis_client = redis.Redis(
            host=host,
            port=int(port),
            password=REDIS_PASSWORD or None,
            decode_responses=True,
        )
    return _redis_client


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


def _safe_float(value) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_kitchen_id(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if text in {"", "0", "null", "None"}:
        return None
    return text


def _normalize_outsystems_order(raw: dict) -> dict:
    kitchen_lat = _safe_float(raw.get("KitchenLat"))
    kitchen_lng = _safe_float(raw.get("KitchenLong"))
    dropoff_lat = _safe_float(raw.get("CLat"))
    dropoff_lng = _safe_float(raw.get("CLong"))

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
        "kitchen_lat": kitchen_lat,
        "kitchen_lng": kitchen_lng,
        "dropoff_lat": dropoff_lat,
        "dropoff_lng": dropoff_lng,
        "has_real_coordinates": all(
            value is not None
            for value in (kitchen_lat, kitchen_lng, dropoff_lat, dropoff_lng)
        ),
        "payment_id": raw.get("PaymentId", ""),
    }


def _to_rider_order(order: dict) -> dict:
    delivery_km = None
    if order["has_real_coordinates"]:
        delivery_km = round(
            haversine_km(
                order["kitchen_lat"],
                order["kitchen_lng"],
                order["dropoff_lat"],
                order["dropoff_lng"],
            ),
            2,
        )

    return {
        **order,
        "pickup_distance_km": order.get("pickup_distance_km"),
        "delivery_distance_km": delivery_km,
        "payout": calculate_payout(order.get("pickup_distance_km", 0) or 0, delivery_km or 0),
    }


async def _get_order_assignment(order_id: str) -> str | None:
    return await _get_redis().get(f"order:driver:{order_id}")


async def _set_order_assignment(order_id: str, driver_id: str) -> None:
    client = _get_redis()
    pipe = client.pipeline()
    pipe.set(f"order:driver:{order_id}", driver_id, ex=86400)
    pipe.sadd(f"driver:orders:{driver_id}", order_id)
    pipe.expire(f"driver:orders:{driver_id}", 86400)
    await pipe.execute()


async def _clear_order_assignment(order_id: str, driver_id: str | None = None) -> None:
    client = _get_redis()
    assigned_driver = driver_id or await client.get(f"order:driver:{order_id}")
    pipe = client.pipeline()
    pipe.delete(f"order:driver:{order_id}")
    if assigned_driver:
        pipe.srem(f"driver:orders:{assigned_driver}", order_id)
    await pipe.execute()


async def _get_driver_order_ids(driver_id: str) -> list[str]:
    order_ids = await _get_redis().smembers(f"driver:orders:{driver_id}")
    return sorted(order_ids) if order_ids else []


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

    ready_orders = []
    for order in orders:
        if order["status"] not in ("cooking", "finished_cooking"):
            continue
        if not order["kitchen_id"] or not order["has_real_coordinates"]:
            continue
        if await _get_order_assignment(order["id"]):
            continue
        ready_orders.append(order)

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

            order["pickup_distance_km"] = pickup_km
            enriched.append(order)

        ready_orders = enriched

    ready_orders.sort(
        key=lambda order: (
            order.get("pickup_distance_km", math.inf),
            -int(order["id"]) if order["id"].isdigit() else 0,
        )
    )
    return {"orders": [_to_rider_order(order) for order in ready_orders]}, 200


async def get_current_driver_orders(driver_id: str) -> tuple[dict, int]:
    if not driver_id:
        return {"error": "driver_id is required."}, 400

    order_ids = await _get_driver_order_ids(driver_id)
    if not order_ids:
        return {"orders": []}, 200

    active_orders = []
    stale_order_ids = []
    for order_id in order_ids:
        order = await _get_order(order_id)
        if not order:
            stale_order_ids.append(order_id)
            continue
        if order["status"] not in ACTIVE_DRIVER_STATUSES:
            stale_order_ids.append(order_id)
            continue
        assigned_driver = await _get_order_assignment(order_id)
        if assigned_driver != driver_id:
            stale_order_ids.append(order_id)
            continue
        active_orders.append(_to_rider_order(order))

    for stale_order_id in stale_order_ids:
        await _clear_order_assignment(stale_order_id, driver_id)

    status_rank = {
        "out_for_delivery": 0,
        "driver_assigned": 1,
        "finished_cooking": 2,
        "cooking": 3,
    }
    active_orders.sort(key=lambda order: (status_rank.get(order["status"], 99), order["id"]))
    return {"orders": active_orders}, 200


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

    if current_order["status"] not in ("cooking", "finished_cooking"):
        return {
            "error": "Order is no longer available for driver assignment.",
            "status": current_order["status"],
        }, 409

    assigned_driver = await _get_order_assignment(order_id)
    if assigned_driver and assigned_driver != driver_id:
        return {
            "error": "Order is already assigned to another driver.",
            "assigned_driver_id": assigned_driver,
        }, 409

    customer_id = current_order["user_id"]
    if dropoff_lat is None:
        dropoff_lat = current_order["dropoff_lat"]
    if dropoff_lng is None:
        dropoff_lng = current_order["dropoff_lng"]

    if not current_order["has_real_coordinates"] or dropoff_lat is None or dropoff_lng is None:
        return {
            "error": "Order is missing real pickup/dropoff coordinates and cannot be assigned."
        }, 409

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

    # Only update status to driver_assigned if kitchen has finished cooking
    # If kitchen is still cooking, keep the cooking status so order stays visible in kitchen UI
    kitchen_status = current_order.get("status", "").lower()
    new_status = "driver_assigned" if kitchen_status == "finished_cooking" else kitchen_status
    
    update_payload = {
        "KitchenId": str(current_order.get("kitchen_id") or ""),
        "KitchenLong": str(current_order.get("kitchen_lng") or ""),
        "KitchenLat": str(current_order.get("kitchen_lat") or ""),
        "KitchenAddress": current_order.get("kitchen_address") or "",
        "KitchenAssignStatus": new_status,
    }

    status_resp = await http.patch(
        f"{SANITIZED_NEW_ORDERS_URL}/UpdateKitchenStatus",
        params={"OrderId": order_id},
        json=update_payload,
    )
    if status_resp.status_code != 200:
        return {"error": "Failed to update order status."}, 502

    await _set_order_assignment(order_id, driver_id)

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


async def mark_order_picked_up(
    order_id: str,
    driver_id: str | None = None,
) -> tuple[dict, int]:
    current_order = await _get_order(order_id)
    if not current_order:
        return {"error": "Order not found."}, 404

    if current_order["status"] not in {"driver_assigned", "finished_cooking", "out_for_delivery"}:
        return {
            "error": "Order is not ready for pickup.",
            "status": current_order["status"],
        }, 409

    assigned_driver = await _get_order_assignment(order_id)
    if assigned_driver and driver_id and assigned_driver != driver_id:
        return {
            "error": "This order is assigned to a different driver.",
            "assigned_driver_id": assigned_driver,
        }, 403

    if current_order["status"] == "out_for_delivery":
        return {
            "order_id": order_id,
            "driver_id": driver_id,
            "status": "out_for_delivery",
        }, 200

    update_payload = {
        "KitchenId": str(current_order.get("kitchen_id") or ""),
        "KitchenLong": str(current_order.get("kitchen_lng") or ""),
        "KitchenLat": str(current_order.get("kitchen_lat") or ""),
        "KitchenAddress": current_order.get("kitchen_address") or "",
        "KitchenAssignStatus": "out_for_delivery",
    }

    status_resp = await http.patch(
        f"{SANITIZED_NEW_ORDERS_URL}/UpdateKitchenStatus",
        params={"OrderId": order_id},
        json=update_payload,
    )
    if status_resp.status_code != 200:
        return {"error": "Failed to update pickup status."}, 502

    await publisher.publish(
        "order.picked_up",
        {
            "order_id": order_id,
            "driver_id": driver_id or "",
            "customer_id": current_order["user_id"],
            "status": "out_for_delivery",
            "pickup_address": current_order["kitchen_address"],
            "message": "Your order is on its way.",
        },
    )

    return {
        "order_id": order_id,
        "driver_id": driver_id,
        "status": "out_for_delivery",
    }, 200


async def mark_order_delivered(
    order_id: str,
    driver_id: str | None = None,
) -> tuple[dict, int]:
    current_order = await _get_order(order_id)
    if not current_order:
        return {"error": "Order not found."}, 404

    if current_order["status"] not in {"out_for_delivery", "delivered"}:
        return {
            "error": "Order is not currently out for delivery.",
            "status": current_order["status"],
        }, 409

    assigned_driver = await _get_order_assignment(order_id)
    if assigned_driver and driver_id and assigned_driver != driver_id:
        return {
            "error": "This order is assigned to a different driver.",
            "assigned_driver_id": assigned_driver,
        }, 403

    update_payload = {
        "KitchenId": str(current_order.get("kitchen_id") or ""),
        "KitchenLong": str(current_order.get("kitchen_lng") or ""),
        "KitchenLat": str(current_order.get("kitchen_lat") or ""),
        "KitchenAddress": current_order.get("kitchen_address") or "",
        "KitchenAssignStatus": "delivered",
    }

    status_resp = await http.patch(
        f"{SANITIZED_NEW_ORDERS_URL}/UpdateKitchenStatus",
        params={"OrderId": order_id},
        json=update_payload,
    )
    if status_resp.status_code != 200:
        return {"error": "Failed to update delivered status."}, 502

    await _clear_order_assignment(order_id, assigned_driver or driver_id)

    await publisher.publish(
        "order.delivered",
        {
            "order_id": order_id,
            "driver_id": driver_id or "",
            "customer_id": current_order["user_id"],
            "status": "delivered",
            "delivery_address": current_order["delivery_address"],
            "message": "Your order has been delivered.",
        },
    )

    return {
        "order_id": order_id,
        "driver_id": driver_id,
        "status": "delivered",
    }, 200
