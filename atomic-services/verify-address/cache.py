import redis
import json
import os

CACHE_TTL = 3600 * 24  # 24 hours

# Initialize Redis
redis_client = None

try:
    REDIS_HOST = os.environ.get("REDIS_HOST", "localhost")
    REDIS_PORT = int(os.environ.get("REDIS_PORT", 6379))
    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)
except Exception as e:
    print(f"Failed to connect to Redis: {e}")


def get_cached_geocode(address: str) -> dict | None:
    """Retrieve cached geocode result from Redis."""
    if not redis_client:
        return None
    
    cache_key = f"geocode:{address.lower().strip()}"
    try:
        cached_data = redis_client.get(cache_key)
        if cached_data:
            return json.loads(cached_data)
    except Exception as e:
        print(f"Redis get error: {e}")
    
    return None


def cache_geocode(address: str, geo_data: dict) -> None:
    """Store geocode result in Redis."""
    if not redis_client:
        return
    
    cache_key = f"geocode:{address.lower().strip()}"
    try:
        redis_client.setex(cache_key, CACHE_TTL, json.dumps(geo_data))
    except Exception as e:
        print(f"Redis set error: {e}")


def is_redis_healthy() -> bool:
    """Check Redis connectivity."""
    if not redis_client:
        return False
    
    try:
        return redis_client.ping()
    except:
        return False
