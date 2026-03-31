## Cloud Cloud Kitchen — Notes before testing

This README is a quick checklist for **running the frontend** and **building/running the Docker stack** locally.

---

## Frontend (Vite apps)

### Run each UI locally

```bash
cd UI/OrderUI
npm install
npm run dev
```

```bash
cd UI/KitchenUI
npm install
npm run dev
```

```bash
cd UI/RiderUI
npm install
npm run dev
```

Open:
- Order UI: `http://localhost:5173`
- Kitchen UI: `http://localhost:5174`
- Rider UI: `http://localhost:5175`

### Gateway pattern (all UIs)

- UI API clients use `BASE_URL = import.meta.env.VITE_API_BASE_URL || ""`.
- Calls are made to `/api/v1/...`.
- In local dev, Vite proxies `/api` to Kong.
- In browser/container context, `VITE_API_BASE_URL` can be `http://localhost:8000`.

---

## Docker stack (Infrastructure)

### Run

```bash
cd Infrastructure
docker compose up -d --build
```

Kong proxy: `http://localhost:8000`
RabbitMQ UI: `http://localhost:15672` (default `guest/guest`)

### Active UI services in compose

- `order` on `5173`
- `kitchen` on `5174`
- `rider` on `5175`

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
  - `NEW_ORDERS_URL=http://new-orders:8082`
  - `PAYMENT_URL=http://payment:8089`

### Docker gotchas (very important)

- **Never use `localhost` for service-to-service URLs inside Docker**.
  - Inside containers, `localhost` means the container itself.
  - Use compose DNS names like `new-orders`, `payment`, `redis`, `rabbitmq`, `kong`.
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

Order flow is synchronous with Payment Intents:

- Frontend creates/uses a payment intent via `payment` endpoints (`/api/v1/payment/*`).
- Frontend then calls `POST /api/v1/order/submit` via Kong.
- `order-fulfilment` verifies payment status/amount and creates the order in `new-orders`.
- Order confirmation is returned directly to UI.

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

---

## Route map (Kong)

Scenario 1 (Order):
- `POST /api/v1/order/submit` -> `order-fulfilment:8081`
- `GET /api/v1/order/{order_id}` -> `order-fulfilment:8081`
- `POST|GET /api/v1/payment/*` -> `payment:8089`
- `GET /api/v1/menu` -> OutSystems Menu API

Scenario 2 (Kitchen):
- `GET|PUT /api/v1/kitchen/*` -> `coordinate-fulfilment:8094`
- `GET /api/v1/kitchen-assign/health` -> `assign-kitchen:8093`

Scenario 3 (Rider):
- `GET|PUT /api/v1/driver/assign` -> `assign-driver:8086`
- `GET /api/v1/driver/orders` -> `assign-driver:8086`
- `GET|POST /api/v1/eta/*` -> `eta-tracking:8087`
