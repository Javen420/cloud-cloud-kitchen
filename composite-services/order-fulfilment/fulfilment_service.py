import os
import uuid
import pika
import json
import httpx

PAYMENT_URL    = os.getenv("PAYMENT_URL", "http://payment:8089")
NEW_ORDERS_URL = os.getenv("NEW_ORDERS_URL", "https://personal-dkkhoptv.outsystemscloud.com/NewOrders/rest/OrdersAPI")
RABBITMQ_URL   = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
# Must match checkout UI delivery line (default $4.99 → 499 cents)
DELIVERY_FEE_CENTS = int(os.getenv("DELIVERY_FEE_CENTS", "499"))


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
    payment_intent_id: str | None = None,
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

    # ── Step 1: Calculate total (subtotal + delivery — same as checkout page) ─
    total_cents = 0
    for item in items:
        total_cents += int(round(item["price"] * item["quantity"] * 100))
    total_cents += DELIVERY_FEE_CENTS

    order_id = str(uuid.uuid4())

    # ── Step 2: Process/verify payment ──────────────────────────────────────────
    if payment_intent_id:
        with httpx.Client(timeout=10.0) as client:
            payment_resp = client.get(f"{PAYMENT_URL}/api/v1/payment/intents/{payment_intent_id}")
        if payment_resp.status_code != 200:
            try:
                err_body = payment_resp.json()
            except Exception:
                err_body = {"error": f"Payment service returned {payment_resp.status_code}"}
            return {
                "order_id"   : order_id,
                "status"     : "failed",
                "total_cents": total_cents,
                "error"      : err_body.get("error", "Payment verification failed"),
            }, payment_resp.status_code
        payment_data = payment_resp.json()
        if payment_data.get("status") not in ("succeeded", "requires_capture"):
            return {
                "order_id"   : order_id,
                "status"     : "failed",
                "total_cents": total_cents,
                "error"      : "Payment has not succeeded.",
            }, 402
        if int(payment_data.get("amount_cents", 0)) != total_cents:
            return {
                "order_id": order_id,
                "status": "failed",
                "total_cents": total_cents,
                "error": "Payment amount does not match checkout total.",
            }, 400
        payment_data["payment_id"] = payment_data.get("payment_id") or payment_intent_id
    else:
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

        # ── Step 3: Payment failed → stop here ─────────────────────────────────
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
            f"{NEW_ORDERS_URL}",
            json={
                "CustId"     : customer_id,
                "Items"           : items,
                "TotalPrice"     : total_cents,
                "DeliveryAddress" : dropoff_address,
                "PaymentId"      : payment_data.get("payment_id", ""),
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
        resp = client.get(f"{NEW_ORDERS_URL}{order_id}")

    if resp.status_code == 404:
        return {"error": "Order not found.", "status": "not_found"}, 404

    if resp.status_code != 200:
        return {"error": "Failed to fetch order.", "status": "error"}, 502
    if resp.status_code == 200:
        return {"status": "ok"}, 200


    # data = resp.json().get("order", resp.json())
    # # New Orders DB uses total_amount + delivery_address; normalize for the UI.
    # total_cents = data.get("total_cents")
    # if total_cents is None:
    #     total_cents = data.get("total_amount")
    # dropoff = data.get("dropoff_address") or data.get("delivery_address")
    # oid = data.get("order_id") or data.get("id") or order_id
    # if total_cents is not None and not isinstance(total_cents, int):
    #     try:
    #         total_cents = int(total_cents)
    #     except (TypeError, ValueError):
    #         total_cents = None
    # return {
    #     "order_id"        : oid,
    #     "status"          : data.get("status"),
    #     "dropoff_address" : dropoff,
    #     "total_cents"     : total_cents,
    #     "items"           : data.get("items", []),
    #     # Supabase/Postgres store these in UTC; show in browser local time on the client
    #     "created_at"      : data.get("created_at"),
    #     "updated_at"      : data.get("updated_at"),
    # }, 200
