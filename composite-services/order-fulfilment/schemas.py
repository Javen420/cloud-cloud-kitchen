from pydantic import BaseModel, Field
from typing import List, Optional


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
    payment_intent_id: str | None = None


class OrderSubmissionResponse(BaseModel):
    order_id   : str | None = None
    payment_id : str | None = None
    status     : str
    total_cents: int | None = None
    error      : str | None = None
    eta_total_minutes   : Optional[int] = None
    eta_travel_minutes  : Optional[int] = None
    eta_cooking_minutes : Optional[int] = None
    eta_distance_km     : Optional[float] = None
    eta_unavailable         : Optional[bool] = None
    eta_unavailable_reason  : Optional[str] = None
    outsystems_debug    : Optional[dict] = None
