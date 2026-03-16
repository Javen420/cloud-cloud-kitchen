import os
import sys
from pathlib import Path
import stripe

from fastapi import FastAPI, Depends, Request, HTTPException, Header
from fastapi.responses import JSONResponse
from supabase import Client

sys.path.append(str(Path(__file__).resolve().parents[2] / "shared"))
from database import get_supabase

from schemas import PaymentRequest, PaymentResponse
from payment import process_payment

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

app = FastAPI(title="Atomic Stripe Payment Service", version="1.0.0")


def get_db() -> Client:
    return get_supabase()


@app.post("/api/v1/payment/pay", response_model=PaymentResponse)
async def pay(
    payload: PaymentRequest,
    db: Client = Depends(get_db),
):
    response, status_code = await process_payment(
        db=db,
        user_id=payload.user_id,
        amount=payload.amount,
        currency=payload.currency,
        stripe_customer_id=payload.stripe_customer_id,
        idempotency_key_str=payload.idempotency_key,
    )
    return JSONResponse(content=response, status_code=status_code)


@app.post("/api/v1/payment/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature"),
):
    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")

    event_type = event["type"]
    data_object = event["data"]["object"]

    if event_type == "payment_intent.succeeded":
        print(f"✅ PaymentIntent succeeded: {data_object['id']}")
    elif event_type == "payment_intent.payment_failed":
        error_msg = data_object.get("last_payment_error", {}).get("message", "Unknown")
        print(f"❌ PaymentIntent failed: {data_object['id']} — {error_msg}")
    elif event_type == "charge.refunded":
        print(f"↩️  Charge refunded: {data_object['id']}")

    return {"status": "ok"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8088)
