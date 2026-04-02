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
from schemas import AssignKitchenRequest, AddKitchenRequest
from assignment import assign_kitchen_to_order
from kitchen import add_kitchen, get_all_kitchens, get_kitchen_by_id

app = FastAPI(title="Kitchen Assignment Service", version="1.0.0")


def get_db() -> Client:
    return get_supabase()


# ── Kitchen Assignment ────────────────────────────────────────────────────────

@app.post("/assign")
def assign_kitchen(
    payload: AssignKitchenRequest,
    db: Client = Depends(get_db),
):
    """
    Given an order_id, fetch the order's delivery_lat/lng from the orders table,
    find the nearest available kitchen via Google Maps, and return the assignment.
    """
    response, status_code = assign_kitchen_to_order(
        db=db,
        order_id=payload.order_id,
        delivery_address=payload.delivery_address,
    )
    return JSONResponse(content=response, status_code=status_code)


# ── Kitchen CRUD ──────────────────────────────────────────────────────────────

@app.post("/kitchens")
def create_kitchen(
    payload: AddKitchenRequest,
    db: Client = Depends(get_db),
):
    response, status_code = add_kitchen(db=db, payload=payload)
    return JSONResponse(content=response, status_code=status_code)


@app.get("/kitchens")
def list_kitchens(db: Client = Depends(get_db)):
    response, status_code = get_all_kitchens(db=db)
    return JSONResponse(content=response, status_code=status_code)


@app.get("/kitchens/{kitchen_id}")
def get_kitchen(kitchen_id: str, db: Client = Depends(get_db)):
    response, status_code = get_kitchen_by_id(db=db, kitchen_id=kitchen_id)
    return JSONResponse(content=response, status_code=status_code)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8091)
