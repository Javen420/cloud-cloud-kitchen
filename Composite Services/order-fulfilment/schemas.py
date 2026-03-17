from pydantic import BaseModel, Field
from typing import List, Any

class OrderItem(BaseModel):
    Id          : int
    Name        : str
    quantity    : int
    price       : float

class SubmitOrderRequest(BaseModel):
    user_id             : str
    items               : List[OrderItem]
    total_amount        : float = Field(..., gt=0)
    delivery_address    : str | None = None
    stripe_customer_id  : str
    idempotency_key     : str

class SubmitOrderResponse(BaseModel):
    order_id    : str | None = None
    status      : str
    message     : str | None = None
    error       : str | None = None
