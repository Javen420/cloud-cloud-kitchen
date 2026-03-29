import asyncio
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from schemas import UpdateStatusRequest
from orchestrator import poll_cooking_orders, update_order_status, get_orders_by_status

POLL_INTERVAL = int(os.getenv("POLL_INTERVAL_SECONDS", "10"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(polling_loop())
    yield
    task.cancel()


async def polling_loop():
    while True:
        try:
            await poll_cooking_orders()
        except Exception as exc:
            print(f"[coordinate-fulfilment] polling error: {exc}")
        await asyncio.sleep(POLL_INTERVAL)


app = FastAPI(title="Coordinate Order Fulfilment Composite", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/orders")
async def list_orders(status: str = "pending"):
    """
    Kitchen Dashboard UI calls this to list orders by status.
    e.g. GET /orders?status=cooking
         GET /orders?status=pending
    """
    response, status_code = await get_orders_by_status(status)
    return JSONResponse(content=response, status_code=status_code)


@app.put("/orders/{order_id}/status")
async def update_status(order_id: str, payload: UpdateStatusRequest):
    """
    Kitchen Dashboard UI calls this when kitchen presses:
      - "Started Cooking"   → { status: "cooking" }
      - "Finished Cooking"  → { status: "finished_cooking" }
    """
    response, status_code = await update_order_status(order_id, payload.status)
    return JSONResponse(content=response, status_code=status_code)


@app.get("/health")
def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8094)