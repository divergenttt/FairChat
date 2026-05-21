import { Router, type IRouter, type Request, type Response } from "express";
import { db, sql } from "../db.js";
import type { User } from "../db.js";
import { onlineUsers } from "./ws-state.js";
import { getAuth } from "../lib/authCookie.js";

const router: IRouter = Router();

router.get("/search", async (req: Request, res: Response) => {
  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Не авторизован" });

  const raw = (req.query.q as string) ?? "";
  const q = raw.trim().replace(/^@+/, "").toLowerCase();
  if (!q) return res.status(400).json({ error: "Запрос обязателен" });

  const pattern = `%${q}%`;
  const results = await db.execute(sql`
    SELECT * FROM users
    WHERE LOWER(username) LIKE ${pattern}
      AND id != ${currentUser.id}
    LIMIT 10
  `) as Array<User & { bio?: string | null; wallet_address?: string | null }>;

  return res.json(
    results.map((u) => ({
      id: u.id, username: u.username,
      displayName: u.display_name, publicKey: u.public_key,
      createdAt: u.created_at, isOnline: onlineUsers.has(u.id),
      bio: u.bio ?? null, walletAddress: u.wallet_address ?? null,
    }))
  );
});

router.get("/id/:userId", async (req: Request, res: Response) => {
  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Не авторизован" });
  const { userId } = req.params as { userId: string };
  const users = await db.execute(sql`SELECT id, public_key, wallet_address FROM users WHERE id = ${userId}`);
  const user = users[0] as { id: string; public_key: string; wallet_address: string | null } | undefined;
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });
  return res.json({
    id: user.id,
    publicKey: user.public_key,
    walletAddress: user.wallet_address ?? null,
  });
});

router.get("/:username", async (req: Request, res: Response) => {
  if (!await getAuth(req)) return res.status(401).json({ error: "Не авторизован" });
  const clean = (req.params.username as string).toLowerCase().replace(/^@/, "");
  const users = await db.execute(sql`SELECT * FROM users WHERE username = ${clean}`);
  const user = users[0] as (User & { bio?: string | null; wallet_address?: string | null }) | undefined;
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });

  return res.json({
    id: user.id, username: user.username,
    displayName: user.display_name, publicKey: user.public_key,
    createdAt: user.created_at, isOnline: onlineUsers.has(user.id),
    bio: user.bio ?? null, walletAddress: user.wallet_address ?? null,
  });
});

export default router;
