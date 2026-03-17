import os
from fastapi import FastAPI
from fastapi.responses import JSONResponse


from schemas import SubmitOrderRequest, SubmitOrderResponse
from fulfilment_service import submit_order

app = FastAPI(title="Order Fulfilment Service", version="1.0.0")


@app.post("/api/v1/order/submit", response_model=SubmitOrderResponse)
def submit(payload: SubmitOrderRequest):
    items = [item.model_dump() for item in payload.items]
    response, status_code = submit_order(
        user_id             =payload.user_id,
        items               =items,
        total_amount        =payload.total_amount,
        delivery_address    =payload.delivery_address,
        stripe_customer_id  =payload.stripe_customer_id,
        idempotency_key     =payload.idempotency_key,
    )
    return JSONResponse(content=response, status_code=status_code)


@app.get("/health")
def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8081)
