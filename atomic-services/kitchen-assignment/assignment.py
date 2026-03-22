from supabase import Client
from maps_client import MapsClient, MapsClientError


def assign_kitchen_to_order(
    db: Client,
    order_id: str,
) -> tuple[dict, int]:
    # ── 1. Fetch order ────────────────────────────────────────────────────────
    order_result = db.table("orders").select("*").eq("id", order_id).execute()
    if not order_result.data:
        return {"error": "Order not found."}, 404

    order = order_result.data[0]

    delivery_address = order.get("delivery_address")
    if not delivery_address:
        return {
            "error": "Order is missing a delivery_address. "
                     "Cannot perform proximity-based assignment."
        }, 422

    # ── 2. Load active kitchens ───────────────────────────────────────────────
    kitchen_result = (
        db.table("kitchens")
        .select("*")
        .eq("is_active", True)
        .execute()
    )

    kitchens = kitchen_result.data
    if not kitchens:
        return {"error": "No active kitchens available."}, 503

    # ── 3. Geocode address → find nearest kitchen ─────────────────────────────
    try:
        maps = MapsClient()
        destinations = [(k["lat"], k["lng"]) for k in kitchens]
        best_idx, distance_result = maps.nearest_from_address(
            address=delivery_address,
            destinations=destinations,
        )
    except MapsClientError as exc:
        return {"error": f"Maps service error: {str(exc)}"}, 502

    # ── 4. Build response ─────────────────────────────────────────────────────
    nearest_kitchen = kitchens[best_idx]

    return {
        "order_id":          order_id,
        "user_id":           order.get("user_id"),
        "total_amount":      order.get("total_amount"),
        "items":             order.get("items"),
        "delivery_address":  delivery_address,
        "kitchen_id":        nearest_kitchen["id"],
        "kitchen_name":      nearest_kitchen["name"],
        "kitchen_address":   nearest_kitchen["address"],
        "distance_meters":   distance_result.distance_meters,
        "duration_seconds":  distance_result.duration_seconds,
    }, 200