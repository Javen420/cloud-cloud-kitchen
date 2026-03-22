from contextlib import asynccontextmanager
from fastapi import FastAPI
from shared.config import Settings
from shared.amqp import AMQPPublisher

settings = Settings()
publisher = AMQPPublisher()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await publisher.connect(settings.rabbitmq_url)
    app.state.publisher = publisher
    yield
    await publisher.close()

app = FastAPI(lifespan=lifespan)
