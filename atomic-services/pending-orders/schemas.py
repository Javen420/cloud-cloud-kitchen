from pydantic import BaseModel, Field
from typing import List, Any

class OrderItem(BaseModel):
    Id          : int       # matches OutSystems menu response
    Name        : str
    quantity    : int
    price       : float     # OutSystems uses float (e.g. 6.00000000)

class CreateOrderRequest(BaseModel):
    user_id             : str
    items               : List[OrderItem]
    total_amount        : float = Field(..., gt=0)
    delivery_address    : str | None = None

class UpdateOrderStatusRequest(BaseModel):
    status      : str
    kitchen_id  : str | None = None

class OrderResponse(BaseModel):
    order_id            : str
    user_id             : str
    status              : str
    total_amount        : float
    items               : List[Any]
    delivery_address    : str | None = None
    error               : str | None = None
