from supabase import Client
from maps_client import MapsClient, MapsClientError


def assign_kitchen_to_order(
    db: Client,
    order_id: str | None = None,
    delivery_address: str | None = None,
) -> tuple[dict, int]:
    order = {}

    if not delivery_address and order_id:
        order_result = db.table("orders").select("*").eq("id", order_id).execute()
        if not order_result.data:
            return {"error": "Order not found."}, 404
        order = order_result.data[0]
        delivery_address = order.get("delivery_address")

    if not delivery_address:
        return {
            "error": "Order is missing a delivery_address. Cannot perform assignment."
        }, 422

    kitchen_result = (
        db.table("kitchens")
        .select("*")
        .eq("is_active", True)
        .execute()
    )

    kitchens = kitchen_result.data
    if not kitchens:
        return {"error": "No active kitchens available."}, 503

    try:
        maps = MapsClient()
        destinations = [(k["lat"], k["lng"]) for k in kitchens]
        best_idx, distance_result = maps.nearest_from_address(
            address=delivery_address,
            destinations=destinations,
        )
    except MapsClientError as exc:
        return {"error": f"Maps service error: {str(exc)}"}, 502

    nearest_kitchen = kitchens[best_idx]

    return {
        "order_id": order_id,
        "user_id": order.get("user_id"),
        "total_amount": order.get("total_amount"),
        "items": order.get("items"),
        "delivery_address": delivery_address,
        "customer_lat": distance_result["customer_lat"],
        "customer_lng": distance_result["customer_lng"],
        "kitchen_id": nearest_kitchen["id"],
        "kitchen_name": nearest_kitchen["name"],
        "kitchen_address": nearest_kitchen["address"],
        "kitchen_lat": nearest_kitchen["lat"],
        "kitchen_lng": nearest_kitchen["lng"],
        "distance_meters": distance_result["distance_meters"],
        "duration_seconds": distance_result["duration_seconds"],
    }, 200
