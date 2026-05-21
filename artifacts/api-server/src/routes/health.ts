import { Router, type IRouter, type Request, type Response } from "express";
import { db, sql } from "../db.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

async function healthCheck(_req: Request, res: Response): Promise<void> {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({
      status: "ok",
      db: "connected",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "unknown",
    });
  } catch (e) {
    logger.error({ err: e }, "Health check DB failure");
    res.status(503).json({
      status: "error",
      db: "disconnected",
      timestamp: new Date().toISOString(),
    });
  }
}

router.get("/health", healthCheck);
router.get("/healthz", healthCheck);

export default router;
