## FCM Topics Setup (Web + Mobile)

This project uses **Firebase Cloud Messaging (FCM)** to push order status updates in real time.

### 1) Backend: Notification service

Service: `atomic-services/notifications`

- Consumes RabbitMQ queue `notifications`
- Publishes each message to FCM topic: `order_<order_id>`
- Provides topic subscription endpoints:
  - `POST /api/notifications/subscribe` body: `{ "token": "...", "order_id": "..." }`
  - `POST /api/notifications/unsubscribe` body: `{ "token": "...", "order_id": "..." }`

Required env vars:

- `RABBITMQ_URL`
- One of:
  - `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON string)
  - `FIREBASE_SERVICE_ACCOUNT_PATH` (file path inside container)

Optional env vars:
- `NOTIFICATION_QUEUE` (default `notifications`)
- `FCM_TOPIC_PREFIX` (default `order_`)

### 2) Web frontend setup (Vite + React)

Install:

```bash
cd OrderUI/src
npm install
```

Required Vite env vars (for web push):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_VAPID_KEY`

Runtime behavior:
- The customer tracking page requests notification permission.
- It retrieves an FCM token and calls `/api/notifications/subscribe` for `order_<order_id>`.
- Foreground messages update the UI immediately; polling remains as fallback.

Background notifications:
- Provided via `frontend/public/firebase-messaging-sw.js`.

### 3) Mobile setup (Android/iOS)

Mobile apps can subscribe to topics **directly** using the FCM SDK (no backend call required):

- Subscribe to: `order_<orderId>` when the user opens the tracking screen
- Unsubscribe on logout / when tracking is no longer needed

### 4) End-to-end test

1. Start infrastructure (`redis`, `rabbitmq`, `kong`) and services (`order-fulfilment`, `pending-orders`, `new-orders`, `payment`, `notifications`).\n+2. Open the customer UI and place an order.\n+3. In browser devtools, confirm the frontend calls:\n+   - `POST /api/notifications/subscribe`\n+4. Trigger a message by placing an order (composite publishes to RabbitMQ `notifications`).\n+5. Confirm the browser receives an FCM message and the tracking UI updates.\n+
