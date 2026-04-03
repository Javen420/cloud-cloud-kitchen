from pydantic import BaseModel
from typing import Literal


class UpdateStatusRequest(BaseModel):
    status: Literal["cooking", "finished_cooking", "driver_assigned", "out_for_delivery", "delivered"]