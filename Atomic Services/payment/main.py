import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import stripe
from fastapi import FastAPI, Depends, Request, HTTPException, Header
from fastapi.responses import JSONResponse
from supabase import Client

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from shared.database import get_supabase
from schemas import (AuthorizePaymentRequest, CapturePaymentRequest,
                     RefundPaymentRequest, PaymentResponse)
from payment import (authorize_payment, capture_payment,
                              refund_payment, get_payment)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

app = FastAPI(title="Payment Service", version="1.0.0")


def get_db() -> Client:
    return get_supabase()


@app.post("/payments/authorize", response_model=PaymentResponse)
def authorize(
    payload: AuthorizePaymentRequest,
    db: Client = Depends(get_db),
):
    response, status_code = authorize_payment(
        db=db,
        user_id=payload.user_id,
        order_id=payload.order_id,
        amount=payload.amount,
        stripe_customer_id=payload.stripe_customer_id,
        idempotency_key_str=payload.idempotency_key,
    )
    return JSONResponse(content=response, status_code=status_code)


@app.post("/payments/capture")
def capture(
    payload: CapturePaymentRequest,
    db: Client = Depends(get_db),
):
    response, status_code = capture_payment(
        db=db,
        payment_intent_id=payload.payment_intent_id,
    )
    return JSONResponse(content=response, status_code=status_code)


@app.post("/payments/refund")
def refund(
    payload: RefundPaymentRequest,
    db: Client = Depends(get_db),
):
    response, status_code = refund_payment(
        db=db,
        payment_intent_id=payload.payment_intent_id,
        reason=payload.reason,
    )
    return JSONResponse(content=response, status_code=status_code)


@app.get("/payments/{payment_id}", response_model=PaymentResponse)
def get_payment_by_id(
    payment_id: str,
    db: Client = Depends(get_db),
):
    response, status_code = get_payment(db=db, payment_id=payment_id)
    return JSONResponse(content=response, status_code=status_code)


@app.post("/payments/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None),
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
        print(f"PaymentIntent succeeded: {data_object['id']}")
    elif event_type == "payment_intent.payment_failed":
        error_msg = data_object.get("last_payment_error", {}).get("message", "Unknown")
        print(f"PaymentIntent failed: {data_object['id']} — {error_msg}")
    elif event_type == "charge.refunded":
        print(f"↩️  Charge refunded: {data_object['id']}")

    return {"status": "ok"}


@app.get("/health")
def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8089)
