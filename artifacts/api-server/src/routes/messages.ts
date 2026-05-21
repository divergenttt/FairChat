import { Router, type IRouter, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db, sql, chatKey } from "../db.js";
import type { User, Message } from "../db.js";
import { onlineUsers, sendToUser } from "./ws-state.js";
import { getReactionsForMsg, getBatchReactions } from "./reactions.js";
import { getAuth } from "../lib/authCookie.js";

const router: IRouter = Router();

function serializeMsg(m: Message) {
  return {
    id: m.id,
    senderId: m.sender_id,
    recipientId: m.recipient_id,
    encryptedContent: m.encrypted_content,
    replyToId: m.reply_to_id ?? null,
    editedAt: m.edited_at ?? null,
    isRead: m.is_read === 1,
    createdAt: m.created_at,
    attachmentUrl: m.attachment_url ?? null,
    attachmentName: m.attachment_name ?? null,
    attachmentType: m.attachment_type ?? null,
    attachmentSize: m.attachment_size ?? null,
    destroyAfter: m.destroy_after ?? null,
    destroyAt: m.destroy_at ?? null,
    messageType: m.message_type ?? "text",
    deliveryStatus: m.delivery_status ?? "sent",
  };
}

// ── GET /conversations ────────────────────────────────────────────────────────
router.get("/conversations", async (req: Request, res: Response) => {
  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Не авторизован" });

  const rows = await db.execute(sql`
    WITH latest AS (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id)
          ORDER BY created_at DESC
        ) AS rn
      FROM messages
      WHERE sender_id = ${currentUser.id} OR recipient_id = ${currentUser.id}
    )
    SELECT m.*, u.username, u.display_name, u.public_key, u.created_at AS user_created_at,
           u.id AS uid, u.last_seen, u.avatar_url, u.bio, u.wallet_address
    FROM latest m
    JOIN users u ON u.id = CASE WHEN m.sender_id = ${currentUser.id} THEN m.recipient_id ELSE m.sender_id END
    WHERE m.rn = 1
    ORDER BY m.created_at DESC
  `) as Array<Message & {
    username: string; display_name: string; public_key: string; user_created_at: string;
    uid: string; last_seen: string | null; avatar_url: string | null; bio: string | null; wallet_address: string | null;
  }>;

  const otherIds = rows.map(r => r.uid);
  let unreadMap = new Map<string, number>();
  if (otherIds.length > 0) {
    const inList = sql.join(otherIds.map(id => sql`${id}`), sql`, `);
    const unreadRows = await db.execute(sql`SELECT sender_id, COUNT(*)::int AS cnt FROM messages WHERE sender_id IN (${inList}) AND recipient_id = ${currentUser.id} AND is_read = 0 GROUP BY sender_id`) as unknown as { sender_id: string; cnt: number }[];
    for (const r of unreadRows) unreadMap.set(r.sender_id, r.cnt);
  }

  const results = rows.map((row) => ({
    user: {
      id: row.uid, username: row.username,
      displayName: row.display_name, publicKey: row.public_key,
      createdAt: row.user_created_at, isOnline: onlineUsers.has(row.uid),
      lastSeen: row.last_seen ?? null,
      avatarUrl: row.avatar_url ?? null,
      bio: row.bio ?? null,
      walletAddress: row.wallet_address ?? null,
    },
    lastMessage: serializeMsg(row),
    unreadCount: unreadMap.get(row.uid) ?? 0,
  }));

  return res.json(results);
});

