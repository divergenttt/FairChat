import { Router, type Request, type Response } from "express";
import type { User } from "../db.js";
import { getAuth } from "../lib/authCookie.js";

const PRIVATE_IP_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|::1|fc00:|fd[0-9a-f]{2}:)/i;

function isSafeUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (PRIVATE_IP_RE.test(host)) return false;
    if (host === "localhost") return false;
    return true;
  } catch {
    return false;
  }
}

const router = Router();

interface LinkPreview {
  title: string;
  description: string;
  image: string;
  siteName: string;
  url: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheEntry { preview: LinkPreview; cachedAt: number; }
const cache = new Map<string, CacheEntry>();

function getOgTag(html: string, prop: string): string {
  const r1 = html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"));
  const r2 = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, "i"));
  return (r1?.[1] || r2?.[1] || "").trim();
}

function getMetaName(html: string, name: string): string {
  const r1 = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"));
  const r2 = html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"));
  return (r1?.[1] || r2?.[1] || "").trim();
}

router.get("/link-preview", async (req: Request, res: Response) => {
  const url = req.query["url"] as string;
  if (!url) return res.status(400).json({ error: "URL is required" });
  if (!isSafeUrl(url)) return res.status(400).json({ error: "Invalid or disallowed URL" });

  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

  const existing = cache.get(url);
  if (existing && Date.now() - existing.cachedAt < CACHE_TTL_MS) {
    return res.json(existing.preview);
  }

  if (cache.size >= 500) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; FairChatBot/1.0; +https://fairchat.app/bot)",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    const finalUrl = response.url ?? url;
    if (!isSafeUrl(finalUrl)) {
      return res.status(400).json({ error: "Redirect to disallowed URL" });
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      const result: LinkPreview = { title: "", description: "", image: "", siteName: new URL(url).hostname, url };
      cache.set(url, { preview: result, cachedAt: Date.now() });
      return res.json(result);
    }

    const MAX_HTML_BYTES = 512 * 1024;
    const reader = response.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      let bytesRead = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        bytesRead += value.byteLength;
        html += decoder.decode(value, { stream: true });
        if (bytesRead >= MAX_HTML_BYTES) { reader.cancel(); break; }
      }
    } else {
      html = await response.text();
      if (html.length > MAX_HTML_BYTES) html = html.slice(0, MAX_HTML_BYTES);
    }

    const title   = (getOgTag(html, "og:title") || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").trim().slice(0, 200);
    const description = (getOgTag(html, "og:description") || getMetaName(html, "description") || "").trim().slice(0, 300);
    const rawImage = getOgTag(html, "og:image").slice(0, 500);
    const image = /^https?:\/\//.test(rawImage) ? rawImage : "";
    const siteName = (getOgTag(html, "og:site_name") || new URL(url).hostname);

    const result: LinkPreview = { title, description, image, siteName, url };
    cache.set(url, { preview: result, cachedAt: Date.now() });
    return res.json(result);
  } catch {
    const result: LinkPreview = { title: "", description: "", image: "", siteName: new URL(url).hostname, url };
    return res.json(result);
  }
});

export default router;
