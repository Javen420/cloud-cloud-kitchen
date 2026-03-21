import os
import uuid
import pika
import json
import httpx

PAYMENT_URL    = os.getenv("PAYMENT_URL", "http://payment:8089")
NEW_ORDERS_URL = os.getenv("NEW_ORDERS_URL", "http://new-orders:8082")
RABBITMQ_URL   = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")


def publish_notification(user_id: str, order_id: str, status: str, message: str):
    try:
        connection = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
        channel = connection.channel()
        channel.exchange_declare(exchange="order_events", exchange_type="topic", durable=True)

        payload = json.dumps({
            "user_id"  : user_id,
            "order_id" : order_id,
            "status"   : status,
            "message"  : message,
        })

        channel.basic_publish(
            exchange="order_events",
            routing_key="order.created",
            body=payload,
            properties=pika.BasicProperties(delivery_mode=2),
        )
        connection.close()
    except Exception as e:
        print(f"Notification publish failed: {e}")


def submit_order(
    customer_id: str,
    items: list,
    dropoff_address: str,
    dropoff_lat: float | None,
    dropoff_lng: float | None,
    idempotency_key: str,
) -> tuple[dict, int]:
    """
    Orchestrates the full order flow:
      1. Calculate total from items
      2. Process payment via Payment service → Stripe
      3. If payment fails → return error, don't create order
      4. Create order in New Orders service
      5. Publish order.created notification via AMQP
      6. Return confirmation
    """

    # ── Step 1: Calculate total ────────────────────────────────────────────────
    total_cents = 0
    for item in items:
        total_cents += int(round(item["price"] * item["quantity"] * 100))

    order_id = str(uuid.uuid4())

    # ── Step 2: Process payment (steps 4-7 in diagram) ─────────────────────────
    with httpx.Client(timeout=10.0) as client:
        payment_resp = client.post(
            f"{PAYMENT_URL}/api/v1/payment",
            json={
                "order_id"        : order_id,
                "customer_id"     : customer_id,
                "amount_cents"    : total_cents,
                "currency"        : "sgd",
                "idempotency_key" : idempotency_key,
            },
        )

    if payment_resp.status_code != 200:
        try:
            err_body = payment_resp.json()
        except Exception:
            err_body = {"error": f"Payment service returned {payment_resp.status_code}"}
        return {
            "order_id"   : order_id,
            "status"     : "failed",
            "total_cents": total_cents,
            "error"      : err_body.get("error", "Payment service error"),
        }, payment_resp.status_code

    payment_data = payment_resp.json()

    # ── Step 3: Payment failed → stop here ─────────────────────────────────────
    if payment_data.get("status") != "succeeded":
        return {
            "order_id"   : order_id,
            "status"     : "failed",
            "total_cents": total_cents,
            "error"      : payment_data.get("error", "Payment was not successful"),
        }, 402

    # ── Step 4: Create order in New Orders (step 8 in diagram) ─────────────────
    with httpx.Client(timeout=10.0) as client:
        order_resp = client.post(
            f"{NEW_ORDERS_URL}/api/v1/orders",
            json={
                "customer_id"     : customer_id,
                "items"           : items,
                "total_cents"     : total_cents,
                "dropoff_address" : dropoff_address,
                "dropoff_lat"     : dropoff_lat,
                "dropoff_lng"     : dropoff_lng,
                "payment_id"      : payment_data.get("payment_id", ""),
            },
        )

    if order_resp.status_code not in (200, 201):
        return {
            "order_id"   : order_id,
            "status"     : "failed",
            "total_cents": total_cents,
            "error"      : "Failed to create order.",
        }, 500

    order_data = order_resp.json()
    final_order_id = order_data.get("order_id", order_id)

    # ── Step 5: Publish notification (step 9 in diagram) ───────────────────────
    publish_notification(
        user_id=customer_id,
        order_id=final_order_id,
        status="confirmed",
        message="Your order has been confirmed and is being prepared!",
    )

    # ── Step 6: Return confirmation ────────────────────────────────────────────
    return {
        "order_id"   : final_order_id,
        "payment_id" : payment_data.get("payment_id"),
        "status"     : "confirmed",
        "total_cents": total_cents,
    }, 200


def get_order_status(order_id: str) -> tuple[dict, int]:
    with httpx.Client(timeout=10.0) as client:
        resp = client.get(f"{NEW_ORDERS_URL}/api/v1/orders/{order_id}")

    if resp.status_code == 404:
        return {"error": "Order not found.", "status": "not_found"}, 404

    if resp.status_code != 200:
        return {"error": "Failed to fetch order.", "status": "error"}, 502

    data = resp.json().get("order", resp.json())
    return {
        "order_id"        : data.get("order_id") or order_id,
        "status"          : data.get("status"),
        "dropoff_address" : data.get("dropoff_address"),
        "total_cents"     : data.get("total_cents"),
        "items"           : data.get("items", []),
    }, 200
