import os
import pika
import json
import httpx

PENDING_ORDERS_URL  = os.getenv("PENDING_ORDERS_URL", "http://pending-orders:8085")
NEW_ORDERS_URL      = os.getenv("NEW_ORDERS_URL", "http://new-orders:8082")
PAYMENT_URL         = os.getenv("PAYMENT_URL", "http://payment-service:8089")
RABBITMQ_URL        = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")


def publish_notification(user_id: str, order_id: str, status: str, message: str):
    try:
        connection = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
        channel = connection.channel()
        channel.queue_declare(queue="notifications", durable=True)

        payload = json.dumps({
            "user_id"   : user_id,
            "order_id"  : order_id,
            "status"    : status,
            "message"   : message,
        })

        channel.basic_publish(
            exchange="",
            routing_key="notifications",
            body=payload,
            properties=pika.BasicProperties(delivery_mode=2),  # persistent
        )
        connection.close()
    except Exception as e:
        print(f"⚠️ Notification publish failed: {e}")


def submit_order(
    user_id: str,
    items: list,
    total_amount: float,
    delivery_address: str | None,
    stripe_customer_id: str,
    idempotency_key: str,
) -> tuple[dict, int]:

    # ── Step 1: Create pending order ─────────────────────────────────────────
    with httpx.Client() as client:
        pending_resp = client.post(
            f"{PENDING_ORDERS_URL}/orders",
            json={
                "user_id"           : user_id,
                "items"             : items,
                "total_amount"      : total_amount,
                "delivery_address"  : delivery_address,
            }
        )

    if pending_resp.status_code != 201:
        return {"error": "Failed to create order.", "status": "failed"}, 500

    order_data = pending_resp.json()
    order_id = order_data["order_id"]

    # ── Step 2: Authorize payment ─────────────────────────────────────────────
    with httpx.Client() as client:
        payment_resp = client.post(
            f"{PAYMENT_URL}/payments/authorize",
            json={
                "user_id"               : user_id,
                "order_id"              : order_id,
                "amount"                : total_amount,
                "stripe_customer_id"    : stripe_customer_id,
                "idempotency_key"       : idempotency_key,
            }
        )

    if payment_resp.status_code != 200:
        # ── Payment failed → update order to failed ──────────────────────────
        with httpx.Client() as client:
            client.put(
                f"{PENDING_ORDERS_URL}/orders/{order_id}/status",
                json={"status": "failed"}
            )

        publish_notification(
            user_id=user_id,
            order_id=order_id,
            status="failed",
            message="Your order payment failed. Please try again.",
        )
        return {
            "order_id"  : order_id,
            "status"    : "failed",
            "error"     : payment_resp.json().get("error", "Payment failed."),
        }, 402

    payment_data = payment_resp.json()

    # ── Step 3: Confirm order via New Orders ──────────────────────────────────
    with httpx.Client() as client:
        confirm_resp = client.post(
            f"{NEW_ORDERS_URL}/orders",
            json={
                "order_id"  : order_id,
                "kitchen_id": "kitchen_001",    # default kitchen — update when Assign Kitchen is ready
            }
        )

    if confirm_resp.status_code != 200:
        return {
            "order_id"  : order_id,
            "status"    : "failed",
            "error"     : "Failed to confirm order with kitchen.",
        }, 500

    # ── Step 4: Capture payment ───────────────────────────────────────────────
    with httpx.Client() as client:
        capture_resp = client.post(
            f"{PAYMENT_URL}/payments/capture",
            json={"payment_intent_id": payment_data["stripe_charge_id"]}
        )

    if capture_resp.status_code != 200:
        print(f"⚠️ Payment capture failed for order {order_id} — manual review needed")

    # ── Step 5: Publish notification ──────────────────────────────────────────
    publish_notification(
        user_id=user_id,
        order_id=order_id,
        status="confirmed",
        message="Your order has been confirmed and is being prepared!",
    )

    return {
        "order_id"  : order_id,
        "status"    : "confirmed",
        "message"   : "Order placed successfully!",
    }, 200
