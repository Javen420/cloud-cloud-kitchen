import json
import redis.asyncio as redis


class TrackingCache:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    async def store_dropoff(self, order_id: str, driver_id: str,
                            customer_id: str, lat: float, lng: float):
        pipe = self.redis.pipeline()
        pipe.set(f"dropoff:{order_id}",
                 json.dumps({"latitude": lat, "longitude": lng}),
                 ex=86400)
        pipe.set(f"order:driver:{order_id}", driver_id, ex=86400)
        pipe.set(f"order:customer:{order_id}", customer_id, ex=86400)
        await pipe.execute()

    async def get_dropoff(self, order_id: str) -> dict | None:
        data = await self.redis.get(f"dropoff:{order_id}")
        if not data:
            return None
        return json.loads(data)

    async def get_driver_id(self, order_id: str) -> str | None:
        return await self.redis.get(f"order:driver:{order_id}")

    async def get_customer_id(self, order_id: str) -> str | None:
        return await self.redis.get(f"order:customer:{order_id}")

    async def get_cached_eta(self, order_id: str) -> dict | None:
        data = await self.redis.get(f"eta:{order_id}")
        if not data:
            return None
        return json.loads(data)

    async def store_eta(self, order_id: str, eta: dict, ttl: int = 30):
        await self.redis.set(f"eta:{order_id}", json.dumps(eta), ex=ttl)