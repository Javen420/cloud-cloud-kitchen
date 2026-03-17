from pydantic import BaseModel, Field

class AuthorizePaymentRequest(BaseModel):
    user_id             : str
    order_id            : str
    amount              : int = Field(..., gt=0)    # in cents
    stripe_customer_id  : str
    idempotency_key     : str

class CapturePaymentRequest(BaseModel):
    payment_intent_id   : str

class RefundPaymentRequest(BaseModel):
    payment_intent_id   : str
    reason              : str | None = "requested_by_customer"

class PaymentResponse(BaseModel):
    payment_id          : str | None = None
    order_id            : str | None = None
    status              : str
    amount              : int | None = None
    stripe_charge_id    : str | None = None
    error               : str | None = None
