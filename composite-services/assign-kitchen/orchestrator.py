import json
import os
from urllib.parse import urlsplit, urlunsplit

import aiohttp
import aio_pika
from aio_pika import DeliveryMode, Message


NEW_ORDERS_URL = os.getenv(
    "NEW_ORDERS_URL",
    "https://personal-dkkhoptv.outsystemscloud.com/NewOrders/rest/OrdersAPI",
)
KITCHEN_ASSIGNMENT_URL = os.getenv("KITCHEN_ASSIGNMENT_URL", "http://kitchen-assignment:8091")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
NOTIFICATION_QUEUE = os.getenv("NOTIFICATION_QUEUE", "notifications")

_processed_order_ids: set[str] = set()


def _sanitize_base_url(url: str) -> str:
    parts = urlsplit(url.strip())
    return urlunsplit((parts.scheme, parts.netloc, parts.path.rstrip("/"), "", ""))


SANITIZED_NEW_ORDERS_URL = _sanitize_base_url(NEW_ORDERS_URL)


def _items_as_outsystems_string(items_val) -> str:
    if items_val is None:
        return ""
    if isinstance(items_val, str):
        return items_val
    return json.dumps(items_val)


def _normalize_outsystems_order(raw: dict) -> dict:
    kitchen_id = raw.get("KitchenId")
    if str(kitchen_id).strip() in {"", "0", "None", "null"}:
        kitchen_id = None

    return {
        "order_id": str(raw.get("OrderId", "")),
        "delivery_address": raw.get("DeliveryAddress", ""),
        "status": (raw.get("KitchenAssignStatus") or "pending").lower(),
        "kitchen_id": kitchen_id,
        "kitchen_name": raw.get("KitchenName") or "",
        "kitchen_address": raw.get("KitchenAddress") or "",
        "customer_id": raw.get("CustId", ""),
        "total_amount": int(raw.get("TotalPrice", 0) or 0),
    }


async def poll_and_assign():
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{SANITIZED_NEW_ORDERS_URL}/GetPending") as resp:
            if resp.status != 200:
                print(f"[assign-kitchen] Failed to fetch pending orders: {resp.status}")
                return
            body = await resp.json()
            raw_orders = body if isinstance(body, list) else []

        pending_pairs: list[tuple[dict, dict]] = []
        for raw in raw_orders:
            if not isinstance(raw, dict):
                continue
            o = _normalize_outsystems_order(raw)
            if (
                o["order_id"]
                and o["order_id"] not in _processed_order_ids
                and o["status"] == "pending"
                and not o["kitchen_id"]
            ):
                pending_pairs.append((o, raw))

        if not pending_pairs:
            return

        print(f"[assign-kitchen] {len(pending_pairs)} unassigned order(s) found, processing...")

        connection = await aio_pika.connect_robust(RABBITMQ_URL)
        async with connection:
            channel = await connection.channel()
            await channel.declare_queue(NOTIFICATION_QUEUE, durable=True)

            for order, raw in pending_pairs:
                order_id = order["order_id"]
                delivery_address = order["delivery_address"]

                if not delivery_address:
                    print(f"[assign-kitchen] Order {order_id} missing delivery address, skipping.")
                    _processed_order_ids.add(order_id)
                    continue

                try:
                    async with session.post(
                        f"{KITCHEN_ASSIGNMENT_URL}/assign",
                        json={
                            "order_id": order_id,
                            "delivery_address": delivery_address,
                        },
                    ) as assign_resp:
                        assign_body = await assign_resp.json()
                        if assign_resp.status != 200:
                            raise RuntimeError(assign_body.get("error", "Assignment failed"))

                    update_payload = {
                        "KitchenId": str(assign_body["kitchen_id"]),
                        "KitchenLong": str(assign_body.get("kitchen_lng", "")),
                        "KitchenLat": str(assign_body.get("kitchen_lat", "")),
                        "KitchenAddress": assign_body["kitchen_address"],
                        "KitchenAssignStatus": "pending",
                    }

                    async with session.patch(
                        f"{SANITIZED_NEW_ORDERS_URL}/UpdateKitchenStatus",
                        params={"OrderId": order_id},
                        json=update_payload,
                    ) as kitchen_resp:
                        if kitchen_resp.status != 200:
                            try:
                                kitchen_body = await kitchen_resp.json()
                            except Exception:
                                kitchen_body = {"error": await kitchen_resp.text()}
                            raise RuntimeError(
                                kitchen_body.get("error")
                                or kitchen_body.get("Message")
                                or "Failed to update kitchen assignment"
                            )

                    order_id_val = raw.get("OrderId", order_id)
                    if isinstance(order_id_val, str) and order_id_val.isdigit():
                        order_id_val = int(order_id_val)

                    full_order_payload = {
                        "CustId": str(raw.get("CustId") or ""),
                        "DeliveryAddress": str(raw.get("DeliveryAddress") or delivery_address),
                        "TotalPrice": int(raw.get("TotalPrice") or 0),
                        "Items": _items_as_outsystems_string(raw.get("Items")),
                        "PaymentId": str(raw.get("PaymentId") or ""),
                        "CLat": str(assign_body.get("customer_lat", "")),
                        "CLong": str(assign_body.get("customer_lng", "")),
                        "KitchenAssignStatus": "pending",
                        "OrderId": order_id_val,
                        "KitchenId": str(assign_body["kitchen_id"]),
                        "KitchenLong": str(assign_body.get("kitchen_lng", "")),
                        "KitchenLat": str(assign_body.get("kitchen_lat", "")),
                        "KitchenAddress": str(assign_body["kitchen_address"]),
                    }

                    async with session.post(
                        f"{SANITIZED_NEW_ORDERS_URL}/UpdateFullOrder",
                        json=full_order_payload,
                    ) as full_resp:
                        if full_resp.status != 200:
                            try:
                                full_body = await full_resp.json()
                            except Exception:
                                full_body = {"error": await full_resp.text()}
                            raise RuntimeError(
                                full_body.get("error")
                                or full_body.get("Message")
                                or "Failed to update full order (CLat/CLong)"
                            )

                    await channel.default_exchange.publish(
                        Message(
                            body=json.dumps(
                                {
                                    "order_id": order_id,
                                    "status": "pending",
                                    "kitchen_id": str(assign_body["kitchen_id"]),
                                    "kitchen_name": assign_body["kitchen_name"],
                                    "kitchen_address": assign_body["kitchen_address"],
                                    "duration_seconds": assign_body["duration_seconds"],
                                    "delivery_address": delivery_address,
                                }
                            ).encode(),
                            content_type="application/json",
                            delivery_mode=DeliveryMode.PERSISTENT,
                        ),
                        routing_key=NOTIFICATION_QUEUE,
                    )

                    _processed_order_ids.add(order_id)
                    print(f"[assign-kitchen] Order {order_id} -> kitchen {assign_body['kitchen_name']}")

                except Exception as exc:
                    print(f"[assign-kitchen] Failed to process order {order_id}: {exc}")
