import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import express from "express";
import path from "path";
import rateLimit from "express-rate-limit";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import usersRouter from "./users.js";
import messagesRouter from "./messages.js";
import reactionsRouter from "./reactions.js";
import linkPreviewRouter from "./link-preview.js";
import uploadRouter, { INLINE_SAFE_TYPES, UPLOAD_DIR } from "./upload.js";
import mime from "mime-types";
import moderationRouter from "./moderation.js";
import arcPaymentsRouter from "./arcPayments.js";
import contactsRouter from "./contacts.js";
import rpcProxyRouter from "./rpc-proxy.js";
import { db, sql, getUserByToken } from "../db.js";
import { extractToken, getAuth as getAuthCookie } from "../lib/authCookie.js";

const router: IRouter = Router();

function tokenKey(req: Request): string {
  const tok = extractToken(req);
  return tok ? tok.slice(0, 20) : "no-auth";
}

const messageSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many messages, slow down" },
  keyGenerator: tokenKey,
  validate: { keyGeneratorIpFallback: false },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many uploads, slow down" },
  keyGenerator: tokenKey,
  validate: { keyGeneratorIpFallback: false },
});

const reactionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many reactions, slow down" },
  keyGenerator: tokenKey,
  validate: { keyGeneratorIpFallback: false },
});

const linkPreviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many preview requests, slow down" },
  keyGenerator: tokenKey,
  validate: { keyGeneratorIpFallback: false },
});

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many payment requests, slow down" },
  keyGenerator: tokenKey,
  validate: { keyGeneratorIpFallback: false },
});

// Limits enumeration/scraping of user profiles and search
const userLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many user lookups, slow down" },
  keyGenerator: tokenKey,
  validate: { keyGeneratorIpFallback: false },
});


async function requireUploadAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await getAuthCookie(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const filename = path.basename(req.path);
  const uploadPath = `/api/uploads/${filename}`;

  const isAvatar = await db.execute(sql`SELECT 1 FROM users WHERE avatar_url = ${uploadPath} LIMIT 1`);
  if (isAvatar.length > 0) { next(); return; }

  const isUploader = await db.execute(sql`SELECT 1 FROM file_uploads WHERE filename = ${filename} AND uploader_id = ${user.id}`);
  if (isUploader.length === 0) {
    const hasMessage = await db.execute(sql`
      SELECT 1 FROM messages WHERE attachment_url = ${uploadPath} AND (sender_id = ${user.id} OR recipient_id = ${user.id}) LIMIT 1
    `);
    if (hasMessage.length === 0) {
      const hasRecord = await db.execute(sql`SELECT 1 FROM file_uploads WHERE filename = ${filename}`);
      if (hasRecord.length > 0) { res.status(403).json({ error: "Access denied" }); return; }
    }
  }

  next();
}

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", userLookupLimiter, usersRouter);
router.use("/messages", messageSendLimiter, messagesRouter);
router.use("/reactions", reactionLimiter, reactionsRouter);
router.use(linkPreviewLimiter, linkPreviewRouter);
router.use("/upload", uploadLimiter, uploadRouter);
router.use("/uploads", requireUploadAuth, express.static(UPLOAD_DIR, {
  setHeaders(res, filePath) {
    const mimeType = mime.lookup(filePath) || "application/octet-stream";
    if (!INLINE_SAFE_TYPES.has(mimeType)) {
      res.setHeader("Content-Disposition", "attachment");
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
  },
}));
router.use("/moderation", moderationRouter);
router.use("/payments/arc", paymentLimiter, express.json({ limit: "64kb" }), arcPaymentsRouter);
router.use("/contacts", contactsRouter);
router.use("/rpc-proxy", rpcProxyRouter);

export default router;
