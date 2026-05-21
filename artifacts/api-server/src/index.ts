import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import app, { isOriginAllowed } from "./app.js";
import { logger } from "./lib/logger.js";
import { db, sql, getUserByToken, initDb } from "./db.js";
import { inArray } from "drizzle-orm";
import { messages as messagesTable } from "./schema.js";
import { addUserSocket, removeUserSocket, sendToUser } from "./routes/ws-state.js";
import { parseCookieHeader, COOKIE_NAME } from "./lib/authCookie.js";
import type { Message } from "./db.js";

// ── Per-user WS message rate limiter ─────────────────────────────────────────
// Prevents a single client from flooding the server with events (e.g. typing)
const WS_LIMIT = 60;             // max messages per window
const WS_WINDOW_MS = 10_000;     // 10-second rolling window
const wsMessageCounts = new Map<string, { count: number; resetAt: number }>();

function wsAllowed(userId: string): boolean {
  const now = Date.now();
  const entry = wsMessageCounts.get(userId);
  if (!entry || now > entry.resetAt) {
    wsMessageCounts.set(userId, { count: 1, resetAt: now + WS_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= WS_LIMIT;
}

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT обязателен");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Неверный PORT: "${rawPort}"`);

const server = http.createServer(app);
// Same HTTP server as Express — required for Railway (single PORT, no separate WS port).
const wss = new WebSocketServer({ server, path: "/api/ws" });

const AUTH_TIMEOUT_MS = 10_000;
/** Railway closes idle connections after ~60s; native WS ping keeps them alive. */
const HEARTBEAT_INTERVAL_MS = 30_000;

type TrackedSocket = WebSocket & { isAlive: boolean };

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function startHeartbeat(): void {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    wss.clients.forEach((client) => {
      const ws = client as TrackedSocket;
      if (!ws.isAlive) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

async function markPendingAsDelivered(recipientId: string) {
  const rows = await db.execute(sql`
    UPDATE messages SET delivery_status = 'delivered'
    WHERE recipient_id = ${recipientId} AND delivery_status = 'sent'
    RETURNING sender_id, id
  `) as { sender_id: string; id: string }[];
  if (rows.length === 0) return;
  const bySender = new Map<string, string[]>();
  for (const r of rows) {
    const arr = bySender.get(r.sender_id) ?? [];
    arr.push(r.id);
    bySender.set(r.sender_id, arr);
  }
  for (const [senderId, ids] of bySender) {
    sendToUser(senderId, { type: "messages_delivered", messageIds: ids, deliveredTo: recipientId });
  }
}

wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
  const tracked = ws as TrackedSocket;
  tracked.isAlive = true;
  ws.on("pong", () => {
    tracked.isAlive = true;
  });

  const wsOrigin = req.headers.origin;
  if (wsOrigin && !isOriginAllowed(wsOrigin)) {
    ws.close(4003, "Origin not allowed");
    return;
  }

  let authenticated = false;
  let userId: string | null = null;

  const cookies = parseCookieHeader(req.headers.cookie);
  const cookieToken = cookies[COOKIE_NAME];
  if (cookieToken) {
    const user = await getUserByToken(cookieToken);
    if (user) {
      authenticated = true;
      userId = user.id;
      addUserSocket(userId, ws);
      ws.send(JSON.stringify({ type: "connected", userId }));
      markPendingAsDelivered(user.id).catch(() => {});
    }
  }

  const authTimer = !authenticated ? setTimeout(() => {
    if (!authenticated) { ws.close(4001, "Auth timeout"); }
  }, AUTH_TIMEOUT_MS) : null;

  ws.on("message", (raw) => {
    (async () => {
      try {
        const data = JSON.parse(raw.toString()) as { type: string; token?: string; recipientId?: string };

        if (!authenticated) {
          if (data.type !== "auth" || !data.token) {
            ws.send(JSON.stringify({ type: "error", message: "Send auth message first" }));
            ws.close(4001, "Unauthorized");
            return;
          }
          const user = await getUserByToken(data.token);
          if (!user) {
            ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
            ws.close(4001, "Unauthorized");
            return;
          }
          authenticated = true;
          userId = user.id;
          if (authTimer) clearTimeout(authTimer);
          addUserSocket(userId, ws);
          ws.send(JSON.stringify({ type: "connected", userId }));
          return;
        }

        if (!wsAllowed(userId!)) {
          ws.send(JSON.stringify({ type: "error", message: "Rate limit exceeded" }));
          return;
        }

        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }
        if (data.type === "typing" && data.recipientId) {
          const isBlocked = await db.execute(sql`
            SELECT 1 FROM user_blocks WHERE blocker_id = ${data.recipientId} AND blocked_id = ${userId}
          `);
          if (isBlocked.length === 0) sendToUser(data.recipientId, { type: "typing", senderId: userId });
        }
        if (data.type === "stop_typing" && data.recipientId) {
          const isBlocked = await db.execute(sql`
            SELECT 1 FROM user_blocks WHERE blocker_id = ${data.recipientId} AND blocked_id = ${userId}
          `);
          if (isBlocked.length === 0) sendToUser(data.recipientId, { type: "stop_typing", senderId: userId });
        }
      } catch (e) {
        logger.warn({ e }, "Невалидное WS-сообщение от клиента");
      }
    })();
  });

  const markLastSeen = async () => {
    if (!userId) return;
    await db.execute(sql`UPDATE users SET last_seen = ${new Date().toISOString()} WHERE id = ${userId}`);
  };
  ws.on("close", () => { if (authTimer) clearTimeout(authTimer); if (userId) removeUserSocket(userId, ws); markLastSeen().catch(() => {}); });
  ws.on("error", (err) => {
    logger.error({ err, userId }, "Ошибка WebSocket");
    if (authTimer) clearTimeout(authTimer); if (userId) removeUserSocket(userId, ws); markLastSeen().catch(() => {});
  });
});

// ── Database housekeeping ─────────────────────────────────────────────────────
async function runDbHousekeeping() {
  try {
    const now = new Date().toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const sessions = await db.execute(sql`DELETE FROM sessions WHERE expires_at <= ${now}`);
    const tokens = await db.execute(sql`DELETE FROM revoked_tokens WHERE revoked_at <= ${ninetyDaysAgo}`);

    if (Number(sessions.count) || Number(tokens.count))
      logger.info({ expiredSessions: sessions.count, oldTokens: tokens.count }, "DB housekeeping complete");
  } catch (e) {
    logger.warn({ e }, "DB housekeeping error");
  }
}

// ── Self-destruct cleanup ─────────────────────────────────────────────────────
function startSelfDestructInterval() {
  setInterval(async () => {
    try {
      const now = new Date().toISOString();
      const expired = await db.execute(sql`
        SELECT * FROM messages WHERE destroy_at IS NOT NULL AND destroy_at <= ${now}
      `) as Message[];

      if (expired.length === 0) return;

      const ids = expired.map(m => m.id);
      await db.delete(messagesTable).where(inArray(messagesTable.id, ids));

      const notified = new Set<string>();
      for (const m of expired) {
        const key = `${m.sender_id}:${m.recipient_id}`;
        if (!notified.has(key)) {
          notified.add(key);
          const event = {
            type: "messages_deleted",
            ids: expired
              .filter(x => x.sender_id === m.sender_id && x.recipient_id === m.recipient_id)
              .map(x => x.id),
          };
          sendToUser(m.sender_id, event);
          sendToUser(m.recipient_id, event);
        }
      }
    } catch (e) {
      logger.warn({ e }, "Ошибка очистки self-destruct сообщений");
    }
  }, 5000);
}

// ── Startup ───────────────────────────────────────────────────────────────────
async function main() {
  await initDb();

  server.listen(port, () => {
    logger.info({ port }, "Сервер запущен");
  });

  startHeartbeat();

  runDbHousekeeping();
  setInterval(runDbHousekeeping, 24 * 60 * 60 * 1000);
  startSelfDestructInterval();
}

main().catch((err) => {
  logger.error({ err }, "Критическая ошибка при запуске");
  process.exit(1);
});

function gracefulShutdown(signal: string): void {
  logger.info(
    { signal },
    signal === "SIGTERM" ? "SIGTERM received, shutting down gracefully" : "Shutting down gracefully",
  );
  stopHeartbeat();
  wss.clients.forEach((ws) => {
    ws.close(1001, "Server shutting down");
  });
  wss.close(() => {
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
  });
  setTimeout(() => {
    logger.warn("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
