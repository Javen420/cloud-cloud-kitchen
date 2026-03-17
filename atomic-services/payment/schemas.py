from pydantic import BaseModel, Field

class CheckoutItem(BaseModel):
    Name: str
    quantity: int = Field(..., gt=0)
    price: float = Field(..., gt=0)

class CreateCheckoutSessionRequest(BaseModel):
    user_id: str
    order_id: str
    items: list[CheckoutItem]
    total_amount: float = Field(..., gt=0)
    currency: str = "sgd"
    delivery_address: str | None = None

class CreateCheckoutSessionResponse(BaseModel):
    order_id: str
    checkout_url: str
    session_id: str
    status: str = "created"

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
