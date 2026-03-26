from contextlib import asynccontextmanager
from fastapi import FastAPI
from shared.config import Settings
from shared.AMQP_Publisher import AMQPPublisher
from app.routes import router
from app.clients import ETAClient
import redis.asyncio as aioredis


settings = Settings()
publisher = AMQPPublisher()


@asynccontextmanager
async def lifespan(app: FastAPI):
    host, port = settings.redis_addr.split(":")
    app.state.redis = aioredis.Redis(
        host=host,
        port=int(port),
        password=settings.redis_password or None,
        decode_responses=True,
    )
    app.state.eta_client = ETAClient(settings.eta_calculation_url)
    await publisher.connect(settings.rabbitmq_url, exchange_name="order_events")
    app.state.publisher = publisher
    yield
    await publisher.close()
    await app.state.eta_client.close()
    await app.state.redis.aclose()


app = FastAPI(title="ETA Tracking CS", lifespan=lifespan)
app.include_router(router)


@app.get("/health")
def health():
    return {"status": "healthy"}
