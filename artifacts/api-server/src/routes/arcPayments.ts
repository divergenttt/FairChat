import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "../lib/authCookie.js";
import { logger } from "../lib/logger.js";

const router = Router();

const CIRCLE_API = "https://gateway-api-testnet.circle.com";

const CIRCLE_TIMEOUT_MS = 20_000;

function circleSignal(): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CIRCLE_TIMEOUT_MS);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await getAuth(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
}

router.post("/verify", requireAuth, async (req: Request, res: Response) => {
  const { paymentPayload, paymentRequirements } = req.body ?? {};
  if (!paymentPayload || !paymentRequirements) {
    return res.status(400).json({ error: "Missing paymentPayload or paymentRequirements" });
  }
  const { signal, clear } = circleSignal();
  try {
    const upstream = await fetch(`${CIRCLE_API}/v1/x402/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentPayload, paymentRequirements }),
      signal,
    });
    clear();
    const text = await upstream.text();
    if (!text) return res.status(502).json({ error: "Empty response from Circle Gateway" });
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return res.status(502).json({ error: "Invalid response from Circle Gateway" });
    }
    return res.status(upstream.status).json(data);
  } catch (e: unknown) {
    clear();
    const msg = e instanceof Error && e.name === "AbortError"
      ? "Circle Gateway timed out"
      : "Circle Gateway unreachable";
    return res.status(502).json({ error: msg });
  }
});

router.post("/settle", requireAuth, async (req: Request, res: Response) => {
  const { paymentPayload, paymentRequirements } = req.body ?? {};
  if (!paymentPayload || !paymentRequirements) {
    return res.status(400).json({ error: "Missing paymentPayload or paymentRequirements" });
  }
  logger.info({ network: (paymentRequirements as Record<string, unknown>)?.network ?? "unknown" }, "Circle /settle request");
  const { signal, clear } = circleSignal();
  try {
    const upstream = await fetch(`${CIRCLE_API}/v1/x402/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentPayload, paymentRequirements }),
      signal,
    });
    clear();
    const text = await upstream.text();
    logger.info({ status: upstream.status, body: text.slice(0, 500) }, "Circle /settle response");
    if (!text) return res.status(502).json({ error: "Empty response from Circle Gateway" });
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return res.status(502).json({ error: `Circle Gateway returned non-JSON: ${text.slice(0, 200)}` });
    }
    return res.status(upstream.status).json(data);
  } catch (e: unknown) {
    clear();
    const msg = e instanceof Error && e.name === "AbortError"
      ? "Circle Gateway timed out"
      : "Circle Gateway unreachable";
    return res.status(502).json({ error: msg });
  }
});

export default router;
