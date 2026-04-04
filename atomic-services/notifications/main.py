import asyncio
import contextlib
import json
import os
from contextlib import asynccontextmanager

import aio_pika
from aio_pika import ExchangeType
from aio_pika import Message, DeliveryMode
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import firebase_admin
from firebase_admin import credentials, messaging


def _log(msg: str):
    print(msg, flush=True)


def _notification_title(status: str | None) -> str:
    mapping = {
        "confirmed": "Order confirmed",
        "pending": "Order received",
        "cooking": "Kitchen is preparing your order",
        "finished_cooking": "Your order is ready for pickup",
        "driver_assigned": "Driver assigned",
        "out_for_delivery": "Order on the way",
        "delivered": "Order delivered",
    }
    return mapping.get((status or "").lower(), "Order update")


def _notification_body(payload: dict) -> str:
    if payload.get("message"):
        return str(payload["message"])

    status = str(payload.get("status", "")).lower()
    if status == "pending":
        kitchen_name = payload.get("kitchen_name")
        if kitchen_name:
            return f"Your order was assigned to {kitchen_name}."
    if status == "finished_cooking":
        return "Your order is ready and waiting for a rider."
    if status == "eta.calculated" and payload.get("estimated_minutes") is not None:
        return f"Estimated arrival: {payload['estimated_minutes']} minutes."
    return "Your order status updated."


def _init_firebase():
    if firebase_admin._apps:
        return

    sa_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
    sa_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")

    if sa_json:
        cred = credentials.Certificate(json.loads(sa_json))
    elif sa_path:
        if not os.path.exists(sa_path):
            raise RuntimeError(f"FIREBASE_SERVICE_ACCOUNT_PATH not found: {sa_path}")
        cred = credentials.Certificate(sa_path)
    else:
        raise RuntimeError(
            "Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH"
        )

    firebase_admin.initialize_app(cred)


RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
QUEUE_NAME = os.getenv("NOTIFICATION_QUEUE", "notifications")
RETRY_QUEUE_NAME = os.getenv("NOTIFICATION_RETRY_QUEUE", "notifications.retry")
DLQ_NAME = os.getenv("NOTIFICATION_DLQ", "notifications.dlq")
RETRY_DELAY_MS = int(os.getenv("NOTIFICATION_RETRY_DELAY_MS", "5000"))
MAX_RETRIES = int(os.getenv("NOTIFICATION_MAX_RETRIES", "3"))
EXCHANGE_NAME = os.getenv("NOTIFICATION_EXCHANGE", "order_events")
PUBLISH_TOPIC_PREFIX = os.getenv("FCM_TOPIC_PREFIX", "order_")


class SubscribeRequest(BaseModel):
    token: str = Field(..., description="FCM registration token (web or mobile)")
    order_id: str = Field(..., description="Order ID to subscribe to")


class UnsubscribeRequest(BaseModel):
    token: str
    order_id: str


