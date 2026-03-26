from fastapi import APIRouter, Depends, HTTPException, Query, Header
from app.models import DropoffRequest
from app.cache import TrackingCache
from app.clients import ETAClient
from app.dependencies import get_cache, get_client, get_publisher
from shared.AMQP_Publisher import AMQPPublisher

router = APIRouter(prefix="/api/v1")

@router.post("/eta/dropoff")
async def store_dropoff(
    req: DropoffRequest,
    cache: TrackingCache = Depends(get_cache),
):
    await cache.store_dropoff(
        req.order_id, req.driver_id, req.customer_id,
        req.dropoff_lat, req.dropoff_lng,
    )
    return {"status": "cached", "order_id": req.order_id}

@router.get("/eta/{order_id}")
async def get_eta(
    order_id: str,
    driver_lat: float = Query(...),
    driver_lng: float = Query(...),
    x_driver_id: str = Header(..., alias="X-Driver-ID"),
    cache: TrackingCache = Depends(get_cache),
    client: ETAClient = Depends(get_client),
    publisher: AMQPPublisher = Depends(get_publisher),
):
    # 1. Check cache
    cached = await cache.get_cached_eta(order_id)
    if cached:
        return cached

    # 2. Get dropoff
    dropoff = await cache.get_dropoff(order_id)
    if not dropoff:
        raise HTTPException(404, detail={
            "status": "calculating",
            "message": "ETA is being calculated. Retry in a few seconds.",
            "retry_after_seconds": 3,
        })

    # 3. Verify driver
    assigned_driver = await cache.get_driver_id(order_id)
    if assigned_driver and assigned_driver != x_driver_id:
        raise HTTPException(403, detail={
            "error": "not_your_order",
            "message": "This order is assigned to a different driver",
        })

    # 4. Call Go ETA Calculation
    eta = await client.calculate(
        driver_lat, driver_lng,
        dropoff["latitude"], dropoff["longitude"],
        order_id, x_driver_id,
    )
    if not eta:
        raise HTTPException(502, detail="ETA calculation unavailable")

    # Cache result for 30 s so rapid re-polls skip the Go service
    await cache.store_eta(order_id, eta, ttl=30)

    # 5. Publish notification
    customer_id = await cache.get_customer_id(order_id)
    if customer_id:
        await publisher.publish("eta.calculated", {
            "order_id": order_id,
            "customer_id": customer_id,
            "estimated_minutes": eta["estimated_minutes"],
        })

    # 6. Return
    return eta
