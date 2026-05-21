import { Router, type IRouter, type Request, type Response } from "express";
import { db, sql } from "../db.js";
import type { User } from "../db.js";
import { onlineUsers } from "./ws-state.js";
import { getAuth } from "../lib/authCookie.js";

const router: IRouter = Router();

type UserRow = User & { last_seen?: string | null; avatar_url?: string | null; bio?: string | null; wallet_address?: string | null };

function serializeUser(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    publicKey: u.public_key,
    createdAt: u.created_at,
    isOnline: onlineUsers.has(u.id),
    lastSeen: u.last_seen ?? null,
    avatarUrl: u.avatar_url ?? null,
    bio: u.bio ?? null,
    walletAddress: u.wallet_address ?? null,
  };
}

router.get("/", async (req: Request, res: Response) => {
  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

  const rows = await db.execute(sql`
    SELECT u.* FROM users u
    INNER JOIN user_contacts uc ON uc.contact_id = u.id
    WHERE uc.user_id = ${currentUser.id}
    ORDER BY uc.created_at DESC
  `) as UserRow[];

  return res.json(rows.map(serializeUser));
});

router.post("/", async (req: Request, res: Response) => {
  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

  const { contactId } = req.body as { contactId?: string };
  if (!contactId) return res.status(400).json({ error: "contactId is required" });
  if (contactId === currentUser.id) return res.status(400).json({ error: "Cannot add yourself" });

  const targets = await db.execute(sql`SELECT * FROM users WHERE id = ${contactId}`);
  const target = targets[0] as UserRow | undefined;
  if (!target) return res.status(404).json({ error: "User not found" });

  const now = new Date().toISOString();
  await db.execute(sql`
    INSERT INTO user_contacts (user_id, contact_id, created_at)
    VALUES (${currentUser.id}, ${contactId}, ${now})
    ON CONFLICT (user_id, contact_id) DO NOTHING
  `);

  return res.status(201).json(serializeUser(target));
});

router.delete("/:contactId", async (req: Request, res: Response) => {
  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

  const { contactId } = req.params as { contactId: string };
  await db.execute(sql`DELETE FROM user_contacts WHERE user_id = ${currentUser.id} AND contact_id = ${contactId}`);

  return res.json({ ok: true });
});

router.get("/check/:contactId", async (req: Request, res: Response) => {
  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Unauthorized" });

  const { contactId } = req.params as { contactId: string };
  const row = await db.execute(sql`SELECT 1 FROM user_contacts WHERE user_id = ${currentUser.id} AND contact_id = ${contactId}`);

  return res.json({ isSaved: row.length > 0 });
});

export default router;
