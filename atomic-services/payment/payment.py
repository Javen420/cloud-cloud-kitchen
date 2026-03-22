import os
import stripe
from supabase import Client

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")


def process_payment(
    db: Client,
    order_id: str,
    customer_id: str,
    amount_cents: int,
    currency: str,
    idempotency_key: str,
) -> tuple[dict, int]:
    """
    Create a Stripe PaymentIntent synchronously.
    Returns payment result with status "succeeded" or "failed".
    """
    if not stripe.api_key:
        return {
            "payment_id": "",
            "order_id": order_id,
            "status": "failed",
            "amount_cents": amount_cents,
            "currency": currency,
            "error": "STRIPE_SECRET_KEY is not set",
        }, 500

    try:
        intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency=currency,
            metadata={
                "order_id": order_id,
                "customer_id": customer_id,
            },
            idempotency_key=idempotency_key,
            payment_method="pm_card_visa",
            confirm=True,
            automatic_payment_methods={"enabled": True, "allow_redirects": "never"},
        )

        status = "succeeded" if intent.status in ("succeeded", "requires_capture") else "failed"

        # Persist payment record (order_id omitted — order doesn't exist yet,
        # and payment_records.order_id has a FK constraint to orders table)
        try:
            db.table("payment_records").insert({
                "stripe_charge_id": intent.id,
                "user_id": customer_id,
                "status": status,
                "amount": amount_cents,
                "currency": currency,
            }).execute()
        except Exception as db_err:
            print(f"Warning: could not persist payment record: {db_err}")

        return {
            "payment_id": intent.id,
            "order_id": order_id,
            "status": status,
            "amount_cents": amount_cents,
            "currency": currency,
        }, 200

    except stripe.error.CardError as e:
        return {
            "payment_id": "",
            "order_id": order_id,
            "status": "failed",
            "amount_cents": amount_cents,
            "currency": currency,
            "error": e.user_message,
        }, 402

    except stripe.error.StripeError as e:
        return {
            "payment_id": "",
            "order_id": order_id,
            "status": "failed",
            "amount_cents": amount_cents,
            "currency": currency,
            "error": str(e),
        }, 503

    except Exception as e:
        return {
            "payment_id": "",
            "order_id": order_id,
            "status": "failed",
            "amount_cents": amount_cents,
            "currency": currency,
            "error": f"Unexpected error: {str(e)}",
        }, 500


def capture_payment(
    db: Client,
    payment_intent_id: str,
) -> tuple[dict, int]:

    try:
        intent = stripe.PaymentIntent.capture(payment_intent_id)
    except stripe.error.StripeError as e:
        return {"error": str(e), "status": "error"}, 503

    db.table("payment_records").update({
        "status": "captured",
    }).eq("stripe_charge_id", payment_intent_id).execute()

    return {
        "payment_id": payment_intent_id,
        "status": "captured",
        "amount_cents": intent.amount_received,
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

    db.table("payment_records").update({
        "status": "refunded",
    }).eq("stripe_charge_id", payment_intent_id).execute()

    return {
        "payment_id": payment_intent_id,
        "refund_id": refund.id,
        "status": "refunded",
        "amount_cents": refund.amount,
    }, 200


def get_payment(
    db: Client,
    payment_id: str,
) -> tuple[dict, int]:

    result = db.table("payment_records").select("*").eq("stripe_charge_id", payment_id).execute()

    if not result.data:
        return {"error": "Payment not found."}, 404

    record = result.data[0]
    return {
        "payment_id": record["stripe_charge_id"],
        "order_id": record["order_id"],
        "customer_id": record["user_id"],
        "amount_cents": record["amount"],
        "currency": record["currency"],
        "status": record["status"],
    }, 200
