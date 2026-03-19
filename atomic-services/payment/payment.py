import os
import stripe
from datetime import datetime
from supabase import Client
import httpx
import pika
import json

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
NEW_ORDERS_URL = os.getenv("NEW_ORDERS_URL", "http://new-orders:8082")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")

RECOVERY_STARTED        = "started"
RECOVERY_RECORD_CREATED = "record_created"
RECOVERY_AUTHORIZED     = "authorized"
RECOVERY_FINISHED       = "finished"


def authorize_payment(
    db: Client,
    user_id: str,
    order_id: str,
    amount: int,
    stripe_customer_id: str,
    idempotency_key_str: str,
) -> tuple[dict, int]:

    # ── Phase 1: Upsert & check idempotency key ──────────────────────────────
    existing = db.table("idempotency_keys").select("*").eq("key", idempotency_key_str).execute()

    if existing.data:
        key = existing.data[0]
        if key["recovery_point"] == RECOVERY_FINISHED:
            return key["response_body"], key["response_code"]
        if key["locked_at"] is not None:
            return {"error": "Request already in progress. Retry shortly.", "status": "error"}, 409
        db.table("idempotency_keys").update({
            "locked_at": datetime.utcnow().isoformat()
        }).eq("key", idempotency_key_str).execute()
    else:
        result = db.table("idempotency_keys").insert({
            "key"            : idempotency_key_str,
            "user_id"        : user_id,
            "recovery_point" : RECOVERY_STARTED,
            "locked_at"      : datetime.utcnow().isoformat(),
        }).execute()
        key = result.data[0]

    key_id = key["id"]

    # ── Phase 2: Create payment record ───────────────────────────────────────
    if key["recovery_point"] == RECOVERY_STARTED:
        record = db.table("payment_records").insert({
            "idempotency_key_id" : key_id,
            "user_id"            : user_id,
            "order_id"           : order_id,
            "amount"             : amount,
            "status"             : "pending",
        }).execute()

        db.table("idempotency_keys").update({
            "recovery_point": RECOVERY_RECORD_CREATED
        }).eq("id", key_id).execute()

        key["recovery_point"] = RECOVERY_RECORD_CREATED

    # ── Phase 3: Authorize via Stripe (hold funds, don't capture yet) ────────
    if key["recovery_point"] == RECOVERY_RECORD_CREATED:
        record_result = db.table("payment_records").select("*").eq("idempotency_key_id", key_id).execute()
        record = record_result.data[0]

        try:
            intent = stripe.PaymentIntent.create(
                amount=amount,
                currency="sgd",
                customer=stripe_customer_id,
                confirm=True,
                capture_method="manual",        # authorize only, capture later
                automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
                metadata={"order_id": order_id, "user_id": user_id},
                idempotency_key=f"auth-{key_id}",
            )
        except stripe.error.CardError as e:
            response = {"error": e.user_message, "status": "failed"}
            db.table("payment_records").update({"status": "failed"}).eq("id", record["id"]).execute()
            db.table("idempotency_keys").update({
                "recovery_point" : RECOVERY_FINISHED,
                "response_code"  : 402,
                "response_body"  : response,
                "locked_at"      : None,
            }).eq("id", key_id).execute()
            return response, 402

        except stripe.error.StripeError:
            db.table("idempotency_keys").update({"locked_at": None}).eq("id", key_id).execute()
            return {"error": "Payment provider error. Please retry.", "status": "error"}, 503

        db.table("payment_records").update({
            "stripe_charge_id" : intent.id,
            "status"           : "authorized",
        }).eq("id", record["id"]).execute()

        db.table("idempotency_keys").update({
            "recovery_point": RECOVERY_AUTHORIZED
        }).eq("id", key_id).execute()

        key["recovery_point"] = RECOVERY_AUTHORIZED

    # ── Phase 4: Finalize ────────────────────────────────────────────────────
    if key["recovery_point"] == RECOVERY_AUTHORIZED:
        record_result = db.table("payment_records").select("*").eq("idempotency_key_id", key_id).execute()
        record = record_result.data[0]

        response = {
            "payment_id"        : record["id"],
            "order_id"          : order_id,
            "stripe_charge_id"  : record["stripe_charge_id"],
            "amount"            : amount,
            "status"            : "authorized",
        }
        db.table("idempotency_keys").update({
            "recovery_point" : RECOVERY_FINISHED,
            "response_code"  : 200,
            "response_body"  : response,
            "locked_at"      : None,
        }).eq("id", key_id).execute()

        return response, 200

    return {"error": "Unexpected payment state.", "status": "error"}, 500


