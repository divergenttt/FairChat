import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";
import rateLimit from "express-rate-limit";
import { slowDown } from "express-slow-down";
import { db, sql, getUserByToken, revokeToken } from "../db.js";
import { signToken, signWsToken, verifyToken, decodeExpiry } from "../jwt.js";
import { setAuthCookie, clearAuthCookie, extractToken, getAuth } from "../lib/authCookie.js";

const router: IRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again later" },
  skipSuccessfulRequests: true,
});

// Gradually slows down failed logins before the hard block kicks in.
// After 3 failed attempts, each subsequent request adds 500ms of delay (max 5s).
const loginSlowDown = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 3,
  delayMs: (hits) => Math.min((hits - 3) * 500, 5000),
  skipSuccessfulRequests: true,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registrations from this IP, please try again later" },
});

const checkLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, slow down" },
});

// Applied to PATCH /me and PATCH /me/password — authenticated mutations only
// keyGenerator uses Bearer token prefix so each user gets their own bucket
const meMutateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many account changes, please slow down" },
  keyGenerator: (req: Request) => {
    const tok = extractToken(req);
    return tok ? `tok:${tok.slice(0, 20)}` : req.ip ?? "no-ip";
  },
  validate: { keyGeneratorIpFallback: false },
});

router.post("/check-username", checkLimiter, async (req: Request, res: Response) => {
  const { username } = req.body as { username: string };
  if (!username) return res.status(400).json({ error: "Username обязателен" });

  const clean = username.toLowerCase().replace(/^@/, "");
  const existing = await db.execute(sql`SELECT id FROM users WHERE username = ${clean}`);
  return res.json({ available: existing.length === 0 });
});

