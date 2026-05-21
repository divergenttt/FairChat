import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { fileTypeFromBuffer } from "file-type";
import { createStorageAdapter } from "../lib/storage.js";
import { db, sql, DATA_DIR } from "../db.js";
import { getAuth } from "../lib/authCookie.js";

const router: IRouter = Router();

export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const fileStorage = createStorageAdapter(UPLOAD_DIR);

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/heic", "image/heif",
  "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/aac", "audio/flac",
  "video/mp4", "video/webm", "video/ogg", "video/quicktime",
  "application/pdf",
  "text/plain",
  "application/zip", "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/octet-stream",
]);

export const INLINE_SAFE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"]);

const MAX_MB = parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? "10", 10);
const maxUploadBytes =
  Number.isNaN(MAX_MB) || MAX_MB <= 0 ? 10 * 1024 * 1024 : MAX_MB * 1024 * 1024;

const MAGIC_BYTES_EXEMPT = new Set(["text/plain"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxUploadBytes },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error(`File type not allowed: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

function buildFilename(originalname: string): string {
  const ext = path.extname(originalname).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return `${uuidv4()}${ext}`;
}

async function validateUploadedBuffer(
  buffer: Buffer,
  declaredMime: string,
): Promise<{ ok: true; mime: string } | { ok: false; error: string }> {
  if (MAGIC_BYTES_EXEMPT.has(declaredMime)) {
    if (!ALLOWED_MIME_TYPES.has(declaredMime)) {
      return { ok: false, error: "Invalid file type" };
    }
    return { ok: true, mime: declaredMime };
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    return { ok: false, error: "Invalid file type" };
  }
  return { ok: true, mime: detected.mime };
}

const E1F_MAGIC = Buffer.from("e1f:");

function isE2EEncryptedUpload(buffer: Buffer, flaggedEncrypted: boolean): boolean {
  if (flaggedEncrypted) return true;
  return buffer.length >= E1F_MAGIC.length && buffer.subarray(0, E1F_MAGIC.length).equals(E1F_MAGIC);
}

router.post("/", upload.single("file"), async (req: Request, res: Response) => {
  const user = await getAuth(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filename = buildFilename(req.file.originalname);
  const flaggedEncrypted =
    req.body?.encrypted === "1" ||
    req.body?.encrypted === true ||
    String(req.headers["x-fairchat-encrypted"] ?? "") === "1";

  try {
    const e2eFile = isE2EEncryptedUpload(req.file.buffer, flaggedEncrypted);
    const validation = e2eFile
      ? ({ ok: true as const, mime: "application/octet-stream" })
      : await validateUploadedBuffer(req.file.buffer, req.file.mimetype);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    let url: string;
    try {
      url = await fileStorage.save(filename, req.file.buffer, validation.mime);
    } catch (e) {
      await fileStorage.delete(filename).catch(() => {});
      const message = e instanceof Error ? e.message : "Storage error";
      return res.status(500).json({ error: message });
    }

    const now = new Date().toISOString();
    await db.execute(sql`
      INSERT INTO file_uploads (filename, uploader_id, uploaded_at)
      VALUES (${filename}, ${user.id}, ${now})
      ON CONFLICT (filename) DO NOTHING
    `);

    return res.json({
      url,
      name: req.file.originalname,
      type: validation.mime,
      size: req.file.size,
    });
  } catch {
    return res.status(400).json({ error: "Unable to verify file type" });
  }
});

export default router;