// ── POST /read ────────────────────────────────────────────────────────────────
router.post("/read", async (req: Request, res: Response) => {
  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Не авторизован" });

  const { senderId } = req.body as { senderId: string };
  if (!senderId) return res.status(400).json({ error: "senderId обязателен" });

  await db.execute(sql`UPDATE messages SET is_read = 1, delivery_status = 'read' WHERE sender_id = ${senderId} AND recipient_id = ${currentUser.id} AND is_read = 0`);

  const toDestroy = await db.execute(sql`
    SELECT id, destroy_after FROM messages
    WHERE sender_id = ${senderId} AND recipient_id = ${currentUser.id}
      AND destroy_after IS NOT NULL AND destroy_at IS NULL AND is_read = 1
  `) as { id: string; destroy_after: number }[];

  for (const m of toDestroy) {
    const deltaMs = m.destroy_after * 1000;
    if (!isFinite(deltaMs) || deltaMs <= 0) continue;
    const destroyAt = new Date(Date.now() + deltaMs).toISOString();
    await db.execute(sql`UPDATE messages SET destroy_at = ${destroyAt} WHERE id = ${m.id}`);
    const updated = (await db.execute(sql`SELECT * FROM messages WHERE id = ${m.id}`))[0] as Message;
    const event = { type: "message_updated", message: serializeMsg(updated) };
    sendToUser(senderId, event);
    sendToUser(currentUser.id, event);
  }

  sendToUser(senderId, { type: "messages_read", readBy: currentUser.id });
  return res.json({ ok: true });
});

// ── POST /pin ─────────────────────────────────────────────────────────────────
router.post("/pin", async (req: Request, res: Response) => {
  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Не авторизован" });

  const { chatUserId, messageId } = req.body as { chatUserId: string; messageId: string | null };
  if (!chatUserId) return res.status(400).json({ error: "chatUserId обязателен" });

  const key = chatKey(currentUser.id, chatUserId);
  const pinnedAt = new Date().toISOString();

  if (messageId) {
    const chatMsg = await db.execute(sql`
      SELECT 1 FROM messages WHERE id = ${messageId}
        AND ((sender_id = ${currentUser.id} AND recipient_id = ${chatUserId})
          OR (sender_id = ${chatUserId} AND recipient_id = ${currentUser.id}))
    `);
    if (chatMsg.length === 0) return res.status(403).json({ error: "Message not in this chat" });

    await db.execute(sql`
      INSERT INTO pinned_messages (chat_key, message_id, pinned_by, pinned_at)
      VALUES (${key}, ${messageId}, ${currentUser.id}, ${pinnedAt})
      ON CONFLICT (chat_key) DO UPDATE
        SET message_id = EXCLUDED.message_id, pinned_by = EXCLUDED.pinned_by, pinned_at = EXCLUDED.pinned_at
    `);

    const msgs = await db.execute(sql`SELECT * FROM messages WHERE id = ${messageId}`);
    const msg = msgs[0] as Message | undefined;
    const payload = { type: "message_pinned", chatKey: key, message: msg ? serializeMsg(msg) : null };
    sendToUser(currentUser.id, payload);
    sendToUser(chatUserId, payload);
  } else {
    await db.execute(sql`DELETE FROM pinned_messages WHERE chat_key = ${key}`);
    const payload = { type: "message_pinned", chatKey: key, message: null };
    sendToUser(currentUser.id, payload);
    sendToUser(chatUserId, payload);
  }

  return res.json({ ok: true });
});

// ── GET /pinned/:chatUserId ───────────────────────────────────────────────────
router.get("/pinned/:chatUserId", async (req: Request, res: Response) => {
  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Не авторизован" });

  const { chatUserId } = req.params as { chatUserId: string };
  const key = chatKey(currentUser.id, chatUserId);

  const pins = await db.execute(sql`SELECT * FROM pinned_messages WHERE chat_key = ${key}`);
  const pinned = pins[0] as { message_id: string } | undefined;
  if (!pinned?.message_id) return res.json(null);

  const msgs = await db.execute(sql`SELECT * FROM messages WHERE id = ${pinned.message_id}`);
  const msg = msgs[0] as Message | undefined;
  return res.json(msg ? serializeMsg(msg) : null);
});

