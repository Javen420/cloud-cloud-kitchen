"""
orchestrator.py — Assign Kitchen composite polling logic.

Every POLL_INTERVAL seconds:
  1. GET  /api/v1/orders?status=pending   → Orders service
  2. For each order without a kitchen_id:
     a. POST /assign                      → Kitchen Assignment atomic
     b. PUT  /api/v1/orders/{id}/kitchen  → Orders service (write kitchen_id)
     c. Publish to RabbitMQ               → Notify customer of assignment
"""

import os
import json
import aiohttp
import aio_pika
from aio_pika import DeliveryMode, Message

NEW_ORDERS_URL         = os.getenv("NEW_ORDERS_URL", "http://new-orders:8082")
KITCHEN_ASSIGNMENT_URL = os.getenv("KITCHEN_ASSIGNMENT_URL", "http://kitchen-assignment:8091")
RABBITMQ_URL           = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
NOTIFICATION_QUEUE     = os.getenv("NOTIFICATION_QUEUE", "notifications")

_processed_order_ids: set[str] = set()


async def poll_and_assign():
    async with aiohttp.ClientSession() as session:
        # Step 1 — fetch pending orders (KitchenAssignStatus empty)
        async with session.get(f"{NEW_ORDERS_URL}/api/v1/orders") as resp:
            if resp.status != 200:
                print(f"[assign-kitchen] Failed to fetch pending orders: {resp.status}")
                return
            body = await resp.json()
            orders = body if isinstance(body, list) else []

        unassigned = [
            o for o in orders
            if str(o["OrderId"]) not in _processed_order_ids
            and not o.get("KitchenAssignStatus")
        ]

        if not unassigned:
            return

        print(f"[assign-kitchen] {len(unassigned)} unassigned order(s) found, processing...")

        connection = await aio_pika.connect_robust(RABBITMQ_URL)
        async with connection:
            channel = await connection.channel()
            await channel.declare_queue(NOTIFICATION_QUEUE, durable=True)

            for order in unassigned:
                order_id         = order["id"]
                delivery_address = order.get("delivery_address") or order.get("dropoff_address")

                if not delivery_address:
                    print(f"[assign-kitchen] Order {order_id} missing delivery address, skipping.")
                    _processed_order_ids.add(order_id)
                    continue

                try:
                    # Step 2a — find nearest kitchen
                    async with session.post(
                        f"{KITCHEN_ASSIGNMENT_URL}/assign",
                        json={"order_id": str(order["OrderId"])},
                    ) as assign_resp:
                        assign_body = await assign_resp.json()
                        if assign_resp.status != 200:
                            raise RuntimeError(assign_body.get("error", "Assignment failed"))

                    kitchen_id      = assign_body["kitchen_id"]
                    kitchen_name    = assign_body["kitchen_name"]
                    kitchen_address = assign_body["kitchen_address"]
                    duration        = assign_body["duration_seconds"]

                    # Step 2b — geocode kitchen → set CLat/CLang, KitchenAssignStatus
                    from maps_client import MapsClient
                    maps = MapsClient()
                    k_lat, k_lng = maps.geocode(kitchen_address)
                    update_payload = {
                        "KitchenAssignStatus": f"k{kitchen_id}",
                        "CLat": str(k_lat),
                        "CLang": str(k_lng),
                    }

                    order_id_str = str(order["OrderId"])
                    async with session.patch(
                        f"{NEW_ORDERS_URL}/api/v1/orders/{order_id_str}",
                        json=update_payload,
                    ) as kitchen_resp:
                        kitchen_body = await kitchen_resp.json()
                        if kitchen_resp.status != 200:
                            raise RuntimeError(kitchen_body.get("error", "Failed to update kitchen assignment"))

                    # Step 2c — notify customer
                    await channel.default_exchange.publish(
                        Message(
                            body=json.dumps({
                                "order_id":         order_id,
                                "status":           "pending",
                                "kitchen_name":     kitchen_name,
                                "kitchen_address":  kitchen_address,
                                "duration_seconds": duration,
                                "delivery_address": delivery_address,
                            }).encode(),
                            content_type="application/json",
                            delivery_mode=DeliveryMode.PERSISTENT,
                        ),
                        routing_key=NOTIFICATION_QUEUE,
                    )

                    _processed_order_ids.add(order_id)
                    print(f"[assign-kitchen] Order {order_id} → kitchen {kitchen_name}")

                except Exception as exc:
                    print(f"[assign-kitchen] Failed to process order {order_id}: {exc}")