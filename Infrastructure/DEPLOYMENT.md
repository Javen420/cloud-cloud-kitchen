# Deployment

Use the production compose file from the `Infrastructure` directory.

## 1. Prepare environment

Create a production env file from the example:

```powershell
Copy-Item ..\.env.production.example ..\.env.production
```

Fill in the required secrets and public URLs in [`.env.production`](/c:/Users/ryanl/OneDrive/Documents/GitHub/Cloud-Cloud-Kitchen/.env.production):

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `STRIPE_SECRET_KEY`
- `VITE_STRIPE_PUBLISHABLE_KEY`
- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_ROUTES_API_KEY`
- `OUTSYSTEMS_NEWORDERS_URL`
- `VITE_FIREBASE_*`
- `PUBLIC_API_BASE_URL`
- `FIREBASE_SERVICE_ACCOUNT_FILE`

`PUBLIC_API_BASE_URL` must be the URL your browsers will use for Kong, for example:

```env
PUBLIC_API_BASE_URL=https://api.example.com
```

## 2. Start the stack

```powershell
cd Infrastructure
docker compose -f docker-compose.prod.yml --env-file ..\.env.production up -d --build
```

## 3. Published ports

- Order UI: `PUBLIC_ORDER_UI_PORT` default `8080`
- Kitchen UI: `PUBLIC_KITCHEN_UI_PORT` default `8083`
- Rider UI: `PUBLIC_RIDER_UI_PORT` default `8085`
- Kong API: `PUBLIC_API_PORT` default `8000`

## 4. Smoke checks

```powershell
curl.exe -i http://localhost:8000/api/v1/kitchen/health
curl.exe -i http://localhost:8000/api/v1/verify?address=313%20Orchard%20Road
curl.exe -i http://localhost:8000/api/v1/menu
```

## 5. Notes

- The production compose file builds static frontend images for all three UIs.
- Frontends no longer need Vite dev proxying in production.
- Order UI menu requests now go through Kong at `/api/v1/menu` instead of calling OutSystems directly from the browser.
- Internal services stay on the Docker network; only Kong and the three UIs are published by default.
