from pydantic import BaseModel
from typing import Any, List

from pydantic import BaseModel
from typing import Any, List

class ConfirmOrderRequest(BaseModel):
    order_id    : str        # ← was missing
    kitchen_id  : str

class OrderResponse(BaseModel):
    order_id    : str
    user_id     : str
    status      : str
    total_amount: float
    kitchen_id  : str | None = None
    items       : List[Any]
    error       : str | None = None
