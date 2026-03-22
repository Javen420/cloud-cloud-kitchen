import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Depends
from fastapi.responses import JSONResponse
from supabase import Client

ROOT_DIR = Path(__file__).resolve().parent
load_dotenv()
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from shared.database import get_supabase
from schemas import CreateOrderRequest, UpdateStatusRequest
from order import create_order, get_order, list_unassigned, update_order_status

app = FastAPI(title="New Orders Service", version="2.0.0")


def get_db() -> Client:
    return get_supabase()


@app.post("/api/v1/orders")
def create(
    payload: CreateOrderRequest,
    db: Client = Depends(get_db),
):
    response, status_code = create_order(
        db=db,
        customer_id=payload.customer_id,
        items=payload.items,
        total_cents=payload.total_cents,
        dropoff_address=payload.dropoff_address,
        dropoff_lat=payload.dropoff_lat,
        dropoff_lng=payload.dropoff_lng,
        payment_id=payload.payment_id,
    )
    return JSONResponse(content=response, status_code=status_code)


@app.get("/api/v1/orders/unassigned")
def unassigned(db: Client = Depends(get_db)):
    response, status_code = list_unassigned(db=db)
    return JSONResponse(content=response, status_code=status_code)


@app.get("/api/v1/orders/{order_id}")
def get_order_by_id(
    order_id: str,
    db: Client = Depends(get_db),
):
    response, status_code = get_order(db=db, order_id=order_id)
    return JSONResponse(content=response, status_code=status_code)


@app.put("/api/v1/orders/{order_id}/status")
def update_status(
    order_id: str,
    payload: UpdateStatusRequest,
    db: Client = Depends(get_db),
):
    response, status_code = update_order_status(db=db, order_id=order_id, status=payload.status)
    return JSONResponse(content=response, status_code=status_code)


@app.get("/health")
def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8082)
