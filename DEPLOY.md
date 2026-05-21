# FairChat — Production deploy (Vercel + Railway + Neon)

## Architecture

| Service | Hosts | Notes |
|---------|--------|--------|
| **SPA** | Vercel (`artifacts/fairchat`) | Static React build |
| **API + WebSocket** | Railway (`artifacts/api-server`) | Express 5 + `ws` on `/api/ws` |
| **PostgreSQL** | Neon | `DATABASE_URL` on Railway only |

HTTP from the browser can stay **same-origin** via Vercel rewrites (`/api/*` → Railway).  
**WebSocket** must connect **directly** to Railway (`VITE_WS_URL`) with a short-lived token from `GET /api/auth/ws-token`.

## 1. Neon

1. Create a project and database.
2. Copy the connection string → Railway `DATABASE_URL`.
3. From your machine (with env set):

```bash
cd path/to/Fairchat
DATABASE_URL="postgresql://..." pnpm --filter @workspace/api-server run db:push
```

Schema source of truth: `artifacts/api-server/src/schema.ts`.

## 2. Railway (API)

1. New project → deploy from GitHub, **root directory** = monorepo root.
2. Railway reads `railway.toml` (build + start + healthcheck `/api/health`) and `nixpacks.toml` (Node 22, pnpm 11.1.3 via Corepack, `pnpm install --no-frozen-lockfile`).
3. Root `package.json` must include `"packageManager": "pnpm@11.1.3"` (Corepack fallback).
4. Variables (required):

| Variable | Example |
|----------|---------|
| `PORT` | `5000` (Railway often injects this) |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon connection string |
| `JWT_SECRET` | Long random string (≥32 chars) |
| `FRONTEND_URL` | `https://your-app.vercel.app` |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app,https://*.vercel.app` |

Optional: `DATA_DIR` (uploads; use a volume for persistence), `LOG_LEVEL`, `SEED_ADMIN_PASSWORD`.

5. Deploy and note the public URL, e.g. `https://fairchat-api.up.railway.app`.
6. Verify: `curl https://<railway-host>/api/health`

## 3. Vercel (frontend)

1. Import repo, set **Root Directory** to `artifacts/fairchat` (required — `vercel.ts` lives here).
2. Framework: Other (`artifacts/fairchat/vercel.ts` exports `config` with SPA fallback + optional `/api` proxy).
3. Build env:

| Variable | Purpose |
|----------|---------|
| `API_SERVER_URL` | Railway URL **without** trailing slash — **required**; baked into the SPA as `VITE_API_URL` at build time (see `vite.config.ts`) so `fetch` hits Railway instead of Vercel `404` |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud project id |
| `VITE_WS_URL` | `wss://<railway-host>` (no path; `/api/ws` is appended in code) |

Optional: set `VITE_API_URL` explicitly to the same Railway URL (overrides `API_SERVER_URL` for the client bundle).

4. After first Railway deploy, set `API_SERVER_URL` on Vercel (Production + Preview) and **redeploy** so the new bundle includes the API host.

5. On Railway, set `FRONTEND_URL` / `ALLOWED_ORIGINS` to your Vercel URL(s) (CORS for cross-origin `fetch` + cookies).

**Vercel `404 NOT_FOUND` (fra1:…):** usually missing SPA rewrite (`/register` → `index.html`) or wrong project Root Directory. Ensure latest `vercel.ts` uses `export const config` (not `export default`).


## 4. Local production smoke test

```bash
# Terminal A — API
cd artifacts/api-server
DATABASE_URL=... JWT_SECRET=dev-secret PORT=5000 NODE_ENV=production pnpm run build && pnpm run start

# Terminal B — SPA
cd artifacts/fairchat
VITE_WALLETCONNECT_PROJECT_ID=... pnpm run build && pnpm run serve
```

## 5. Checklist

- [ ] `JWT_SECRET` set on Railway (not ephemeral)
- [ ] `GET /api/health` returns `"status":"ok"`
- [ ] Login works on Vercel URL
- [ ] Chat connects (WS status connected) — requires `VITE_WS_URL` on Vercel
- [ ] CORS: mutating requests from Vercel origin succeed (check `ALLOWED_ORIGINS`)

## Arc payments (do not mix chain IDs)

| Mode | chainId | RPC |
|------|---------|-----|
| Standard (Circle x402) | `5042002` | `https://rpc.testnet.arc.network` |
| Confidential (StableTrust) | `1244` | `https://rpc.arc.xyz` |

## Files added for deploy

- `railway.toml` — API build/start/health
- `artifacts/fairchat/vercel.ts` — Vercel `/api` and `/uploads` → Railway (`/api/uploads/` on API) rewrites from `API_SERVER_URL`
- `artifacts/fairchat/src/lib/apiConfig.ts` — `VITE_API_URL`, `VITE_WS_URL`, Orval `setBaseUrl`
- `artifacts/api-server/src/lib/allowedOrigins.ts` — `FRONTEND_URL` / `ALLOWED_ORIGINS`
- `GET /api/auth/ws-token` — 5-minute JWT for cross-host WebSocket
