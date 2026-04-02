import os
import uuid
import json
import httpx
from urllib.parse import urlsplit, urlunsplit

from shared.AMQP_Publisher import AMQPPublisher

PAYMENT_URL    = os.getenv("PAYMENT_URL", "http://payment:8089")
NEW_ORDERS_URL = os.getenv(
    "NEW_ORDERS_URL",
    "https://personal-dkkhoptv.outsystemscloud.com/NewOrders/rest/OrdersAPI",
)
RABBITMQ_URL   = os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/")
# Must match checkout UI delivery line (default $4.99 → 499 cents)
DELIVERY_FEE_CENTS = int(os.getenv("DELIVERY_FEE_CENTS", "499"))

# Shared async publisher — initialised in main.py lifespan
publisher = AMQPPublisher()


def _sanitize_base_url(url: str) -> str:
    parts = urlsplit(url.strip())
    return urlunsplit((parts.scheme, parts.netloc, parts.path.rstrip("/"), "", ""))


SANITIZED_NEW_ORDERS_URL = _sanitize_base_url(NEW_ORDERS_URL)


async def _request_first_success(
    client: httpx.AsyncClient,
    method: str,
    candidates: list[str],
    **kwargs,
) -> httpx.Response:
    last_response = None

    for url in candidates:
        resp = await client.request(method, url, **kwargs)
        if resp.status_code not in (404, 405):
            return resp
        last_response = resp

    return last_response


async def publish_notification(user_id: str, order_id: str, status: str, message: str):
    await publisher.publish("order.created", {
        "user_id"  : user_id,
        "order_id" : order_id,
        "status"   : status,
        "message"  : message,
    })


def _normalize_order_for_ui(raw: dict) -> dict:
    """
    Normalize either OutSystems or local new-orders response into
    the shape OrderUI tracking expects.
    """
    # Local new-orders/supabase style
    if "id" in raw or "order_id" in raw:
        amount_cents = raw.get("total_cents")
        if amount_cents is None:
            amount_cents = raw.get("total_amount")
        return {
            "order_id": raw.get("order_id") or raw.get("id"),
            "status": raw.get("status") or "confirmed",
            "dropoff_address": raw.get("dropoff_address") or raw.get("delivery_address", ""),
            "total_cents": int(amount_cents or 0),
            "created_at": raw.get("created_at"),
        }

    # OutSystems style
    status = (raw.get("KitchenAssignStatus") or "pending").lower()
    status_map = {
        "pending": "confirmed",
        "cooking": "preparing",
        "finished_cooking": "preparing",
        "driver_assigned": "out_for_delivery",
        "out_for_delivery": "out_for_delivery",
        "delivered": "delivered",
    }
    return {
        "order_id": str(raw.get("OrderId", "")),
        "status": status_map.get(status, "confirmed"),
        "dropoff_address": raw.get("DeliveryAddress", ""),
        "total_cents": int(raw.get("TotalPrice", 0) or 0),
        "created_at": raw.get("CreatedAt"),
    }


async def _fetch_order_by_id(order_id: int) -> tuple[dict | None, int]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await _request_first_success(
            client,
            "GET",
            [
                f"{SANITIZED_NEW_ORDERS_URL}/GetOrder",
                f"{SANITIZED_NEW_ORDERS_URL}/api/v1/order",
            ],
            params={"OrderId": str(order_id)},
        )

    if resp.status_code != 200:
        return None, resp.status_code

    body = resp.json()
    if isinstance(body, list):
        return (body[0] if body else None), 200
    return body, 200