async def _consume_and_forward():
    connection = await aio_pika.connect_robust(RABBITMQ_URL)
    _log(f"Connected to RabbitMQ (exchange={EXCHANGE_NAME}, queue={QUEUE_NAME})")
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=10)

    # Ensure queues exist for retry/DLQ (works with default exchange publishing)
    await channel.declare_queue(QUEUE_NAME, durable=True)
    await channel.declare_queue(
        RETRY_QUEUE_NAME,
        durable=True,
        arguments={
            "x-message-ttl": RETRY_DELAY_MS,
            "x-dead-letter-exchange": "",
            "x-dead-letter-routing-key": QUEUE_NAME,
        },
    )
    await channel.declare_queue(DLQ_NAME, durable=True)

    if EXCHANGE_NAME:
        exchange = await channel.declare_exchange(
            EXCHANGE_NAME, ExchangeType.TOPIC, durable=True
        )
        queue = await channel.declare_queue(QUEUE_NAME, durable=True)
        await queue.bind(exchange, routing_key="#")
    else:
        # Consume from a queue published to via default exchange
        queue = await channel.declare_queue(QUEUE_NAME, durable=True)

    async with queue.iterator() as queue_iter:
        async for message in queue_iter:
            # We will ack manually so we can route failures to retry/DLQ.
            async with message.process(requeue=False, ignore_processed=True):
                headers = message.headers or {}
                retry_count = int(headers.get("x-retry-count", 0) or 0)

                def _publish_to_queue(queue_name: str, new_headers: dict):
                    return channel.default_exchange.publish(
                        Message(
                            body=message.body,
                            content_type=message.content_type or "application/json",
                            delivery_mode=DeliveryMode.PERSISTENT,
                            headers=new_headers,
                        ),
                        routing_key=queue_name,
                    )

                try:
                    payload = json.loads(message.body.decode())
                    order_id = payload.get("order_id")
                    if not order_id:
                        raise ValueError("missing order_id")

                    _init_firebase()
                    topic = f"{PUBLISH_TOPIC_PREFIX}{order_id}"
                    status = payload.get("status")
                    title = _notification_title(status)
                    body = _notification_body(payload)
                    fcm_msg = messaging.Message(
                        topic=topic,
                        notification=messaging.Notification(title=title, body=body),
                        data={k: str(v) for k, v in payload.items() if v is not None},
                        webpush=messaging.WebpushConfig(
                            notification=messaging.WebpushNotification(
                                title=title,
                                body=body,
                            ),
                            fcm_options=messaging.WebpushFCMOptions(
                                link=f"/customer/track/{order_id}"
                            ),
                        ),
                    )
                    response = messaging.send(fcm_msg)
                    print(f"FCM message sent successfully: {response}")

                except Exception as e:
                    # Retry then DLQ
                    base_headers = dict(headers)
                    base_headers["x-last-error"] = str(e)

                    if retry_count < MAX_RETRIES:
                        base_headers["x-retry-count"] = retry_count + 1
                        await _publish_to_queue(RETRY_QUEUE_NAME, base_headers)
                    else:
                        base_headers["x-retry-count"] = retry_count
                        await _publish_to_queue(DLQ_NAME, base_headers)

                # message.process() will ack unless we raise; we always consume/route then ack.


async def _safe_consume():
    try:
        await _consume_and_forward()
    except asyncio.CancelledError:
        raise
    except Exception as e:
        _log(f"Consumer task crashed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        _init_firebase()
        _log("Firebase admin initialized.")
    except Exception as e:
        _log(f"Firebase init failed (notifications will not send): {e}")

    task = asyncio.create_task(_safe_consume())
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError, Exception):
        await task


app = FastAPI(title="Notification Service (FCM)", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/notifications/subscribe")
def subscribe(req: SubscribeRequest):
    _init_firebase()
    topic = f"{PUBLISH_TOPIC_PREFIX}{req.order_id}"
    try:
        messaging.subscribe_to_topic([req.token], topic)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "ok", "topic": topic}


@app.post("/api/notifications/unsubscribe")
def unsubscribe(req: UnsubscribeRequest):
    _init_firebase()
    topic = f"{PUBLISH_TOPIC_PREFIX}{req.order_id}"
    try:
        messaging.unsubscribe_from_topic([req.token], topic)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "ok", "topic": topic}


@app.post("/api/notifications/test")
def test_send(order_id: str, message: str = "test"):
    """
    Smoke-test endpoint: sends a test payload to topic order_{order_id}.
    """
    _init_firebase()
    topic = f"{PUBLISH_TOPIC_PREFIX}{order_id}"
    fcm_msg = messaging.Message(
        topic=topic,
        notification=messaging.Notification(title="Order update", body=message),
        data={"kind": "test", "message": message, "order_id": order_id},
        webpush=messaging.WebpushConfig(
            notification=messaging.WebpushNotification(
                title="Order update",
                body=message,
            ),
            fcm_options=messaging.WebpushFCMOptions(link=f"/customer/track/{order_id}"),
        ),
    )
    msg_id = messaging.send(fcm_msg)
    return {"status": "ok", "topic": topic, "message_id": msg_id}


@app.get("/health")
def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8090)

