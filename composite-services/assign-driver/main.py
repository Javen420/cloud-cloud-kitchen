import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from shared.AMQP_Publisher import AMQPPublisher
from assign_driver_service import publisher, get_available_orders, assign_driver
from schemas import AssignDriverRequest

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await publisher.connect(RABBITMQ_URL, exchange_name="order_events")
    yield
    await publisher.close()


app = FastAPI(title="Assign Driver CS", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/driver/orders")
async def available_orders(
    rider_lat: float | None = Query(None),
    rider_lng: float | None = Query(None),
):
    response, status_code = await get_available_orders(
        rider_lat=rider_lat, rider_lng=rider_lng,
    )
    return JSONResponse(content=response, status_code=status_code)


@app.put("/api/v1/driver/assign")
async def assign(payload: AssignDriverRequest):
    response, status_code = await assign_driver(
        order_id=payload.order_id,
        driver_id=payload.driver_id,
        driver_lat=payload.driver_lat,
        driver_lng=payload.driver_lng,
        dropoff_lat=payload.dropoff_lat,
        dropoff_lng=payload.dropoff_lng,
    )
    return JSONResponse(content=response, status_code=status_code)


@app.get("/health")
def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8086)
