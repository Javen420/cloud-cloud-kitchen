## Cloud Cloud Kitchen — Notes before testing

This README is a quick checklist for **running the frontend** and **building/running the Docker stack** locally.

---

## Frontend (Vite)

### Run

```bash
cd OrderUI
npm install
npm run dev
```

Open: `http://localhost:5173`


### Common frontend gotchas

- **Blank page**: check DevTools Console for a React runtime error.
- **Menu not loading**: Kong must be up on `http://localhost:8000` and route `GET /api/v1/menu` to OutSystems.
- **CORS**: UI calls Kong, and Kong must allow `OPTIONS` for `POST` routes.

---

## Docker stack (Infrastructure)

### Run

```bash
cd Infrastructure
docker compose up -d --build
```

Kong proxy: `http://localhost:8000`
RabbitMQ UI: `http://localhost:15672` (default `guest/guest`)

### Required env vars (root `.env`)

Your containers use the repo root `.env` (referenced by `Infrastructure/docker-compose.yml` via `env_file: ../.env`).

Important keys:

- **Supabase**
  - `SUPABASE_URL`
  - `SUPABASE_KEY`
- **Stripe**
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
- **OutSystems**
  - `OUTSYSTEMS_MENU_URL`
- **RabbitMQ**
  - `RABBITMQ_URL` should be `amqp://guest:guest@rabbitmq:5672/` (or match your configured user/pass)
- **Service-to-service URLs (inside Docker)**
  - `PENDING_ORDERS_URL=http://pending-orders:8085`
  - `NEW_ORDERS_URL=http://new-orders:8082`
  - `PAYMENT_URL=http://payment:8089`

### Docker gotchas (very important)

- **Never use `localhost` for service-to-service URLs inside Docker**.
  - Inside containers, `localhost` means the container itself.
  - Use compose DNS names like `pending-orders`, `new-orders`, `payment`, `redis`, `rabbitmq`.
- **Restart vs recreate**
  - `docker compose restart` does **not** reload env vars.
  - If you change `.env` or `docker-compose.yml`, use:

```bash
docker compose down
docker compose up -d --build
```

- **Port mismatches**
  - Ensure each Dockerfile runs the port that compose maps (e.g. payment should listen on `8089`).
- **Kong config**
  - Kong loads `Infrastructure/kong.yml` on startup; restart Kong after changes.
  - If routes are reaching the upstream as `POST /` unexpectedly, check `strip_path` settings in `kong.yml`.

---

## Stripe Checkout redirect flow (current)

- Frontend calls `POST /api/v1/order/checkout` (via Kong).
- Order-fulfilment creates a pending order then requests a Stripe Checkout Session from payment.
- Frontend redirects to Stripe Checkout URL.
- Stripe webhook calls payment service; payment marks paid, confirms order, and publishes notification events.

### Webhook (local dev)

Use Stripe CLI to forward events to your payment service webhook endpoint.
(Exact command depends on whether you expose the container port directly or via Kong.)

---

## Notifications (RabbitMQ → FCM)

- Producer publishes to RabbitMQ queue `notifications`.
- `notifications` service consumes and forwards to FCM topics `order_<order_id>`.
- Retry + DLQ queues:
  - `notifications.retry`
  - `notifications.dlq`

### Firebase Admin credentials (required for notifications service)

Set one of:
- `FIREBASE_SERVICE_ACCOUNT_JSON` (full JSON string)
- `FIREBASE_SERVICE_ACCOUNT_PATH` (path inside container)

If Firebase creds are missing, the consumer won’t start and RabbitMQ queues may not be created.
