# FairChat — Development guide

pnpm workspace monorepo (TypeScript). Production deploy: see [DEPLOY.md](./DEPLOY.md) (Vercel + Railway + Neon).

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **API**: Express 5 + WebSocket (`ws`), esbuild bundle
- **Database**: PostgreSQL + Drizzle (`artifacts/api-server/src/schema.ts` is the source of truth)
- **Frontend**: React 19 + Vite 7 + Tailwind 4 + shadcn/ui
- **API client**: Orval → `@workspace/api-client-react` (`setBaseUrl`, `apiUrl()` in `@/lib/apiConfig`)
- **Auth**: httpOnly cookie `fairchat_auth` (Secure, SameSite=Lax, Path=/api)
- **CORS / CSRF**: `FRONTEND_URL`, `ALLOWED_ORIGINS` (+ localhost ports in dev)
- **Payments**: Wagmi v2 + RainbowKit; Arc standard `5042002`, Arc confidential StableTrust `1244`

## Structure

```text
fairchat-monorepo/
├── artifacts/
│   ├── api-server/     # Express API + WebSocket
│   ├── fairchat/       # React SPA
│   └── mockup-sandbox/ # UI mockup preview (optional)
├── lib/
│   ├── api-spec/       # OpenAPI + Orval config
│   ├── api-client-react/
│   ├── api-zod/
│   └── db/             # legacy prototype schema (not used by api-server)
├── scripts/
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Prerequisites

- Node 24, pnpm
- PostgreSQL (local or Neon) for API
- `VITE_WALLETCONNECT_PROJECT_ID` for frontend (WalletConnect Cloud)

Copy [.env.example](./.env.example) and set variables per service.

## Commands

From repo root:

```bash
pnpm install
pnpm run typecheck
pnpm run build
```

### API server

```bash
# Schema push (requires DATABASE_URL)
pnpm --filter @workspace/api-server run db:push

# Dev: build + start (needs PORT, DATABASE_URL, JWT_SECRET)
PORT=5000 DATABASE_URL=... JWT_SECRET=dev-secret \
  pnpm --filter @workspace/api-server run dev

# Production build
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

Health: `GET /api/health` (alias: `/api/healthz`)

### Frontend (fairchat)

```bash
PORT=5173 VITE_WALLETCONNECT_PROJECT_ID=... \
  pnpm --filter @workspace/fairchat run dev

pnpm --filter @workspace/fairchat run build
pnpm --filter @workspace/fairchat run typecheck
```

Routes: `/` (login), `/register`, `/chat`.

Optional env: `VITE_API_URL`, `VITE_WS_URL` (see DEPLOY.md for split hosting).

### Regenerate API client

```bash
pnpm --filter @workspace/api-spec run codegen
```

## Registration

Registration is **open** — no invite code is required.

1. Open `/register`, choose display name, username, and password.
2. Save the 12-word recovery phrase (used for account recovery and E2E key derivation).
3. `POST /api/auth/register` creates the account; the session cookie is set automatically.

`POST /api/auth/check-username` reports username availability during sign-up. Legacy invite-code flows (`FC-DEMO`, `/api/auth/validate-invite`) are **not** part of the current product and are not required for new accounts.

## FairChat features (summary)

- Open registration (public sign-up, no invite gate)
- E2E messaging (libsodium); real-time via `WS /api/ws`
- Crypto payments: standard ERC-20, Arc Circle x402, confidential StableTrust
- RPC proxy: `POST /api/rpc-proxy` for wallet balance reads from the browser

## TypeScript

Packages extend `tsconfig.base.json` with `composite: true`. Prefer typecheck from root:

```bash
pnpm run typecheck
```

## Security notes

- Set `JWT_SECRET` in production (ephemeral random if unset — sessions lost on restart)
- Rate limits on auth, messages, uploads, reactions
- WebSocket: cookie on same origin, or `GET /api/auth/ws-token` + `{ type: "auth", token }` cross-host
- **E2E private keys**: stored in IndexedDB (`fairchat_sk`, per-user `fairchat_sk_<userId>`). On logout, `useAuth` calls `clearPrivateKey()` to wipe IndexedDB entries, any legacy `localStorage` copies, and the in-memory key cache before redirecting to `/`.
- **DM policy**: outbound messages require the recipient to be in the sender’s `user_contacts` list (see `POST /api/messages/:recipientId`).

## Demo credentials (seeded DB)

- User: `admin` / `password` (when `SEED_ADMIN_PASSWORD` is set)