def capture_payment(
    db: Client,
    payment_intent_id: str,
) -> tuple[dict, int]:

    try:
        intent = stripe.PaymentIntent.capture(payment_intent_id)
    except stripe.error.StripeError as e:
        return {"error": str(e), "status": "error"}, 503

    # ── Update payment record status ─────────────────────────────────────────
    db.table("payment_records").update({
        "status": "captured",
    }).eq("stripe_charge_id", payment_intent_id).execute()

    return {
        "stripe_charge_id"  : payment_intent_id,
        "status"            : "captured",
        "amount"            : intent.amount_received,
    }, 200


def refund_payment(
    db: Client,
    payment_intent_id: str,
    reason: str,
) -> tuple[dict, int]:

    try:
        refund = stripe.Refund.create(
            payment_intent=payment_intent_id,
            reason=reason,
        )
    except stripe.error.StripeError as e:
        return {"error": str(e), "status": "error"}, 503

    # ── Update payment record status ─────────────────────────────────────────
    db.table("payment_records").update({
        "status": "refunded",
    }).eq("stripe_charge_id", payment_intent_id).execute()

    return {
        "stripe_charge_id"  : payment_intent_id,
        "refund_id"         : refund.id,
        "status"            : "refunded",
        "amount"            : refund.amount,
    }, 200


def get_payment(
    db: Client,
    payment_id: str,
) -> tuple[dict, int]:

    result = db.table("payment_records").select("*").eq("id", payment_id).execute()

    if not result.data:
        return {"error": "Payment not found."}, 404

    record = result.data[0]
    return {
        "payment_id"        : record["id"],
        "order_id"          : record["order_id"],
        "user_id"           : record["user_id"],
        "amount"            : record["amount"],
        "status"            : record["status"],
        "stripe_charge_id"  : record["stripe_charge_id"],
    }, 200


def create_checkout_session(
    db: Client,
    user_id: str,
    order_id: str,
    items: list[dict],
    total_amount: float,
    currency: str = "sgd",
    delivery_address: str | None = None,
) -> tuple[dict, int]:
    if not stripe.api_key:
        return {"status": "error", "error": "STRIPE_SECRET_KEY is not set"}, 500

    line_items = []
    for item in items:
        name = item.get("Name") or item.get("name") or "Item"
        qty = int(item.get("quantity") or 1)
        price = float(item.get("price") or 0)
        unit_amount = int(round(price * 100))
        line_items.append(
            {
                "price_data": {
                    "currency": currency,
                    "product_data": {"name": name},
                    "unit_amount": unit_amount,
                },
                "quantity": qty,
            }
        )

    success_url = f"{FRONTEND_URL}/customer/track/{order_id}?checkout=success"
    cancel_url = f"{FRONTEND_URL}/customer/checkout?checkout=cancel&order_id={order_id}"

    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            # Explicitly allow card + PayNow (avoids Link showing up)
            payment_method_types=["card", "paynow"],
            line_items=line_items,
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"order_id": order_id, "user_id": user_id},
        )
    except stripe.error.StripeError as e:
        return {"status": "error", "error": str(e)}, 503

    # best-effort persist
    db.table("payment_records").insert(
        {
            "idempotency_key_id": None,
            "user_id": user_id,
            "order_id": order_id,
            "amount": int(round(total_amount * 100)),
            "currency": currency,
            "stripe_charge_id": session.id,
            "status": "checkout_created",
        }
    ).execute()

    return {"order_id": order_id, "checkout_url": session.url, "session_id": session.id, "status": "created"}, 200


def handle_checkout_session_completed(db: Client, session: dict) -> None:
    order_id = (session.get("metadata") or {}).get("order_id")
    user_id = (session.get("metadata") or {}).get("user_id")
    payment_intent = session.get("payment_intent")
    if not order_id:
        return

    db.table("payment_records").update(
        {
            "status": "paid",
            "stripe_charge_id": payment_intent or session.get("id"),
        }
    ).eq("order_id", order_id).execute()

    # confirm order (best effort)
    try:
        with httpx.Client() as client:
            client.post(
                f"{NEW_ORDERS_URL}/orders",
                json={"order_id": order_id, "kitchen_id": "kitchen_001"},
                timeout=5,
            )
    except Exception:
        pass

    # publish notification (best effort)
    try:
        connection = pika.BlockingConnection(pika.URLParameters(RABBITMQ_URL))
        channel = connection.channel()
        channel.queue_declare(queue="notifications", durable=True)
        payload = json.dumps(
            {
                "user_id": user_id or "",
                "order_id": order_id,
                "status": "confirmed",
                "message": "Payment received. Your order is confirmed!",
            }
        )
        channel.basic_publish(
            exchange="",
            routing_key="notifications",
            body=payload,
            properties=pika.BasicProperties(delivery_mode=2),
        )
        connection.close()
    except Exception:
        pass
