import { Router, type IRouter, type Request, type Response } from "express";
import { db, sql } from "../db.js";
import type { User } from "../db.js";
import { sendToUser } from "./ws-state.js";
import { getAuth } from "../lib/authCookie.js";

const router: IRouter = Router();

router.get("/status", async (req: Request, res: Response) => {
  const user = await getAuth(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });

  const blockedRows = await db.execute(sql`SELECT blocked_id FROM user_blocks WHERE blocker_id = ${user.id}`) as { blocked_id: string }[];
  const mutedRows = await db.execute(sql`SELECT muted_id FROM user_mutes WHERE muter_id = ${user.id}`) as { muted_id: string }[];

  return res.json({
    blocked: blockedRows.map(r => r.blocked_id),
    muted: mutedRows.map(r => r.muted_id),
  });
});

router.post("/block/:userId", async (req: Request, res: Response) => {
  const user = await getAuth(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });

  const { userId } = req.params as { userId: string };
  if (userId === user.id) return res.status(400).json({ error: "Нельзя заблокировать себя" });

  const now = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO user_blocks (blocker_id, blocked_id, created_at)
    VALUES (${user.id}, ${userId}, ${now})
    ON CONFLICT (blocker_id, blocked_id) DO NOTHING
  `);
  sendToUser(user.id, { type: "block_updated", blockedId: userId, action: "block" });
  return res.json({ ok: true });
});

router.delete("/block/:userId", async (req: Request, res: Response) => {
  const user = await getAuth(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });

  const { userId } = req.params as { userId: string };
  await db.execute(sql`DELETE FROM user_blocks WHERE blocker_id = ${user.id} AND blocked_id = ${userId}`);
  sendToUser(user.id, { type: "block_updated", blockedId: userId, action: "unblock" });
  return res.json({ ok: true });
});

router.post("/mute/:userId", async (req: Request, res: Response) => {
  const user = await getAuth(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });

  const { userId } = req.params as { userId: string };
  if (userId === user.id) return res.status(400).json({ error: "Нельзя заглушить себя" });

  const now = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO user_mutes (muter_id, muted_id, created_at)
    VALUES (${user.id}, ${userId}, ${now})
    ON CONFLICT (muter_id, muted_id) DO NOTHING
  `);
  sendToUser(user.id, { type: "mute_updated", mutedId: userId, action: "mute" });
  return res.json({ ok: true });
});

router.delete("/mute/:userId", async (req: Request, res: Response) => {
  const user = await getAuth(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });

  const { userId } = req.params as { userId: string };
  await db.execute(sql`DELETE FROM user_mutes WHERE muter_id = ${user.id} AND muted_id = ${userId}`);
  sendToUser(user.id, { type: "mute_updated", mutedId: userId, action: "unmute" });
  return res.json({ ok: true });
});

export default router;
