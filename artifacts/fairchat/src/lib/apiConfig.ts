import { setBaseUrl } from "@workspace/api-client-react";

/** Optional absolute API origin (e.g. https://api.example.com). Empty = same-origin /api. */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : "";
}

/** Resolve /api/... for fetch; uses VITE_API_URL when set. */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
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

/** Register Orval customFetch base URL when VITE_API_URL is set. */
export function initApiClient(): void {
  const base = getApiBaseUrl();
  setBaseUrl(base || null);
}
