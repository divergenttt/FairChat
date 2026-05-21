import { Router, type IRouter, type Request, type Response } from "express";
import { db, sql } from "../db.js";
import type { User, Message } from "../db.js";
import { sendToUser } from "./ws-state.js";
import { getAuth } from "../lib/authCookie.js";

const router: IRouter = Router();

export async function getReactionsForMsg(messageId: string, currentUserId: string) {
  const rows = await db.execute(sql`SELECT emoji, user_id FROM reactions WHERE message_id = ${messageId}`) as { emoji: string; user_id: string }[];
  const map: Record<string, { count: number; byMe: boolean }> = {};
  for (const row of rows) {
    if (!map[row.emoji]) map[row.emoji] = { count: 0, byMe: false };
    map[row.emoji].count++;
    if (row.user_id === currentUserId) map[row.emoji].byMe = true;
  }
  return Object.entries(map).map(([emoji, data]) => ({ emoji, count: data.count, byMe: data.byMe }));
}

export async function getBatchReactions(messageIds: string[], currentUserId: string) {
  if (messageIds.length === 0) return new Map<string, { emoji: string; count: number; byMe: boolean }[]>();
  const inList = sql.join(messageIds.map(id => sql`${id}`), sql`, `);
  const rows = await db.execute(sql`SELECT message_id, emoji, user_id FROM reactions WHERE message_id IN (${inList})`) as unknown as { message_id: string; emoji: string; user_id: string }[];
  const grouped = new Map<string, Map<string, { count: number; byMe: boolean }>>();
  for (const row of rows) {
    if (!grouped.has(row.message_id)) grouped.set(row.message_id, new Map());
    const emap = grouped.get(row.message_id)!;
    if (!emap.has(row.emoji)) emap.set(row.emoji, { count: 0, byMe: false });
    const e = emap.get(row.emoji)!;
    e.count++;
    if (row.user_id === currentUserId) e.byMe = true;
  }
  const result = new Map<string, { emoji: string; count: number; byMe: boolean }[]>();
  for (const msgId of messageIds) {
    const emap = grouped.get(msgId);
    result.set(msgId, emap ? [...emap.entries()].map(([emoji, data]) => ({ emoji, ...data })) : []);
  }
  return result;
}

router.post("/:messageId/:emoji", async (req: Request, res: Response) => {
  const user = await getAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { messageId, emoji } = req.params as { messageId: string; emoji: string };

  const msgs = await db.execute(sql`SELECT * FROM messages WHERE id = ${messageId}`);
  const msg = msgs[0] as Message | undefined;
  if (!msg) return res.status(404).json({ error: "Message not found" });

  if (msg.sender_id !== user.id && msg.recipient_id !== user.id) {
    return res.status(403).json({ error: "No access to this message" });
  }

  if (!emoji || emoji.length > 10) return res.status(400).json({ error: "Invalid emoji" });

  const existing = await db.execute(sql`
    SELECT 1 FROM reactions WHERE message_id = ${messageId} AND user_id = ${user.id} AND emoji = ${emoji}
  `);

  if (existing.length > 0) {
    await db.execute(sql`DELETE FROM reactions WHERE message_id = ${messageId} AND user_id = ${user.id} AND emoji = ${emoji}`);
  } else {
    await db.execute(sql`
      INSERT INTO reactions (message_id, user_id, emoji, created_at)
      VALUES (${messageId}, ${user.id}, ${emoji}, ${new Date().toISOString()})
    `);
  }

  const reactions = await getReactionsForMsg(messageId, user.id);
  const event = { type: "reaction_updated", messageId, reactions };
  sendToUser(msg.sender_id, event);
  sendToUser(msg.recipient_id, event);

  return res.json({ reactions });
});

export default router;