async def _reconcile_created_order_id(
    *,
    customer_id: str,
    delivery_address: str,
    total_cents: int,
    payment_id: str,
) -> int | None:
    """
    Some OutSystems deployments return 0 for CreateOrder even when the row is created.
    Reconcile by querying the orders list and matching by strong signature.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await _request_first_success(
            client,
            "GET",
            [
                f"{SANITIZED_NEW_ORDERS_URL}/GetAll",
                f"{SANITIZED_NEW_ORDERS_URL}/GetPending",
                f"{SANITIZED_NEW_ORDERS_URL}/api/v1/orders",
            ],
        )

    if resp.status_code != 200:
        return None

    body = resp.json()
    if not isinstance(body, list):
        return None

    for raw in reversed(body):
        try:
            oid = int(raw.get("OrderId", 0) or 0)
        except (TypeError, ValueError):
            continue
        if oid <= 0:
            continue

        if payment_id and str(raw.get("PaymentId", "")) != str(payment_id):
            continue
        if str(raw.get("CustId", "")) != str(customer_id):
            continue
        if int(raw.get("TotalPrice", 0) or 0) != int(total_cents):
            continue
        if str(raw.get("DeliveryAddress", "")) != str(delivery_address):
            continue
        return oid

    return None


async def submit_order(
    customer_id: str,
    items: list,
    dropoff_address: str,
    dropoff_lat: float | None,
    dropoff_lng: float | None,
    idempotency_key: str,
    payment_intent_id: str | None = None,
) -> tuple[dict, int]:
    """
    Orchestrates the full order flow:
      1. Calculate total from items
      2. Process payment via Payment service → Stripe
      3. If payment fails → return error, don't create order
      4. Create order in New Orders service
      5. Publish order.created notification via AMQP
      6. Return confirmation
    """

    # ── Step 1: Calculate total (subtotal + delivery — same as checkout page) ─
    total_cents = 0
    for item in items:
        total_cents += int(round(item["price"] * item["quantity"] * 100))
    total_cents += DELIVERY_FEE_CENTS

    order_id = str(uuid.uuid4())

    # ── Step 2: Process/verify payment ──────────────────────────────────────────
    if payment_intent_id:
        async with httpx.AsyncClient(timeout=10.0) as client:
            payment_resp = await client.get(f"{PAYMENT_URL}/api/v1/payment/intents/{payment_intent_id}")
        if payment_resp.status_code != 200:
            try:
                err_body = payment_resp.json()
            except Exception:
                err_body = {"error": f"Payment service returned {payment_resp.status_code}"}
            return {
                "order_id"   : order_id,
                "status"     : "failed",
                "total_cents": total_cents,
                "error"      : err_body.get("error", "Payment verification failed"),
            }, payment_resp.status_code
        payment_data = payment_resp.json()
        if payment_data.get("status") not in ("succeeded", "requires_capture"):
            return {
                "order_id"   : order_id,
                "status"     : "failed",
                "total_cents": total_cents,
                "error"      : "Payment has not succeeded.",
            }, 402
        if int(payment_data.get("amount_cents", 0)) != total_cents:
            return {
                "order_id": order_id,
                "status": "failed",
                "total_cents": total_cents,
                "error": "Payment amount does not match checkout total.",
            }, 400
        payment_data["payment_id"] = payment_data.get("payment_id") or payment_intent_id
    else:
        async with httpx.AsyncClient(timeout=10.0) as client:
            payment_resp = await client.post(
                f"{PAYMENT_URL}/api/v1/payment",
                json={
                    "order_id"        : order_id,
                    "customer_id"     : customer_id,
                    "amount_cents"    : total_cents,
                    "currency"        : "sgd",
                    "idempotency_key" : idempotency_key,
                },
            )

        if payment_resp.status_code != 200:
            try:
                err_body = payment_resp.json()
            except Exception:
                err_body = {"error": f"Payment service returned {payment_resp.status_code}"}
            return {
                "order_id"   : order_id,
                "status"     : "failed",
                "total_cents": total_cents,
                "error"      : err_body.get("error", "Payment service error"),
            }, payment_resp.status_code

        payment_data = payment_resp.json()

        # ── Step 3: Payment failed → stop here ─────────────────────────────────
        if payment_data.get("status") != "succeeded":
            return {
                "order_id"   : order_id,
                "status"     : "failed",
                "total_cents": total_cents,
                "error"      : payment_data.get("error", "Payment was not successful"),
            }, 402

    # ── Step 4: Create order in OutSystems New Orders ──────────────────────────
    async with httpx.AsyncClient(timeout=10.0) as client:
        order_payload = {
            "CustId": customer_id,
            # OutSystems OrderRequest expects Items as a JSON string.
            "Items": json.dumps(items),
            "TotalPrice": total_cents,
            "DeliveryAddress": dropoff_address,
            "PaymentId": payment_data.get("payment_id", ""),
        }
        order_resp = await _request_first_success(
            client,
            "POST",
            [
                f"{SANITIZED_NEW_ORDERS_URL}/CreateOrder",
                SANITIZED_NEW_ORDERS_URL,
                f"{SANITIZED_NEW_ORDERS_URL}/api/v1/orders",
            ],
            json=order_payload,
        )
    outsystems_debug = {
        "status_code": order_resp.status_code,
        "content_type": order_resp.headers.get("content-type"),
    }
    try:
        raw = order_resp.json()
        # Keep payload debug-safe and compact for API clients/logs.
        if isinstance(raw, dict):
            outsystems_debug["response"] = {
                "keys": list(raw.keys())[:12],
                "message": raw.get("Message") or raw.get("message"),
                "errors": raw.get("Errors") or raw.get("errors"),
                "status_code": raw.get("StatusCode") or raw.get("statusCode"),
                "order_id": raw.get("OrderId") or raw.get("orderId"),
            }
        else:
            outsystems_debug["response"] = raw
    except Exception:
        outsystems_debug["response_text"] = (order_resp.text or "")[:500]

    if order_resp.status_code not in (200, 201):
        try:
            order_err = order_resp.json()
            detail = (
                order_err.get("error")
                or order_err.get("message")
                or order_err.get("detail")
                or str(order_err)
            )
        except Exception:
            detail = order_resp.text or "Failed to create order."
        return {
            "order_id"   : order_id,
            "status"     : "failed",
            "total_cents": total_cents,
            "error"      : detail,
            "outsystems_debug": outsystems_debug,
        }, 500

    order_data = order_resp.json()
    if isinstance(order_data, dict):
        final_order_id = (
            order_data.get("order_id")
            or order_data.get("id")
            or order_data.get("OrderId")
            or order_data.get("orderId")
            or order_id
        )
    elif isinstance(order_data, int):
        final_order_id = str(order_data)
    else:
        final_order_id = order_id

    # Hard guard: OutSystems returns int64 order id; reject 0/invalid IDs.
    try:
        created_order_id = int(final_order_id)
    except (TypeError, ValueError):
        return {
            "order_id": order_id,
            "status": "failed",
            "total_cents": total_cents,
            "error": f"Invalid created order id '{final_order_id}' from OutSystems.",
            "outsystems_debug": outsystems_debug,
        }, 502

    if created_order_id <= 0:
        recovered = await _reconcile_created_order_id(
            customer_id=customer_id,
            delivery_address=dropoff_address,
            total_cents=total_cents,
            payment_id=str(payment_data.get("payment_id", "")),
        )
        if recovered:
            created_order_id = recovered
        else:
            return {
                "order_id": order_id,
                "status": "failed",
                "total_cents": total_cents,
                "error": f"OutSystems returned non-usable order id '{created_order_id}'.",
                "outsystems_debug": outsystems_debug,
            }, 502

    # Verify order is immediately retrievable so OrderUI tracking won't break.
    created_order, verify_code = await _fetch_order_by_id(created_order_id)
    if verify_code != 200 or not created_order:
        return {
            "order_id": str(created_order_id),
            "status": "failed",
            "total_cents": total_cents,
            "error": "Order created but could not be verified for tracking.",
            "outsystems_debug": outsystems_debug,
        }, 502

    # ── Step 5: Publish notification (step 9 in diagram) ───────────────────────
    await publish_notification(
        user_id=customer_id,
        order_id=str(created_order_id),
        status="confirmed",
        message="Your order has been confirmed and is being prepared!",
    )

    # ── Step 6: Return confirmation ────────────────────────────────────────────
    return {
        "order_id"   : str(created_order_id),
        "payment_id" : payment_data.get("payment_id"),
        "status"     : "confirmed",
        "total_cents": total_cents,
    }, 200


async def get_order_status(order_id: str) -> tuple[dict, int]:
    async with httpx.AsyncClient(timeout=10.0) as client:
        order_id_query = int(order_id)
        resp = await _request_first_success(
            client,
            "GET",
            [
                f"{SANITIZED_NEW_ORDERS_URL}/GetOrder",
                f"{SANITIZED_NEW_ORDERS_URL}/api/v1/order",
            ],
            params={"OrderId": str(order_id_query)},
        )

    if resp.status_code != 200:
        return {"error": "Order not found.", "status": "not_found"}, 404

    body = resp.json()
    if isinstance(body, list):
        order = body[0] if body else {}
    else:
        order = body

    return _normalize_order_for_ui(order), 200
