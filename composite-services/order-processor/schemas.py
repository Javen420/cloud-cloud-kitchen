from pydantic import BaseModel
from typing import Literal


class UpdateStatusRequest(BaseModel):
    status: Literal["cooking", "finished_cooking"]
