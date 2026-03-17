#puts connection to rabbitmq and publish functions into a class to be used by individual services
#

import json
import logging

import aio_pika #async version of pika
from aio_pika import Message, DeliveryMode, ExchangeType

logger = logging.getLogger(__name__)


class AMQPPublisher: #class creation

    def __init__(self):
        self._connection = None
        self._channel = None
        self._exchange = None

    async def connect(self, rabbitmq_url: str, exchange_name: str = "delivery"): #connection method
        self._connection = await aio_pika.connect_robust(rabbitmq_url)
        self._channel = await self._connection.channel()
        self._exchange = await self._channel.declare_exchange(
            exchange_name,
            ExchangeType.TOPIC,
            durable=True,
        )
        logger.info(f"AMQP publisher connected (exchange={exchange_name})")

    async def publish(self, routing_key: str, body: dict): #publish method
        if not self._exchange:
            logger.warning("AMQP publisher not connected, skipping publish")
            return

        try:
            message = Message(
                body=json.dumps(body).encode(),
                content_type="application/json",
                delivery_mode=DeliveryMode.PERSISTENT,
            )
            await self._exchange.publish(message, routing_key=routing_key)
            logger.info(f"Published {routing_key}: {body.get('order_id', 'N/A')}")
        except Exception as e:
            logger.error(f"Failed to publish {routing_key}: {e}")

    async def close(self): #closing connection
        if self._connection:
            await self._connection.close()
            logger.info("AMQP publisher closed")