// ── DELETE /conversation/:userId ─────────────────────────────────────────────
router.delete("/conversation/:userId", async (req: Request, res: Response) => {
  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Не авторизован" });

  const { userId } = req.params as { userId: string };
  const scope = req.query.scope as string | undefined;

  if (!["forMe", "forThem", "forBoth"].includes(scope ?? "")) {
    return res.status(400).json({ error: "scope must be forMe, forThem, or forBoth" });
  }

  let condition;
  if (scope === "forMe") {
    condition = sql`sender_id = ${currentUser.id} AND recipient_id = ${userId}`;
  } else if (scope === "forThem") {
    condition = sql`sender_id = ${userId} AND recipient_id = ${currentUser.id}`;
  } else {
    condition = sql`(sender_id = ${currentUser.id} AND recipient_id = ${userId}) OR (sender_id = ${userId} AND recipient_id = ${currentUser.id})`;
  }

  const result = await db.execute(sql`DELETE FROM messages WHERE ${condition}`);

  const event = { type: "conversation_deleted", peerId: userId, scope };
  sendToUser(currentUser.id, event);
  if (scope === "forThem" || scope === "forBoth") {
    sendToUser(userId, { type: "conversation_deleted", peerId: currentUser.id, scope });
  }

  return res.json({ deleted: Number(result.count) });
});

// ── DELETE /delete ────────────────────────────────────────────────────────────
router.delete("/delete", async (req: Request, res: Response) => {
  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Не авторизован" });

  const { ids } = req.body as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100)
    return res.status(400).json({ error: "ids must be an array of 1–100 message IDs" });

  const idList = sql.join(ids.map(id => sql`${id}`), sql`, `);

  const affected = await db.execute(sql`
    SELECT DISTINCT recipient_id, sender_id FROM messages
    WHERE id IN (${idList}) AND (sender_id = ${currentUser.id} OR recipient_id = ${currentUser.id})
  `) as { recipient_id: string; sender_id: string }[];

  const result = await db.execute(sql`
    DELETE FROM messages
    WHERE id IN (${idList}) AND (sender_id = ${currentUser.id} OR recipient_id = ${currentUser.id})
  `);

  const notifySet = new Set<string>([currentUser.id]);
  affected.forEach((r) => { notifySet.add(r.recipient_id); notifySet.add(r.sender_id); });
  notifySet.forEach((uid) => sendToUser(uid, { type: "messages_deleted", ids }));

  return res.json({ deleted: Number(result.count) });
});

// ── GET /payment-history ──────────────────────────────────────────────────────
// MUST be registered before GET /:recipientId — otherwise Express will match
// /payment-history as a recipientId and this route would never be reached.
router.get("/payment-history", async (req: Request, res: Response) => {
  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Не авторизован" });

  const rows = await db.execute(sql`
    SELECT
      m.id, m.sender_id, m.recipient_id, m.encrypted_content, m.created_at, m.message_type,
      CASE WHEN m.sender_id = ${currentUser.id} THEN ur.id    ELSE us.id    END AS partner_id,
      CASE WHEN m.sender_id = ${currentUser.id} THEN ur.display_name ELSE us.display_name END AS partner_name,
      CASE WHEN m.sender_id = ${currentUser.id} THEN ur.username     ELSE us.username     END AS partner_username,
      CASE WHEN m.sender_id = ${currentUser.id} THEN ur.public_key  ELSE us.public_key  END AS partner_public_key
    FROM messages m
    JOIN users us ON us.id = m.sender_id
    JOIN users ur ON ur.id = m.recipient_id
    WHERE (m.sender_id = ${currentUser.id} OR m.recipient_id = ${currentUser.id})
      AND m.message_type IN ('payment', 'payment_request')
    ORDER BY m.created_at DESC
    LIMIT 100
  `);

  return res.json((rows as any[]).map(r => ({
    id:              r.id,
    messageType:     r.message_type,
    encryptedContent: r.encrypted_content,
    createdAt:       r.created_at,
    isSent:          r.sender_id === currentUser.id,
    partnerId:       r.partner_id,
    partnerName:     r.partner_name,
    partnerUsername: r.partner_username,
    partnerPublicKey: r.partner_public_key,
  })));
});

