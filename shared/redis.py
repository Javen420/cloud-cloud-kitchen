import os
import redis

def get_redis() -> redis.Redis:
    return redis.Redis(
        host=os.getenv("REDIS_ADDR", "redis:6379").split(":")[0],
        port=int(os.getenv("REDIS_ADDR", "redis:6379").split(":")[1]),
        password=os.getenv("REDIS_PASSWORD"),
        decode_responses=True,
    )
