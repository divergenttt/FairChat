/**
 * Browser origins allowed for CORS, CSRF, and WebSocket.
 *
 * Env:
 * - ALLOWED_ORIGINS — comma-separated origins or wildcards (e.g. https://*.vercel.app)
 * - FRONTEND_URL — single production SPA URL
 */

interface WildcardRule {
  protocol: string;
  hostSuffix: string;
}

function parseOriginEntry(entry: string): string | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;
  try {
    return trimmed.includes("://") ? new URL(trimmed).origin : new URL(`https://${trimmed}`).origin;
  } catch {
    return null;
  }
}

function parseWildcardEntry(entry: string): WildcardRule | null {
  const trimmed = entry.trim();
  if (!trimmed || !trimmed.includes("*")) return null;
  try {
    const url = trimmed.includes("://") ? new URL(trimmed) : new URL(`https://${trimmed}`);
    const host = url.hostname;
    if (!host.startsWith("*.")) return null;
    return { protocol: url.protocol, hostSuffix: host.slice(2) };
  } catch {
    return null;
  }
}

const exactOrigins = new Set<string>();
const wildcardRules: WildcardRule[] = [];

function registerOrigin(entry: string): void {
  const wildcard = parseWildcardEntry(entry);
  if (wildcard) {
    wildcardRules.push(wildcard);
    return;
  }
  const origin = parseOriginEntry(entry);
  if (origin) exactOrigins.add(origin);
}

if (process.env.FRONTEND_URL?.trim()) {
  registerOrigin(process.env.FRONTEND_URL);
}

if (process.env.ALLOWED_ORIGINS?.trim()) {
  for (const part of process.env.ALLOWED_ORIGINS.split(",")) {
    registerOrigin(part);
  }
}

exactOrigins.add("http://localhost");
for (const p of [80, 443, 3000, 5173, 25003, 8080]) {
  exactOrigins.add(`http://localhost:${p}`);
}

function matchesWildcard(origin: string, rule: WildcardRule): boolean {
  try {
    const o = new URL(origin);
    if (o.protocol !== rule.protocol) return false;
    return o.hostname === rule.hostSuffix || o.hostname.endsWith(`.${rule.hostSuffix}`);
  } catch {
    return false;
  }
}

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (exactOrigins.has(origin)) return true;
  return wildcardRules.some((rule) => matchesWildcard(origin, rule));
}
