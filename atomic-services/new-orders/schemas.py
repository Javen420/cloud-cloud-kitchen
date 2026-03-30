from pydantic import BaseModel
from typing import Any, List
from datetime import datetime


class CreateOrderRequest(BaseModel):
    customer_id     : str
    items           : list[dict]
    total_cents     : int
    dropoff_address : str
    dropoff_lat     : float | None = None
    dropoff_lng     : float | None = None
    payment_id      : str


class Order(BaseModel):
    order_id        : str
    customer_id     : str
    items           : list[dict]
    total_cents     : int
    dropoff_address : str
    dropoff_lat     : float | None = None
    dropoff_lng     : float | None = None
    payment_id      : str
    status          : str
    created_at      : datetime | None = None


class UpdateStatusRequest(BaseModel):
    status : str

class UpdateKitchenRequest(BaseModel):
    kitchen_id      : str
    kitchen_name    : str | None = None
    kitchen_address : str | None = None