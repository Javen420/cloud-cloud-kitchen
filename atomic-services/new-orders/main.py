import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Depends
from fastapi.responses import JSONResponse
from supabase import Client

ROOT_DIR = Path(__file__).resolve().parent
load_dotenv()  # loads from current dir, or just remove this line entirely
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from shared.database import get_supabase
from schemas import ConfirmOrderRequest
from order import confirm_order, get_confirmed_orders

app = FastAPI(title="New Orders Service", version="1.0.0")


def get_db() -> Client:
    return get_supabase()


@app.post("/orders")
def create_confirmed_order(
    payload: ConfirmOrderRequest,
    db: Client = Depends(get_db),
):
    response, status_code = confirm_order(
        db=db,
        order_id=payload.order_id,
        kitchen_id=payload.kitchen_id,
    )
    return JSONResponse(content=response, status_code=status_code)


@app.get("/orders/{order_id}")
def get_order_by_id(
    order_id: str,
    db: Client = Depends(get_db),
):
    from order import get_order
    response, status_code = get_order(db=db, order_id=order_id)
    return JSONResponse(content=response, status_code=status_code)


@app.put("/orders/{order_id}/status")
def update_order_status(
    order_id: str,
    payload: ConfirmOrderRequest,
    db: Client = Depends(get_db),
):
    response, status_code = confirm_order(
        db=db,
        order_id=order_id,
        kitchen_id=payload.kitchen_id,
    )
    return JSONResponse(content=response, status_code=status_code)


@app.get("/health")
def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8082)
