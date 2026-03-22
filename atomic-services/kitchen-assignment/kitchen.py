from supabase import Client
from schemas import AddKitchenRequest


def add_kitchen(db: Client, payload: AddKitchenRequest) -> tuple[dict, int]:
    result = db.table("kitchens").insert({
        "name":      payload.name,
        "address":   payload.address,
        "lat":       payload.lat,
        "lng":       payload.lng,
        "is_active": payload.is_active,
    }).execute()

    if not result.data:
        return {"error": "Failed to insert kitchen."}, 500

    kitchen = result.data[0]
    return {
        "kitchen_id": kitchen["id"],
        "name":       kitchen["name"],
        "address":    kitchen["address"],
        "lat":        kitchen["lat"],
        "lng":        kitchen["lng"],
        "is_active":  kitchen["is_active"],
    }, 201


def get_all_kitchens(db: Client) -> tuple[dict, int]:
    result = db.table("kitchens").select("*").execute()
    return {"kitchens": result.data}, 200


def get_kitchen_by_id(db: Client, kitchen_id: str) -> tuple[dict, int]:
    result = db.table("kitchens").select("*").eq("id", kitchen_id).execute()
    if not result.data:
        return {"error": "Kitchen not found."}, 404
    return {"kitchen": result.data[0]}, 200