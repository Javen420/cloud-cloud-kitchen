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
  - `STRIPE_WEBHOOK_SECRET` (for Stripe webhooks)
  - `REDIS_ADDR=localhost:6379` (or your Redis host:port)
  - `REDIS_PASSWORD` (if required, else empty)
- Supabase tables:
  - `orders`
  - `idempotency_keys`
  - `payment_records`

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

### 5. new-orders: confirm order

Use the `order_id` from pending-orders:

```bash
curl -X POST http://localhost:8082/orders \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "<order_id>",
    "kitchen_id": "kitchen_1"
  }'
```

Expected: JSON with `status: "confirmed"`.

Fetch confirmed order:

```bash
curl http://localhost:8082/orders/<order_id>
```

---

### 6. payment: authorize / capture / refund

Create a Stripe test customer with a default card (using Stripe CLI):

```bash
stripe customers create
stripe payment_methods create --type card --card[number]=4242424242424242 --card[exp_month]=12 --card[exp_year]=2030 --card[cvc]=123
stripe payment_methods attach pm_xxx --customer cus_xxx
stripe customers update cus_xxx --invoice_settings[default_payment_method]=pm_xxx
```

Authorize payment:

```bash
curl -X POST http://localhost:8089/payments/authorize \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "order_id": "<order_id>",
    "amount": 1200,
    "stripe_customer_id": "cus_xxx",
    "idempotency_key": "pay-test-001"
  }'
```

Capture:

```bash
curl -X POST http://localhost:8089/payments/capture \
  -H "Content-Type: application/json" \
  -d '{
    "payment_intent_id": "<payment_intent_id-from-authorize>"
  }'
```

Refund (optional):

```bash
curl -X POST http://localhost:8089/payments/refund \
  -H "Content-Type: application/json" \
  -d '{
    "payment_intent_id": "<payment_intent_id-from-authorize>",
    "reason": "requested_by_customer"
  }'
```

---

### 7. Troubleshooting

- Check the terminal running each service for stack traces.
- Most errors will come from:
  - Missing or incorrect env vars
  - Supabase table/column mismatches
  - Redis not reachable (`REDIS_ADDR` / `REDIS_PASSWORD`)
  - Stripe test customer without a default payment method