// ── GET /:recipientId ─────────────────────────────────────────────────────────
router.get("/:recipientId", async (req: Request, res: Response) => {
  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Не авторизован" });

  const recipientId = req.params.recipientId as string;
  const parsedLimit = parseInt((req.query.limit as string) ?? "60", 10);
  const limit = Math.min(isNaN(parsedLimit) || parsedLimit < 1 ? 60 : parsedLimit, 200);
  const before = req.query.before as string | undefined;

  const msgRows = before
    ? await db.execute(sql`
        SELECT * FROM messages
        WHERE ((sender_id = ${currentUser.id} AND recipient_id = ${recipientId})
            OR (sender_id = ${recipientId} AND recipient_id = ${currentUser.id}))
          AND created_at < ${before}
        ORDER BY created_at DESC LIMIT ${limit}
      `)
    : await db.execute(sql`
        SELECT * FROM messages
        WHERE (sender_id = ${currentUser.id} AND recipient_id = ${recipientId})
           OR (sender_id = ${recipientId} AND recipient_id = ${currentUser.id})
        ORDER BY created_at DESC LIMIT ${limit}
      `);

  const msgs = msgRows as unknown as Message[];
  const hasMore = msgs.length === limit;
  const ordered = [...msgs].reverse();
  const reactionsMap = await getBatchReactions(ordered.map(m => m.id), currentUser.id);

  return res.json({
    messages: ordered.map((m) => ({
      ...serializeMsg(m),
      reactions: reactionsMap.get(m.id) ?? [],
    })),
    hasMore,
  });
});

// ── POST /:recipientId (send) ─────────────────────────────────────────────────
router.post("/:recipientId", async (req: Request, res: Response) => {
  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Не авторизован" });

  const recipientId = req.params.recipientId as string;
  const { encryptedContent, replyToId, attachmentUrl, attachmentName, attachmentType, attachmentSize, destroyAfter, messageType } =
    req.body as { encryptedContent: string; replyToId?: string; attachmentUrl?: string; attachmentName?: string; attachmentType?: string; attachmentSize?: number; destroyAfter?: number; messageType?: string };

  if (recipientId !== currentUser.id) {
    const blocked = await db.execute(sql`SELECT 1 FROM user_blocks WHERE blocker_id = ${recipientId} AND blocked_id = ${currentUser.id}`);
    if (blocked.length > 0) return res.status(403).json({ error: "Cannot send message" });

    const inContacts = await db.execute(sql`
      SELECT 1 FROM user_contacts
      WHERE user_id = ${currentUser.id} AND contact_id = ${recipientId}
    `);
    if (inContacts.length === 0) {
      return res.status(403).json({
        error: "Add this user to your contacts before sending messages",
        code: "RECIPIENT_NOT_IN_CONTACTS",
      });
    }
  }

  const msgType = messageType === "payment" ? "payment"
    : messageType === "payment_request" ? "payment_request"
    : messageType === "payment_request_declined" ? "payment_request_declined"
    : "text";

  if (!encryptedContent && !attachmentUrl)
    return res.status(400).json({ error: "Содержимое или вложение обязательно" });

  // All message types store E2E ciphertext in encrypted_content (including payments).
  const MAX_CONTENT = 65_536;
  if (encryptedContent && encryptedContent.length > MAX_CONTENT) {
    return res.status(400).json({ error: `Content too long (max ${MAX_CONTENT} characters)` });
  }

  if (attachmentUrl !== undefined && attachmentUrl !== null) {
    if (typeof attachmentUrl !== "string" || !attachmentUrl.startsWith("/api/uploads/")) {
      return res.status(400).json({ error: "Invalid attachment URL" });
    }
  }

  if (attachmentName !== undefined && attachmentName !== null && attachmentName.length > 255) {
    return res.status(400).json({ error: "Attachment name too long (max 255 characters)" });
  }
  if (attachmentType !== undefined && attachmentType !== null && attachmentType.length > 127) {
    return res.status(400).json({ error: "Attachment type too long" });
  }

  // Validate replyToId belongs to this conversation (prevents cross-conversation references)
  if (replyToId) {
    const replyMsg = await db.execute(sql`
      SELECT 1 FROM messages WHERE id = ${replyToId}
        AND ((sender_id = ${currentUser.id} AND recipient_id = ${recipientId})
          OR (sender_id = ${recipientId} AND recipient_id = ${currentUser.id}))
    `);
    if (replyMsg.length === 0) return res.status(400).json({ error: "Reply target not found in this conversation" });
  }

  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const content = encryptedContent ?? "";
  // Cap destroyAfter at 30 days (2 592 000 s) to prevent Date overflow in the /read handler
  const MAX_DESTROY_SECS = 2_592_000;
  const da = destroyAfter && typeof destroyAfter === "number" && isFinite(destroyAfter) && destroyAfter > 0
    ? Math.min(Math.floor(destroyAfter), MAX_DESTROY_SECS)
    : null;

  await db.execute(sql`
    INSERT INTO messages (id, sender_id, recipient_id, encrypted_content, reply_to_id, created_at,
                          attachment_url, attachment_name, attachment_type, attachment_size, destroy_after, message_type)
    VALUES (${id}, ${currentUser.id}, ${recipientId}, ${content}, ${replyToId ?? null}, ${createdAt},
            ${attachmentUrl ?? null}, ${attachmentName ?? null}, ${attachmentType ?? null},
            ${attachmentSize ?? null}, ${da}, ${msgType})
  `);

  const recipientOnline = recipientId !== currentUser.id && onlineUsers.has(recipientId);
  const deliveryStatus = recipientOnline ? "delivered" : "sent";

  if (recipientOnline) {
    await db.execute(sql`UPDATE messages SET delivery_status = 'delivered' WHERE id = ${id}`);
  }

  const msg = {
    id, senderId: currentUser.id, recipientId,
    encryptedContent: content,
    replyToId: replyToId ?? null, editedAt: null, isRead: false, createdAt, reactions: [],
    attachmentUrl: attachmentUrl ?? null, attachmentName: attachmentName ?? null,
    attachmentType: attachmentType ?? null, attachmentSize: attachmentSize ?? null,
    destroyAfter: da, destroyAt: null, messageType: msgType, deliveryStatus,
  };
  const event = { type: "new_message", message: msg };
  sendToUser(recipientId, event);
  sendToUser(currentUser.id, event);

  return res.status(201).json(msg);
});

