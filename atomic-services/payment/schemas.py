from pydantic import BaseModel, Field


class PaymentRequest(BaseModel):
    order_id        : str
    customer_id     : str
    amount_cents    : int = Field(..., gt=0)
    currency        : str = "sgd"
    idempotency_key : str


class PaymentResult(BaseModel):
    payment_id      : str | None = None
    order_id        : str
    status          : str               # "succeeded" or "failed"
    amount_cents    : int
    currency        : str = "sgd"
    error           : str | None = None


class CapturePaymentRequest(BaseModel):
    payment_intent_id : str


class RefundPaymentRequest(BaseModel):
    payment_intent_id : str
    reason            : str | None = "requested_by_customer"
