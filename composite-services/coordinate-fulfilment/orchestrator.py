"""
orchestrator.py — Coordinate Order Fulfilment composite logic.

Polling:
  Every POLL_INTERVAL seconds, log how many orders are currently cooking.

Status update (called by Kitchen Dashboard UI):
  PUT /orders/{order_id}/status { status: "cooking" | "finished_cooking" }
    → PUT /api/v1/orders/{order_id}/status on Orders service
    → If finished_cooking: publish RabbitMQ notification to customer
"""

import os
import json
import aiohttp
import aio_pika
from aio_pika import DeliveryMode, Message

NEW_ORDERS_URL     = os.getenv("NEW_ORDERS_URL", "http://new-orders:8082")
RABBITMQ_URL       = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
NOTIFICATION_QUEUE = os.getenv("NOTIFICATION_QUEUE", "notifications")

ALLOWED_STATUSES = {"cooking", "finished_cooking"}


async def poll_cooking_orders():
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{NEW_ORDERS_URL}/api/v1/orders") as resp:
            if resp.status != 200:
                print(f"[coordinate-fulfilment] Failed to poll orders: {resp.status}")
                return
            body = await resp.json()
            orders = [o for o in (body if isinstance(body, list) else []) if o.get("KitchenAssignStatus") == "cooking"]
            print(f"[coordinate-fulfilment] {len(orders)} order(s) currently cooking.")


async def get_orders_by_status(status: str) -> tuple[dict, int]:
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{NEW_ORDERS_URL}/api/v1/orders?status={status}") as resp:
            body = await resp.json()
            return body, resp.status


async def update_order_status(order_id: str, status: str) -> tuple[dict, int]:
    if status not in ALLOWED_STATUSES:
        return {"error": f"Invalid status '{status}'. Allowed: {ALLOWED_STATUSES}"}, 422

    async with aiohttp.ClientSession() as session:
        # Step 1 — update KitchenAssignStatus in OutSystems
        update_payload = {"KitchenAssignStatus": status}
        async with session.patch(
            f"{NEW_ORDERS_URL}/api/v1/orders/{order_id}",
            json=update_payload,
        ) as resp:
            body = await resp.json()
            if resp.status != 200:
                return {"error": body.get("error", "Status update failed")}, resp.status

        # Step 2 — if finished cooking, notify customer
        if status == "finished_cooking":
            try:
                async with session.get(f"{NEW_ORDERS_URL}/api/v1/orders/{order_id}") as order_resp:
                    order_body = await order_resp.json()
                    order = order_body.get("order", {})

                connection = await aio_pika.connect_robust(RABBITMQ_URL)
                async with connection:
                    channel = await connection.channel()
                    await channel.declare_queue(NOTIFICATION_QUEUE, durable=True)
                    await channel.default_exchange.publish(
                        Message(
                            body=json.dumps({
                                "order_id":         order_id,
                                "status":           "finished_cooking",
                                "kitchen_id":       order.get("kitchen_id"),
                                "delivery_address": order.get("delivery_address") or order.get("dropoff_address"),
                                "total_amount":     order.get("total_amount"),
                            }).encode(),
                            content_type="application/json",
                            delivery_mode=DeliveryMode.PERSISTENT,
                        ),
                        routing_key=NOTIFICATION_QUEUE,
                    )
                print(f"[coordinate-fulfilment] Notified customer for order {order_id}")
            except Exception as exc:
                print(f"[coordinate-fulfilment] Notification failed for {order_id}: {exc}")

    return {"order_id": order_id, "status": status}, 200