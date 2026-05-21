# FairChat

**End-to-end encrypted messenger with private crypto payments.**

FairChat is an invite-only messaging app where your conversations and payments are private by design - not as an afterthought. Messages are encrypted on your device before they leave it. Payments can be sent confidentially, with no public trace on-chain.

---

## How it works

### Messaging

Every message - text, image, file, or voice — is encrypted on your device using **X25519 key exchange** (libsodium) before it's sent to the server. The server stores only ciphertext. Even if the database were compromised, messages would be unreadable without the recipient's private key.

Your encryption keys are generated from a **12-word seed phrase** at registration and stored in your browser's IndexedDB - never sent to the server. The seed phrase is your backup: lose it, and no one (including us) can recover your messages.

**Attachments are E2E encrypted too.** When you send a photo, file, or voice message, the attachment metadata (URL, filename, type, size) is encrypted into the message payload with the same X25519 key. The server never sees which file belongs to which conversation.

### Payments

FairChat supports two payment modes:

**Standard payments** - direct ERC-20 transfers on Base, Arbitrum, Ethereum Sepolia, and Arc (chainId 5042002). Fast, simple, on-chain.

**Confidential payments** - powered by [FairBlock's StableTrust](https://fairblock.network) on Arc (chainId 1244). Transfers are encrypted using Fully Homomorphic Encryption (FHE) - the amount and parties are hidden from public view on-chain. For when financial privacy matters.

Both modes are accessible directly from a conversation - no switching between apps.

Arc network also supports **Circle x402** batch payments via the Circle Gateway for standard mode.

Wallet connection via RainbowKit + wagmi v2.

---

## Security

FairChat is built with multiple layers of protection:

| Layer | What it does |
|---|---|
| **E2E encryption** | Messages encrypted client-side with libsodium X25519 before upload |
| **Invite-only registration** | No open signups - access requires an FC-XXXX invite code |
| **httpOnly cookie sessions** | Auth tokens are never accessible to JavaScript |
| **Token revocation** | Logout instantly invalidates the session server-side |
| **Key rotation protection** | Changing your encryption key requires a fresh login (within 2h) |
| **Password change invalidation** | All existing sessions are revoked on password change |
| **Timing attack mitigation** | Account recovery endpoints use fixed-delay responses to prevent user enumeration |
| **Rate limiting** | Per-route limits on login (with progressive slowdown), registration, uploads, messages, and reactions |
| **CSRF protection** | Origin + custom header validation on all mutating requests |
| **File validation** | Magic bytes checked on upload - declared MIME type alone is not trusted |
| **WS rate limiting** | 60 WebSocket events per 10s per user to prevent flooding |
| **Self-destructing messages** | Messages with a timer are deleted from the server after expiry, both parties notified |

---

## Stack

**Frontend** - React 19, Vite 7, Tailwind 4, shadcn/ui, TanStack Query, Framer Motion, libsodium-wrappers, wagmi v2, RainbowKit

**Backend** - Node.js 22, Express 5, WebSocket (ws), Drizzle ORM, PostgreSQL

**Infrastructure** - Vercel (frontend), Railway (backend), Neon (database)

---

## Getting started

See [DEPLOY.md](./DEPLOY.md) for full deployment instructions (Neon → Railway → Vercel).

For local development see [DEVELOPMENT.md](./DEVELOPMENT.md).

### Environment variables

Copy `.env.example` in each package and fill in the values:

```
artifacts/api-server/.env.example  →  DATABASE_URL, JWT_SECRET, ALLOWED_ORIGINS
artifacts/fairchat/.env.example    →  VITE_API_URL, VITE_WS_URL, VITE_WALLETCONNECT_PROJECT_ID
```

---

## Networks

| Network | Mode | Chain ID |
|---|---|---|
| Base Sepolia | Standard | 84532 |
| Arbitrum Sepolia | Standard | 421614 |
| Ethereum Sepolia | Standard | 11155111 |
| Arc | Standard (Circle x402) | 5042002 |
| Arc | Confidential (StableTrust/FHE) | 1244 |

---

## License

MIT
