from pydantic import BaseModel, Field
from typing import List


class OrderItem(BaseModel):
    Id       : int
    Name     : str
    quantity : int
    price    : float


class OrderSubmission(BaseModel):
    customer_id      : str
    items            : List[OrderItem]
    dropoff_address  : str
    dropoff_lat      : float | None = None
    dropoff_lng      : float | None = None
    idempotency_key  : str


class OrderSubmissionResponse(BaseModel):
    order_id   : str | None = None
    payment_id : str | None = None
    status     : str
    total_cents: int | None = None
    error      : str | None = None
