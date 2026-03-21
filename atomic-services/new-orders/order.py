from supabase import Client


def create_order(
    db: Client,
    customer_id: str,
    items: list[dict],
    total_cents: int,
    dropoff_address: str,
    dropoff_lat: float | None,
    dropoff_lng: float | None,
    payment_id: str,
) -> tuple[dict, int]:

    result = db.table("orders").insert({
        "user_id"          : customer_id,
        "items"            : items,
        "total_amount"     : total_cents,
        "delivery_address" : dropoff_address,
        "status"           : "pending",
    }).execute()

    if not result.data:
        return {"error": "Failed to create order."}, 500

    order = result.data[0]
    return {
        "order_id"       : order["id"],
        "customer_id"    : order["user_id"],
        "items"          : order["items"],
        "total_amount"   : order["total_amount"],
        "delivery_address": order["delivery_address"],
        "status"         : order["status"],
    }, 201


def get_order(db: Client, order_id: str) -> tuple[dict, int]:
    result = db.table("orders").select("*").eq("id", order_id).execute()

    if not result.data:
        return {"error": "Order not found."}, 404

    return {"order": result.data[0]}, 200


def list_unassigned(db: Client) -> tuple[dict, int]:
    result = (
        db.table("orders")
        .select("*")
        .eq("status", "pending")
        .order("updated_at")
        .limit(20)
        .execute()
    )
    return {"orders": result.data}, 200


def update_order_status(db: Client, order_id: str, status: str) -> tuple[dict, int]:
    result = db.table("orders").select("*").eq("id", order_id).execute()

    if not result.data:
        return {"error": "Order not found."}, 404

    db.table("orders").update({"status": status}).eq("id", order_id).execute()

    return {"order_id": order_id, "status": status}, 200
