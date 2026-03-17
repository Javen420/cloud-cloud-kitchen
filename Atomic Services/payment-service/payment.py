import os
import stripe
from datetime import datetime
from supabase import Client

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

RECOVERY_STARTED        = "started"
RECOVERY_ORDER_CREATED  = "order_created"
RECOVERY_CHARGE_CREATED = "charge_created"
RECOVERY_FINISHED       = "finished"


async def process_payment(
    db: Client,
    user_id: str,
    amount: int,
    currency: str,
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
            return {"error": "Request already in progress. Retry shortly."}, 409

        # Unlock and continue from recovery point
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

    # ── Phase 2: Create local payment record ─────────────────────────────────
    if key["recovery_point"] == RECOVERY_STARTED:
        record_result = db.table("payment_records").insert({
            "idempotency_key_id" : key_id,
            "user_id"            : user_id,
            "order_id"           : None,
            "amount"             : amount,
            "currency"           : currency,
            "status"             : "pending",
        }).execute()

        db.table("idempotency_keys").update({
            "recovery_point": RECOVERY_ORDER_CREATED
        }).eq("id", key_id).execute()

        key["recovery_point"] = RECOVERY_ORDER_CREATED

    # ── Phase 3: Stripe PaymentIntent ────────────────────────────────────────
    if key["recovery_point"] == RECOVERY_ORDER_CREATED:
        record_result = db.table("payment_records").select("*").eq("idempotency_key_id", key_id).execute()
        record = record_result.data[0]

        try:
            charge = stripe.PaymentIntent.create(
                amount=amount,
                currency=currency,
                customer=stripe_customer_id,
                confirm=True,
                automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
                metadata={"payment_record_id": record["id"], "user_id": user_id},
                idempotency_key=f"charge-{key_id}",
            )
        except stripe.error.CardError as e:
            response = {"error": e.user_message, "status": "failed"}
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
            "stripe_charge_id" : charge.id,
            "status"           : "charged",
        }).eq("id", record["id"]).execute()

        db.table("idempotency_keys").update({
            "recovery_point": RECOVERY_CHARGE_CREATED
        }).eq("id", key_id).execute()

        key["recovery_point"] = RECOVERY_CHARGE_CREATED

    # ── Phase 4: Finalize ────────────────────────────────────────────────────
    if key["recovery_point"] == RECOVERY_CHARGE_CREATED:
        record_result = db.table("payment_records").select("*").eq("idempotency_key_id", key_id).execute()
        record = record_result.data[0]

        response = {
            "order_id"  : record.get("order_id") or str(record["id"]),
            "charge_id" : record["stripe_charge_id"],
            "status"    : "success",
        }
        db.table("idempotency_keys").update({
            "recovery_point" : RECOVERY_FINISHED,
            "response_code"  : 200,
            "response_body"  : response,
            "locked_at"      : None,
        }).eq("id", key_id).execute()

        return response, 200

    return {"error": "Unexpected payment state.", "status": "error"}, 500
