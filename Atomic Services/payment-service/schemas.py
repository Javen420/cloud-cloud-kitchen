from pydantic import BaseModel, Field


class PaymentRequest(BaseModel):
    user_id: str
    amount: int = Field(..., gt=0, description="Amount in cents, e.g. 2000 = $20.00")
    currency: str = Field(default="usd", min_length=3, max_length=3)
    stripe_customer_id: str
    idempotency_key: str


class PaymentResponse(BaseModel):
    order_id: str | None = None
    charge_id: str | None = None
    status: str
    error: str | None = None
