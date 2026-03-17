## Payment service testing (Stripe + Supabase)

### Prereqs

- Python 3.12 (or similar)
- A Supabase project with these tables:
  - `idempotency_keys`
  - `payment_records`
- Stripe test mode secret key
- (Optional) Stripe CLI for webhook testing

### Environment variables

Set these (via `.env` or `export ...`):

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET` (only required for `/webhook` tests)
- (Optional) `PAYMENT_LOCK_TIMEOUT_SECONDS` (default: 120)

### Install dependencies

```bash
cd "/Applications/MAMP/htdocs/esd/Cloud-Cloud-Kitchen/Atomic Services/payment-service"
python3 -m pip install -r requirements.txt
```

### Start the server

```bash
cd "/Applications/MAMP/htdocs/esd/Cloud-Cloud-Kitchen/Atomic Services/payment-service"
python3 -m uvicorn main:app --host 0.0.0.0 --port 8088 --reload
```

### 1) Health check

```bash
curl http://localhost:8088/health
```

Expected:

```json
{"status":"healthy"}
```

### 2) Create a Stripe test customer with a card

This service charges a **customer** and immediately **confirms** the payment, so the customer must have a default payment method.

Using Stripe CLI:

```bash
stripe customers create
stripe payment_methods create --type card --card[number]=4242424242424242 --card[exp_month]=12 --card[exp_year]=2030 --card[cvc]=123
stripe payment_methods attach pm_xxx --customer cus_xxx
stripe customers update cus_xxx --invoice_settings[default_payment_method]=pm_xxx
```

### 3) Call the pay endpoint

```bash
curl -X POST http://localhost:8088/api/v1/payment/pay \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "amount": 2000,
    "currency": "usd",
    "stripe_customer_id": "cus_xxx",
    "idempotency_key": "test-key-001"
  }'
```

Expected success shape:

```json
{"order_id":"...","charge_id":"pi_...","status":"success"}
```

### 4) Idempotency check

Re-run the same request with the same `idempotency_key`. You should get the same response, and no duplicate PaymentIntent should be created.

### 5) Webhook test (optional)

Forward Stripe events to your local server:

```bash
stripe listen --forward-to localhost:8088/api/v1/payment/webhook
```

Then trigger a test event:

```bash
stripe trigger payment_intent.succeeded
```

