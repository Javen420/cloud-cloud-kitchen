import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Depends
from fastapi.responses import JSONResponse
from supabase import Client
from redis import Redis

ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from shared.database import get_supabase
from shared.redis import get_redis
from schemas import CreateOrderRequest, UpdateOrderStatusRequest
from pendingorder import create_order, update_order_status, get_order

app = FastAPI(title="Pending Orders Service", version="1.0.0")


def get_db() -> Client:
    return get_supabase()

def get_r() -> Redis:
    return get_redis()


@app.post("/orders")
def create_pending_order(
    payload: CreateOrderRequest,
    db: Client = Depends(get_db),
    r: Redis = Depends(get_r),
):
    items = [item.model_dump() for item in payload.items]
    response, status_code = create_order(
        db=db, r=r,
        user_id=payload.user_id,
        items=items,
        total_amount=payload.total_amount,
        delivery_address=payload.delivery_address,
    )
    return JSONResponse(content=response, status_code=status_code)


@app.get("/orders/{order_id}")
def get_single_order(
    order_id: str,
    db: Client = Depends(get_db),
):
    response, status_code = get_order(db=db, order_id=order_id)
    return JSONResponse(content=response, status_code=status_code)


@app.put("/orders/{order_id}/status")
def update_order(
    order_id: str,
    payload: UpdateOrderStatusRequest,
    db: Client = Depends(get_db),
    r: Redis = Depends(get_r),
):
    response, status_code = update_order_status(
        db=db, r=r,
        order_id=order_id,
        status=payload.status,
        kitchen_id=payload.kitchen_id,
    )
    return JSONResponse(content=response, status_code=status_code)


@app.get("/health")
def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8085)
