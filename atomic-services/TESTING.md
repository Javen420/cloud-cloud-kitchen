## Atomic Services Testing Guide

This file summarizes how to start and smoke-test the three atomic services:

- `pending-orders` (port 8085)
- `new-orders` (port 8082)
- `payment` (port 8089)

All services load environment variables from the **root** `.env`.

---

### 1. Prerequisites

- Python 3.12 (or similar)
- Root `.env` configured with at least:
  - `SUPABASE_URL`
  - `SUPABASE_KEY`
  - `STRIPE_SECRET_KEY`
  - `REDIS_ADDR=localhost:6379` (or your Redis host:port)
  - `REDIS_PASSWORD` (if required, else empty)
- Supabase tables:
  - `orders` (columns: `id`, `user_id`, `items`, `total_amount`, `delivery_address`, `status`, `updated_at`, `kitchen_id`)
  - `payment_records` (columns: `id`, `stripe_charge_id`, `user_id`, `order_id`, `amount`, `currency`, `status`, `idempotency_key_id`)

Install dependencies once:

```bash
cd "/Applications/MAMP/htdocs/esd/Cloud-Cloud-Kitchen"
python3 -m pip install -r "Atomic Services/pending-orders/requirements.txt"
python3 -m pip install -r "Atomic Services/new-orders/requirements.txt"
python3 -m pip install -r "Atomic Services/payment/requirements.txt"
```

---

### 2. Start all services

#### pending-orders (8085)

```bash
cd "/Applications/MAMP/htdocs/esd/Cloud-Cloud-Kitchen/Atomic Services/pending-orders"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8085 --reload
```

#### new-orders (8082)

```bash
cd "/Applications/MAMP/htdocs/esd/Cloud-Cloud-Kitchen/Atomic Services/new-orders"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8082 --reload
```

#### payment (8089)

```bash
cd "/Applications/MAMP/htdocs/esd/Cloud-Cloud-Kitchen/Atomic Services/payment"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8089 --reload
```

---

### 3. Health checks

Run from a separate terminal:

```bash
curl http://localhost:8085/health    # pending-orders
curl http://localhost:8082/health    # new-orders
curl http://localhost:8089/health    # payment
```

All should return:

```json
{"status":"healthy"}
```

---

### 4. pending-orders: create and fetch pending order

Create a pending order:

```bash
curl -X POST http://localhost:8085/orders \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "items": [
      { "item_id": "burger_1", "name": "Burger", "quantity": 1, "price": 1200 }
    ],
    "total_amount": 1200,
    "delivery_address": "123 Test Street"
  }'
```

Expected: HTTP 201 with JSON containing an `order_id`.

Fetch that order:

```bash
curl http://localhost:8085/orders/<order_id>
```

---

### 5. new-orders: create and fetch order

Create an order (called by order-fulfilment after payment succeeds):

```bash
curl -X POST http://localhost:8082/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "user_123",
    "items": [{"Id": "burger_1", "Name": "Burger", "quantity": 1, "price": 12.00}],
    "total_cents": 1200,
    "dropoff_address": "123 Test Street",
    "payment_id": "pi_test_123"
  }'
```

Expected: HTTP 201 with JSON containing `order_id` and `status: "pending"`.

Fetch that order:

```bash
curl http://localhost:8082/api/v1/orders/<order_id>
```

List unassigned orders:

```bash
curl http://localhost:8082/api/v1/orders/unassigned
```

Update order status:

```bash
curl -X PUT http://localhost:8082/api/v1/orders/<order_id>/status \
  -H "Content-Type: application/json" \
  -d '{"status": "confirmed"}'
```

**Note:** new-orders writes to the `orders` table in Supabase (columns: `id`, `user_id`, `items`, `total_amount`, `delivery_address`, `status`).

---

### 6. payment: process payment (synchronous)

No Stripe CLI setup needed — the service uses a hardcoded test card (`pm_card_visa`) with `confirm=True`.

Process a payment:

```bash
curl -X POST http://localhost:8089/api/v1/payment \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "test-123",
    "customer_id": "user_123",
    "amount_cents": 1200,
    "currency": "sgd",
    "idempotency_key": "pay-test-001"
  }'
```

Expected: `"status": "succeeded"` with a `payment_id` starting with `pi_`.
Verify in [Stripe test dashboard](https://dashboard.stripe.com/test/payments).

Capture (after authorization):

```bash
curl -X POST http://localhost:8089/payments/capture \
  -H "Content-Type: application/json" \
  -d '{
    "payment_intent_id": "<pi_xxx from above>"
  }'
```

Refund (optional):

```bash
curl -X POST http://localhost:8089/payments/refund \
  -H "Content-Type: application/json" \
  -d '{
    "payment_intent_id": "<pi_xxx>",
    "reason": "requested_by_customer"
  }'
```

**Note:** Payment records are stored in the `payment_records` table (columns: `stripe_charge_id`, `user_id`, `amount`, `currency`, `status`). The `order_id` column is omitted on insert due to a FK constraint — the order doesn't exist yet at payment time.

---

### 7. Troubleshooting

- Check the terminal running each service for stack traces.
- Most errors will come from:
  - Missing or incorrect env vars
  - Supabase table/column mismatches
  - Redis not reachable (`REDIS_ADDR` / `REDIS_PASSWORD`)
  - Stripe test customer without a default payment method

