from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from schemas import OrderSubmission, OrderSubmissionResponse
from fulfilment_service import submit_order, get_order_status

app = FastAPI(title="Order Fulfilment Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/v1/order/submit", response_model=OrderSubmissionResponse)
def submit(payload: OrderSubmission):
    items = [item.model_dump() for item in payload.items]
    response, status_code = submit_order(
        customer_id=payload.customer_id,
        items=items,
        dropoff_address=payload.dropoff_address,
        dropoff_lat=payload.dropoff_lat,
        dropoff_lng=payload.dropoff_lng,
        idempotency_key=payload.idempotency_key,
    )
    return JSONResponse(content=response, status_code=status_code)


@app.get("/api/v1/order/{order_id}")
def get_order(order_id: str):
    response, status_code = get_order_status(order_id=order_id)
    return JSONResponse(content=response, status_code=status_code)


@app.get("/health")
def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8081)