// ── GET /media/:userId (gallery) ─────────────────────────────────────────────
router.get("/media/:userId", async (req: Request, res: Response) => {
  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Не авторизован" });
  const { userId } = req.params as { userId: string };
  const rows = await db.execute(sql`
    SELECT * FROM messages
    WHERE attachment_url IS NOT NULL
      AND ((sender_id = ${currentUser.id} AND recipient_id = ${userId})
        OR (sender_id = ${userId} AND recipient_id = ${currentUser.id}))
    ORDER BY created_at DESC LIMIT 200
  `) as Message[];
  return res.json({ media: rows.map(serializeMsg) });
});

// ── PUT /:id (edit) ───────────────────────────────────────────────────────────
router.put("/:id", async (req: Request, res: Response) => {
  const currentUser = await getAuth(req);
  if (!currentUser) return res.status(401).json({ error: "Не авторизован" });

  const { id } = req.params as { id: string };
  const { encryptedContent } = req.body as { encryptedContent: string };
  if (!encryptedContent) return res.status(400).json({ error: "Содержимое обязательно" });

  const existing = (await db.execute(sql`SELECT * FROM messages WHERE id = ${id}`))[0] as Message | undefined;
  if (!existing) return res.status(404).json({ error: "Сообщение не найдено" });
  if (existing.sender_id !== currentUser.id) return res.status(403).json({ error: "Нет доступа" });

  const editedAt = new Date().toISOString();
  await db.execute(sql`UPDATE messages SET encrypted_content = ${encryptedContent}, edited_at = ${editedAt} WHERE id = ${id}`);

  const updated = { ...serializeMsg(existing), encryptedContent, editedAt };
  const event = { type: "message_edited", message: updated };
  sendToUser(existing.sender_id, event);
  sendToUser(existing.recipient_id, event);

  return res.json(updated);
});

export default router;
