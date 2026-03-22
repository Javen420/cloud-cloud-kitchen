from pydantic import BaseModel
from typing import Optional


class AssignKitchenRequest(BaseModel):
    order_id: str


class AddKitchenRequest(BaseModel):
    name: str
    address: str
    lat: float
    lng: float
    is_active: bool = True


class KitchenResponse(BaseModel):
    kitchen_id: str
    name: str
    address: str
    lat: float
    lng: float
    is_active: bool


class AssignmentResponse(BaseModel):
    order_id: str
    kitchen_id: str
    kitchen_name: str
    kitchen_address: str
    distance_meters: float
    duration_seconds: float