import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Depends
from fastapi.responses import JSONResponse
from supabase import Client

ROOT_DIR = Path(__file__).resolve().parent
load_dotenv()
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from shared.database import get_supabase
from schemas import PaymentRequest, PaymentResult, CapturePaymentRequest, RefundPaymentRequest
from payment import process_payment, capture_payment, refund_payment, get_payment

app = FastAPI(title="Payment Service", version="2.0.0")


def get_db() -> Client:
    return get_supabase()


@app.post("/api/v1/payment", response_model=PaymentResult)
def pay(
    payload: PaymentRequest,
    db: Client = Depends(get_db),
):
    response, status_code = process_payment(
        db=db,
        order_id=payload.order_id,
        customer_id=payload.customer_id,
        amount_cents=payload.amount_cents,
        currency=payload.currency,
        idempotency_key=payload.idempotency_key,
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


@app.get("/payments/{payment_id}")
def get_payment_by_id(
    payment_id: str,
    db: Client = Depends(get_db),
):
    response, status_code = get_payment(db=db, payment_id=payment_id)
    return JSONResponse(content=response, status_code=status_code)


@app.get("/health")
def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8089)
