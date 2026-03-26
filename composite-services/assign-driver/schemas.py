from pydantic import BaseModel
from typing import Optional


class AssignDriverRequest(BaseModel):
    order_id: str
    driver_id: str
    driver_lat: float
    driver_lng: float
    # Caller may supply dropoff coords when the DB record lacks them
    dropoff_lat: Optional[float] = None
    dropoff_lng: Optional[float] = None
