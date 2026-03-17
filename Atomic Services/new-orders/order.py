from datetime import datetime
from supabase import Client


def confirm_order(
    db: Client,
    order_id: str,
    kitchen_id: str,
) -> tuple[dict, int]:

    # ── Fetch order ──────────────────────────────────────────────────────────
    result = db.table("orders").select("*").eq("id", order_id).execute()

    if not result.data:
        return {"error": "Order not found."}, 404

    order = result.data[0]

    if order["status"] != "pending":
        return {"error": f"Order is already {order['status']}."}, 409

    # ── Update to confirmed ──────────────────────────────────────────────────
    db.table("orders").update({
        "status"     : "confirmed",
        "kitchen_id" : kitchen_id,
        "updated_at" : datetime.utcnow().isoformat(),
    }).eq("id", order_id).execute()

    return {
        "order_id"      : order_id,
        "user_id"       : order["user_id"],
        "status"        : "confirmed",
        "total_amount"  : order["total_amount"],
        "kitchen_id"    : kitchen_id,
        "items"         : order["items"],
    }, 200


def get_confirmed_orders(db: Client) -> tuple[dict, int]:
    result = db.table("orders").select("*").eq("status", "confirmed").execute()
    return {"orders": result.data}, 200


def get_order(db: Client, order_id: str) -> tuple[dict, int]:
    result = db.table("orders").select("*").eq("id", order_id).execute()

    if not result.data:
        return {"error": "Order not found."}, 404

    return {"order": result.data[0]}, 200
