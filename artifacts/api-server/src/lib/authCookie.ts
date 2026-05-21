import type { Request, Response } from "express";
import { getUserByToken } from "../db.js";

const COOKIE_NAME = "fairchat_auth";

export { COOKIE_NAME };

export function setAuthCookie(res: Response, token: string, maxAgeDays: number) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api",
    maxAge: maxAgeDays * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: true, sameSite: "lax", path: "/api" });
}

export function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (typeof cookieToken === "string" && cookieToken.length > 0) return cookieToken;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return null;
}

export async function getAuth(req: Request) {
  const token = extractToken(req);
  if (!token) return null;
  return getUserByToken(token);
}

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name) result[name] = decodeURIComponent(value);
  }
  return result;
}
