import fastapi

def main():
    app = fastapi.FastAPI()
    await publisher.publish("order.assigned", {
        "order_id": order_id,
        "kitchen_id": kitchen_id,
        "customer_id": customer_id,
        "estimated_minutes": eta_minutes,
    })
