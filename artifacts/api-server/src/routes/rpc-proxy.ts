import { Router, type Request, type Response } from "express";
import { getAuth } from "../lib/authCookie.js";

const router = Router();

const ALLOWED_RPC_URLS = new Set([
  "https://base-sepolia.drpc.org",
  "https://rpc.testnet.arc.network",
  "https://arc-testnet.drpc.org",
  "https://rpc.testnet.stable.xyz",
  "https://sepolia-rollup.arbitrum.io/rpc",
  "https://sepolia.drpc.org",
  "https://rpc.tempo.xyz",
]);

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const user = await getAuth(req);
  if (!user) {
    res.status(401).json({ error: "Не авторизован" });
    return;
  }
  const { rpcUrl, to, data } = req.body ?? {};
  if (!rpcUrl || !to || !data) {
    res.status(400).json({ error: "Missing rpcUrl, to, or data" });
    return;
  }
  if (!ALLOWED_RPC_URLS.has(rpcUrl)) {
    res.status(403).json({ error: "RPC URL not allowed" });
    return;
  }
  try {
    const rpcRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_call",
        params: [{ to, data }, "latest"],
        id: 1,
      }),
    });
    const json = await rpcRes.json();
    res.json(json);
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : "RPC request failed" });
  }
});

export default router;
