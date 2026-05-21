import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { logger } from "./lib/logger.js";

// JWT_SECRET must be set via environment variable in production.
// If missing, we generate a random ephemeral secret at startup (sessions
// will be invalidated on server restart — acceptable only in development).
const JWT_SECRET_ENV = process.env.JWT_SECRET;
let SECRET: string;
if (JWT_SECRET_ENV) {
  SECRET = JWT_SECRET_ENV;
} else {
  SECRET = randomBytes(48).toString("hex");
  logger.warn(
    "JWT_SECRET env var is not set — using a random ephemeral secret. " +
    "All sessions will be invalidated on server restart. " +
    "Set JWT_SECRET environment variable for persistent sessions."
  );
}

export interface JwtPayload {
  userId: string;
  username: string;
  iat?: number;
}

const MAX_DAYS = 365;

export function signToken(userId: string, username: string, durationDays: number = 30): string {
  const days = Math.min(Math.max(1, durationDays), MAX_DAYS);
  return jwt.sign({ userId, username } satisfies JwtPayload, SECRET, {
    expiresIn: `${days}d`,
  });
}

/** Short-lived JWT for WebSocket auth when the WS host differs from the SPA origin. */
export function signWsToken(userId: string, username: string): string {
  return jwt.sign({ userId, username } satisfies JwtPayload, SECRET, {
    expiresIn: "5m",
  });
}

export function verifyToken(token: string): (JwtPayload & { exp: number }) | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload & { exp: number };
  } catch {
    return null;
  }
}

export function decodeExpiry(token: string): Date | null {
  try {
    const decoded = jwt.decode(token) as { exp?: number } | null;
    if (!decoded?.exp) return null;
    return new Date(decoded.exp * 1000);
  } catch {
    return null;
  }
}
