import { setBaseUrl } from "@workspace/api-client-react";

/**
 * API origin baked at build time (Vite).
 * - `VITE_API_URL` — explicit client base (Railway URL in production)
 * - `API_SERVER_URL` — Vercel build var; injected when `VITE_API_URL` is unset
 * - `""` — same-origin `/api` (local proxy or Vercel rewrites)
 */
export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");

/** @deprecated alias — use API_BASE_URL */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

/** Resolve `/api/...` against API_BASE_URL or same-origin path. */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${p}` : p;
}

/**
 * WebSocket endpoint. VITE_WS_URL should point at the API host (Railway) in production;
 * omit for local same-origin dev (Vite proxy or shared host).
 */
export function getWsUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL?.trim();
  if (explicit) {
    const base = explicit.replace(/\/+$/, "");
    return base.endsWith("/api/ws") ? base : `${base}/api/ws`;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws`;
}

/** True when WS host differs from the SPA — cookie upgrade auth will not work. */
export function wsNeedsTokenAuth(wsUrl: string): boolean {
  try {
    return new URL(wsUrl).host !== window.location.host;
  } catch {
    return false;
  }
}

/** Wire Orval `customFetch` + any `/api/...` paths to API_BASE_URL. */
export function initApiClient(): void {
  setBaseUrl(API_BASE_URL || null);
}