router.post("/register", registerLimiter, async (req: Request, res: Response) => {
  const { displayName, username, password, publicKey, recoveryHash } = req.body as {
    displayName: string; username: string; password: string; publicKey: string; recoveryHash?: string;
  };

  if (!displayName || !username || !password || !publicKey) {
    return res.status(400).json({ error: "All fields are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const cleanUsername = username.toLowerCase().replace(/^@/, "");

  if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 32) {
    return res.status(400).json({ error: "Username must be 3–32 characters" });
  }
  if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
    return res.status(400).json({ error: "Username can only contain letters, numbers, and underscores" });
  }

  const trimmedDisplay = displayName.trim();
  if (!trimmedDisplay || trimmedDisplay.length > 64) {
    return res.status(400).json({ error: "Display name must be 1–64 characters" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = uuidv4();
  const now = new Date().toISOString();

  const storedRecoveryHash = recoveryHash
    ? createHash("sha256").update(recoveryHash).digest("hex")
    : null;

  try {
    await db.execute(sql`
      INSERT INTO users (id, username, display_name, password_hash, public_key, recovery_hash, created_at)
      VALUES (${userId}, ${cleanUsername}, ${trimmedDisplay}, ${passwordHash}, ${publicKey}, ${storedRecoveryHash}, ${now})
    `);
  } catch (err: any) {
    const errStr = String(err);
    const msg = String(err.message ?? "");
    const cause = err.cause;
    const causeCode = cause?.code;
    const causeMsg = String(cause?.message ?? "");
    if (
      err.code === "23505" ||
      causeCode === "23505" ||
      msg.includes("duplicate key") ||
      msg.includes("users_username_key") ||
      causeMsg.includes("duplicate key") ||
      causeMsg.includes("unique") ||
      errStr.includes("duplicate key")
    ) {
      return res.status(400).json({ error: "Username is already taken" });
    }
    throw err;
  }

  const token = signToken(userId, cleanUsername, 30);
  setAuthCookie(res, token, 30);

  return res.status(201).json({
    sessionExpiry: decodeExpiry(token)?.toISOString(),
    user: { id: userId, username: cleanUsername, displayName, publicKey, createdAt: now, isOnline: true },
  });
});

router.post("/login", loginLimiter, loginSlowDown, async (req: Request, res: Response) => {
  const { username, password, durationDays } = req.body as { username: string; password: string; durationDays?: number };
  if (!username || !password) return res.status(400).json({ error: "Username and password are required" });

  const cleanUsername = username.toLowerCase().replace(/^@/, "");
  const users = await db.execute(sql`SELECT * FROM users WHERE username = ${cleanUsername}`);
  const user = users[0] as { id: string; password_hash: string; display_name: string; public_key: string; created_at: string } | undefined;

  if (!user) return res.status(401).json({ error: "Invalid username or password" });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid username or password" });

  const days = typeof durationDays === "number" && durationDays > 0 ? durationDays : 30;
  const token = signToken(user.id, cleanUsername, days);
  setAuthCookie(res, token, days);

  return res.json({
    sessionExpiry: decodeExpiry(token)?.toISOString(),
    user: {
      id: user.id, username: cleanUsername,
      displayName: user.display_name, publicKey: user.public_key,
      createdAt: user.created_at, isOnline: true,
    },
  });
});

router.post("/restore/find", loginLimiter, async (req: Request, res: Response) => {
  const { recoveryHash, publicKey } = req.body as { recoveryHash?: string; publicKey?: string };

  let users: unknown[];
  if (recoveryHash) {
    // New secure flow: lookup by SHA-256(recoveryHash) stored at registration
    const storedHash = createHash("sha256").update(recoveryHash).digest("hex");
    users = await db.execute(sql`SELECT id, username, display_name FROM users WHERE recovery_hash = ${storedHash}`);
  } else if (publicKey) {
    // Legacy fallback for accounts registered before the recovery_hash scheme
    users = await db.execute(sql`SELECT id, username, display_name FROM users WHERE public_key = ${publicKey} AND recovery_hash IS NULL`);
  } else {
    return res.status(400).json({ error: "Recovery phrase is required" });
  }

  const user = users[0] as { id: string; username: string; display_name: string } | undefined;
  if (!user) return res.status(404).json({ error: "No account found for this recovery phrase" });
  return res.json({ username: user.username, displayName: user.display_name });
});

router.post("/restore/reset", loginLimiter, async (req: Request, res: Response) => {
  const { recoveryHash, publicKey, newPassword } = req.body as { recoveryHash?: string; publicKey?: string; newPassword: string };
  if ((!recoveryHash && !publicKey) || !newPassword) return res.status(400).json({ error: "All fields are required" });
  if (newPassword.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  let users: unknown[];
  if (recoveryHash) {
    const storedHash = createHash("sha256").update(recoveryHash).digest("hex");
    users = await db.execute(sql`SELECT * FROM users WHERE recovery_hash = ${storedHash}`);
  } else {
    users = await db.execute(sql`SELECT * FROM users WHERE public_key = ${publicKey!} AND recovery_hash IS NULL`);
  }

  const user = users[0] as { id: string; username: string; display_name: string; public_key: string; created_at: string } | undefined;
  if (!user) return res.status(404).json({ error: "No account found for this recovery phrase" });

  const newHash = await bcrypt.hash(newPassword, 10);
  // Cutoff is floored to the current second so the about-to-be-issued token
  // (whose JWT `iat` is also `floor(now/1000)`) is not invalidated by it.
  // Any token issued in a previous second will be rejected by getUserByToken.
  const cutoff = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  await db.execute(sql`UPDATE users SET password_hash = ${newHash}, tokens_invalid_before = ${cutoff} WHERE id = ${user.id}`);
  await db.execute(sql`DELETE FROM sessions WHERE user_id = ${user.id}`);

  const token = signToken(user.id, user.username, 30);
  setAuthCookie(res, token, 30);
  return res.json({
    sessionExpiry: decodeExpiry(token)?.toISOString(),
    user: {
      id: user.id, username: user.username,
      displayName: user.display_name, publicKey: user.public_key,
      createdAt: user.created_at, isOnline: true,
    },
  });
});

router.post("/logout", async (req: Request, res: Response) => {
  const tok = extractToken(req);
  if (tok) await revokeToken(tok);
  clearAuthCookie(res);
  return res.json({ success: true });
});

router.post("/refresh", async (req: Request, res: Response) => {
  const oldToken = extractToken(req);
  if (!oldToken) return res.status(401).json({ error: "Unauthorized" });

  const user = await getUserByToken(oldToken);
  if (!user) return res.status(401).json({ error: "Session expired" });

  const { durationDays } = req.body as { durationDays?: number };
  const days = typeof durationDays === "number" && durationDays > 0 ? durationDays : 30;

  await revokeToken(oldToken);
  const newToken = signToken(user.id, user.username, days);
  setAuthCookie(res, newToken, days);

  return res.json({
    sessionExpiry: decodeExpiry(newToken)?.toISOString(),
  });
});

/** Short-lived JWT for WebSocket when WS connects directly to the API host (e.g. Railway). */
router.get("/ws-token", async (req: Request, res: Response) => {
  const user = await getAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const wsToken = signWsToken(user.id, user.username);
  return res.json({ token: wsToken, expiresInSeconds: 300 });
});

router.get("/me", async (req: Request, res: Response) => {
  const tok = extractToken(req);
  if (!tok) return res.status(401).json({ error: "Unauthorized" });

  const user = await getUserByToken(tok);
  if (!user) return res.status(401).json({ error: "Session expired" });

  return res.json({
    id: user.id, username: user.username,
    displayName: user.display_name, publicKey: user.public_key,
    createdAt: user.created_at,
    avatarUrl: user.avatar_url ?? null,
    bio: user.bio ?? null,
    walletAddress: user.wallet_address ?? null,
    isOnline: true,
    sessionExpiry: decodeExpiry(tok)?.toISOString() ?? null,
  });
});

router.patch("/me", meMutateLimiter, async (req: Request, res: Response) => {
  const rawToken = extractToken(req);
  if (!rawToken) return res.status(401).json({ error: "Unauthorized" });
  const user = await getUserByToken(rawToken);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { displayName, avatarUrl, bio, publicKey, walletAddress } = req.body as {
    displayName?: string; avatarUrl?: string | null; bio?: string | null; publicKey?: string; walletAddress?: string | null;
  };

  if (displayName !== undefined) {
    const trimmed = displayName.trim();
    if (!trimmed || trimmed.length > 64) return res.status(400).json({ error: "Display name must be between 1 and 64 characters" });
    await db.execute(sql`UPDATE users SET display_name = ${trimmed} WHERE id = ${user.id}`);
  }

  if (avatarUrl !== undefined) {
    if (avatarUrl !== null) {
      const lc = avatarUrl.toLowerCase();
      if (lc.startsWith("javascript:") || lc.startsWith("data:") || lc.startsWith("vbscript:")) {
        return res.status(400).json({ error: "Invalid avatar URL" });
      }
      if (!avatarUrl.startsWith("/api/uploads/") && !/^https?:\/\//.test(avatarUrl)) {
        return res.status(400).json({ error: "Avatar must be an upload path or HTTPS URL" });
      }
    }
    await db.execute(sql`UPDATE users SET avatar_url = ${avatarUrl} WHERE id = ${user.id}`);
  }

  if (bio !== undefined) {
    const trimmedBio = bio ? bio.trim().slice(0, 120) : null;
    await db.execute(sql`UPDATE users SET bio = ${trimmedBio} WHERE id = ${user.id}`);
  }

  if (publicKey !== undefined && publicKey.length > 0) {
    // Key rotation is only permitted within 2 hours of token issuance.
    // This binds key updates to a recent successful authentication (password entry),
    // preventing a stolen session token from silently replacing the encryption key.
    const payload = verifyToken(rawToken);
    const issuedAt = payload?.iat ? payload.iat * 1000 : 0;
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    if (Date.now() - issuedAt > TWO_HOURS_MS) {
      return res.status(403).json({
        error: "Encryption key rotation is only allowed within 2 hours of login. Please log in again to update your key.",
        code: "KEY_ROTATION_REQUIRES_FRESH_LOGIN",
      });
    }
    await db.execute(sql`UPDATE users SET public_key = ${publicKey} WHERE id = ${user.id}`);
  }

  if (walletAddress !== undefined) {
    const trimmedWallet = walletAddress ? walletAddress.trim() : null;
    if (trimmedWallet && !/^0x[0-9a-fA-F]{40}$/.test(trimmedWallet)) {
      return res.status(400).json({ error: "Invalid wallet address — must be 0x followed by 40 hex characters" });
    }
    await db.execute(sql`UPDATE users SET wallet_address = ${trimmedWallet} WHERE id = ${user.id}`);
  }

  const updated = (await db.execute(sql`SELECT * FROM users WHERE id = ${user.id}`))[0] as User;
  return res.json({
    id: updated.id, username: updated.username,
    displayName: updated.display_name, publicKey: updated.public_key,
    createdAt: updated.created_at,
    avatarUrl: updated.avatar_url ?? null,
    bio: updated.bio ?? null,
    walletAddress: updated.wallet_address ?? null,
    isOnline: true,
  });
});

router.patch("/me/password", meMutateLimiter, async (req: Request, res: Response) => {
  const user = await getAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  if (!currentPassword || !newPassword) return res.status(400).json({ error: "All fields are required" });
  if (newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(400).json({ error: "Current password is incorrect" });

  const newHash = await bcrypt.hash(newPassword, 10);
  // Invalidate every JWT issued before the current second (including the one this
  // request used) and wipe any opaque sessions for this user. Cutoff is floored to
  // the current second so the about-to-be-issued token (iat = floor(now/1000)) passes.
  const cutoff = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  await db.execute(sql`UPDATE users SET password_hash = ${newHash}, tokens_invalid_before = ${cutoff} WHERE id = ${user.id}`);
  await db.execute(sql`DELETE FROM sessions WHERE user_id = ${user.id}`);

  // Issue a fresh token for the current device so the user is not logged out here.
  const newToken = signToken(user.id, user.username, 30);
  setAuthCookie(res, newToken, 30);

  return res.json({ success: true, sessionExpiry: decodeExpiry(newToken)?.toISOString() });
});

type User = import("../db.js").User;
export default router;
