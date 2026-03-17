from datetime import datetime
from supabase import Client
from redis import Redis

LOCK_EXPIRY_SECONDS = 30


def create_order(
    db: Client,
    r: Redis,
    user_id: str,
    items: list,
    total_amount: int,
    delivery_address: str | None,
) -> tuple[dict, int]:

    # ── Redis SETNX: prevent duplicate submissions ───────────────────────────
    lock_key = f"order:lock:{user_id}"
    locked = r.set(lock_key, "1", nx=True, ex=LOCK_EXPIRY_SECONDS)

    if not locked:
        return {"error": "Order already in progress for this user. Retry shortly."}, 409

    try:
        result = db.table("orders").insert({
            "user_id"           : user_id,
            "items"             : items,
            "total_amount"      : total_amount,
            "delivery_address"  : delivery_address,
            "status"            : "pending",
            "updated_at"        : datetime.utcnow().isoformat(),
        }).execute()

        order = result.data[0]
        return {
            "order_id"          : order["id"],
            "user_id"           : order["user_id"],
            "status"            : order["status"],
            "total_amount"      : order["total_amount"],
            "items"             : order["items"],
            "delivery_address"  : order["delivery_address"],
        }, 201

    except Exception as e:
        r.delete(lock_key)  # release lock on failure
        raise e


def update_order_status(
    db: Client,
    r: Redis,
    order_id: str,
    status: str,
    kitchen_id: str | None = None,
) -> tuple[dict, int]:

    result = db.table("orders").select("*").eq("id", order_id).execute()

    if not result.data:
        return {"error": "Order not found."}, 404

    order = result.data[0]

    update_data = {
        "status"     : status,
        "updated_at" : datetime.utcnow().isoformat(),
    }
    if kitchen_id:
        update_data["kitchen_id"] = kitchen_id

    db.table("orders").update(update_data).eq("id", order_id).execute()

    # ── Release Redis lock on final status ───────────────────────────────────
    if status in ("confirmed", "failed"):
        r.delete(f"order:lock:{order['user_id']}")

    return {
        "order_id"      : order_id,
        "user_id"       : order["user_id"],
        "status"        : status,
        "total_amount"  : order["total_amount"],
        "items"         : order["items"],
    }, 200


def get_order(db: Client, order_id: str) -> tuple[dict, int]:
    result = db.table("orders").select("*").eq("id", order_id).execute()

    if not result.data:
        return {"error": "Order not found."}, 404

    order = result.data[0]
    return {
        "order_id"          : order["id"],
        "user_id"           : order["user_id"],
        "status"            : order["status"],
        "total_amount"      : order["total_amount"],
        "items"             : order["items"],
        "delivery_address"  : order["delivery_address"],
    }, 200
