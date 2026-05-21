import postgres from "postgres";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { verifyToken } from "./jwt.js";
import { logger } from "./lib/logger.js";
import * as schema from "./schema.js";

const ALLOWED_TABLES = new Set([
  "users",
  "messages",
  "sessions",
  "reactions",
  "pinned_messages",
  "revoked_tokens",
  "user_blocks",
  "user_mutes",
  "user_contacts",
  "file_uploads",
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR ?? path.resolve(__dirname, "../data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const queryClient = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 30,
});

export const db = drizzle(queryClient, { schema });
export { sql };

// ── Schema init ───────────────────────────────────────────────────────────────

async function initDb(): Promise<void> {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      public_key TEXT NOT NULL,
      last_seen TEXT,
      avatar_url TEXT,
      bio TEXT,
      wallet_address TEXT,
      created_at TEXT NOT NULL
    )
  `));

  // Migration: add recovery_hash column for accounts that have it set
  await db.execute(sql.raw(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_hash TEXT
  `));

  // Migration: add tokens_invalid_before — invalidates all JWTs issued before this timestamp
  await db.execute(sql.raw(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_invalid_before TEXT
  `));

  // Migration: add message_type column for payment notifications
  await db.execute(sql.raw(`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text'
  `));

  // Migration: add delivery_status column for message delivery tracking
  await db.execute(sql.raw(`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'sent'
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL REFERENCES users(id),
      recipient_id TEXT NOT NULL REFERENCES users(id),
      encrypted_content TEXT NOT NULL,
      reply_to_id TEXT,
      edited_at TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      attachment_url TEXT,
      attachment_name TEXT,
      attachment_type TEXT,
      attachment_size INTEGER,
      destroy_after INTEGER,
      destroy_at TEXT
    )
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS pinned_messages (
      chat_key TEXT PRIMARY KEY,
      message_id TEXT,
      pinned_by TEXT NOT NULL,
      pinned_at TEXT NOT NULL
    )
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS reactions (
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (message_id, user_id, emoji)
    )
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti TEXT PRIMARY KEY,
      revoked_at TEXT NOT NULL
    )
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS user_blocks (
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id)
    )
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS user_mutes (
      muter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      muted_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (muter_id, muted_id)
    )
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS user_contacts (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, contact_id)
    )
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS file_uploads (
      filename TEXT PRIMARY KEY,
      uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      uploaded_at TEXT NOT NULL
    )
  `));

  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id)`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_reactions_msg ON reactions(message_id)`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(sender_id, recipient_id, created_at DESC)`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(recipient_id, is_read) WHERE is_read = 0`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_contacts_user ON user_contacts(user_id)`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`));

  await migrateFkCascadeRules();

  await cleanOrphanedData();

  await fixUuidColumns();

  await seedDemoData();
}

async function migrateFkCascadeRules(): Promise<void> {
  const fkRules = await db.execute(sql.raw(`
    SELECT tc.constraint_name, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      AND tc.constraint_name IN (
        'sessions_user_id_users_id_fk',
        'messages_sender_id_users_id_fk',
        'messages_recipient_id_users_id_fk'
      )
  `));

  const ruleMap = new Map((fkRules as any[]).map((r) => [r.constraint_name, r.delete_rule]));

  if (ruleMap.get("sessions_user_id_users_id_fk") !== "CASCADE") {
    await db.execute(sql.raw(`ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_user_id_users_id_fk`));
    await db.execute(sql.raw(`ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`));
  }

  if (ruleMap.get("messages_sender_id_users_id_fk") !== "SET NULL") {
    await db.execute(sql.raw(`ALTER TABLE messages ALTER COLUMN sender_id DROP NOT NULL`));
    await db.execute(sql.raw(`ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_users_id_fk`));
    await db.execute(sql.raw(`ALTER TABLE messages ADD CONSTRAINT messages_sender_id_users_id_fk FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL`));
  }

  if (ruleMap.get("messages_recipient_id_users_id_fk") !== "SET NULL") {
    await db.execute(sql.raw(`ALTER TABLE messages ALTER COLUMN recipient_id DROP NOT NULL`));
    await db.execute(sql.raw(`ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_recipient_id_users_id_fk`));
    await db.execute(sql.raw(`ALTER TABLE messages ADD CONSTRAINT messages_recipient_id_users_id_fk FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE SET NULL`));
  }
}

async function cleanOrphanedData(): Promise<void> {
  const orphanedMessages = await db.execute(sql.raw(`
    SELECT m.id FROM messages m
    LEFT JOIN users s ON m.sender_id = s.id
    LEFT JOIN users r ON m.recipient_id = r.id
    WHERE s.id IS NULL OR r.id IS NULL
  `));
  if (orphanedMessages.length > 0) {
    const ids = orphanedMessages.map((r: any) => `'${r.id}'`).join(",");
    await db.execute(sql.raw(`DELETE FROM messages WHERE id IN (${ids})`));
    console.log(`Cleaned ${orphanedMessages.length} orphaned message(s)`);
  }

  const orphanedSessions = await db.execute(sql.raw(`
    SELECT s.id FROM sessions s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE u.id IS NULL
  `));
  if (orphanedSessions.length > 0) {
    const ids = orphanedSessions.map((r: any) => `'${r.id}'`).join(",");
    await db.execute(sql.raw(`DELETE FROM sessions WHERE id IN (${ids})`));
    console.log(`Cleaned ${orphanedSessions.length} orphaned session(s)`);
  }

  const orphanedReactions = await db.execute(sql.raw(`
    SELECT COUNT(*) AS cnt FROM reactions r
    LEFT JOIN messages m ON r.message_id = m.id
    WHERE m.id IS NULL
  `));
  const orphanReactionCount = Number((orphanedReactions[0] as any)?.cnt ?? 0);
  if (orphanReactionCount > 0) {
    await db.execute(sql.raw(`
      DELETE FROM reactions WHERE message_id NOT IN (SELECT id FROM messages)
    `));
    console.log(`Cleaned ${orphanReactionCount} orphaned reaction(s)`);
  }
}

// ── UUID → TEXT migration (safe, idempotent) ──────────────────────────────────
// In production the DB may have been created with uuid type for ID columns.
// PostgreSQL can't ALTER a column type when a FK constraint references it,
// so we drop FKs, cast with USING, then re-add them.
async function fixUuidColumns(): Promise<void> {
  // Find all columns that are still stored as uuid type
  const uuidCols = await db.execute(sql.raw(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND udt_name = 'uuid'
  `));
  if (!uuidCols || uuidCols.length === 0) return;

  // Drop all FK constraints that reference uuid columns, alter, re-add
  for (const row of (uuidCols as unknown) as Array<{ table_name: string; column_name: string }>) {
    const { table_name, column_name } = row;

    if (!ALLOWED_TABLES.has(table_name)) {
      logger.warn({ table_name }, "Skipping unknown table in fixUuidColumns");
      continue;
    }

    // Find FK constraints on this column
    const fks = await db.execute(sql.raw(`
      SELECT tc.constraint_name, tc.table_name AS fk_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND kcu.column_name = '${column_name}'
        AND kcu.table_name = '${table_name}'
    `));

    // Also find FK constraints referencing this table's column FROM other tables
    const refFks = await db.execute(sql.raw(`
      SELECT tc.constraint_name, tc.table_name AS fk_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
      JOIN information_schema.key_column_usage kcu2
        ON kcu2.constraint_name = rc.unique_constraint_name
        AND kcu2.column_name = '${column_name}'
        AND kcu2.table_name = '${table_name}'
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    `));

    const allFks = [
      ...((fks as unknown) as Array<{ constraint_name: string; fk_table: string }>),
      ...((refFks as unknown) as Array<{ constraint_name: string; fk_table: string }>),
    ];

    // Drop FK constraints
    for (const fk of allFks) {
      if (!ALLOWED_TABLES.has(fk.fk_table)) {
        logger.warn({ table_name: fk.fk_table }, "Skipping unknown table in fixUuidColumns");
        continue;
      }
      try {
        await db.execute(sql.raw(`ALTER TABLE "${fk.fk_table}" DROP CONSTRAINT IF EXISTS "${fk.constraint_name}"`));
      } catch { /* ignore */ }
    }

    // Alter column to text
    try {
      await db.execute(sql.raw(`ALTER TABLE "${table_name}" ALTER COLUMN "${column_name}" SET DATA TYPE text USING "${column_name}"::text`));
    } catch { /* already text or other issue */ }

    // Re-add FK constraints from schema
    // (initDb already used CREATE TABLE IF NOT EXISTS with correct TEXT FKs,
    //  so we just need to restore the dropped ones if they belong to our tables)
    for (const fk of allFks) {
      if (!ALLOWED_TABLES.has(fk.fk_table)) {
        logger.warn({ table_name: fk.fk_table }, "Skipping unknown table in fixUuidColumns");
        continue;
      }
      try {
        await db.execute(sql.raw(`
          ALTER TABLE "${fk.fk_table}" ADD CONSTRAINT "${fk.constraint_name}"
          FOREIGN KEY ("${column_name}") REFERENCES "${table_name}"("id")
        `));
      } catch { /* constraint may already exist or have different definition */ }
    }
  }
}

export { initDb };

// ── Types ─────────────────────────────────────────────────────────────────────

export type User = {
  id: string; username: string; display_name: string;
  password_hash: string; public_key: string; created_at: string;
  last_seen?: string | null; avatar_url?: string | null;
  bio?: string | null; wallet_address?: string | null;
};

export type Message = {
  id: string; sender_id: string; recipient_id: string;
  encrypted_content: string; reply_to_id: string | null;
  edited_at: string | null; is_read: number; created_at: string;
  attachment_url: string | null; attachment_name: string | null;
  attachment_type: string | null; attachment_size: number | null;
  destroy_after: number | null; destroy_at: string | null;
  message_type: string | null;
  delivery_status: string;
};

export type Session = {
  id: string; user_id: string; token: string;
  expires_at: string; created_at: string;
};

// ── Seed ──────────────────────────────────────────────────────────────────────

async function seedDemoData() {
  const { default: bcrypt } = await import("bcrypt");
  const { v4: uuidv4 } = await import("uuid");

  const now = new Date().toISOString();

  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) return;

  const demoUsers = [
    { username: "admin", displayName: "Admin", password: adminPassword },
  ];

  let adminId: string | undefined;

  for (const demo of demoUsers) {
    const existing = await db.execute(sql`SELECT id FROM users WHERE username = ${demo.username}`);
    if (existing.length === 0) {
      const passwordHash = await bcrypt.hash(demo.password, 10);
      const userId = uuidv4();
      await db.execute(sql`
        INSERT INTO users (id, username, display_name, password_hash, public_key, created_at)
        VALUES (${userId}, ${demo.username}, ${demo.displayName}, ${passwordHash}, ${"DEMO_PUBLIC_KEY"}, ${now})
      `);
      if (demo.username === "admin") adminId = userId;
    } else {
      if (demo.username === "admin") adminId = existing[0].id as string;
    }
  }

  void adminId;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function getUserByToken(token: string): Promise<User | null> {
  const payload = verifyToken(token);
  if (payload) {
    const jti = `${payload.userId}:${payload.iat}`;
    const revoked = await db.execute(sql`SELECT 1 FROM revoked_tokens WHERE jti = ${jti}`);
    if (revoked.length > 0) return null;
    const users = await db.execute(sql`SELECT * FROM users WHERE id = ${payload.userId}`);
    const user = (users[0] as User & { tokens_invalid_before?: string | null }) ?? null;
    if (!user) return null;
    // Reject JWTs issued before the user's tokens_invalid_before cutoff
    // (set when password is changed/reset to invalidate all prior sessions)
    if (user.tokens_invalid_before && payload.iat) {
      const cutoffMs = new Date(user.tokens_invalid_before).getTime();
      const issuedMs = payload.iat * 1000;
      if (!Number.isNaN(cutoffMs) && issuedMs < cutoffMs) return null;
    }
    return user;
  }

  const now = new Date().toISOString();
  const sessions = await db.execute(sql`SELECT * FROM sessions WHERE token = ${token} AND expires_at > ${now}`);
  if (sessions.length === 0) return null;
  const session = sessions[0] as Session;
  const users = await db.execute(sql`SELECT * FROM users WHERE id = ${session.user_id}`);
  return (users[0] as User) ?? null;
}

export async function revokeToken(token: string): Promise<void> {
  const payload = verifyToken(token);
  if (payload) {
    const jti = `${payload.userId}:${payload.iat}`;
    await db.execute(sql`INSERT INTO revoked_tokens (jti, revoked_at) VALUES (${jti}, ${new Date().toISOString()}) ON CONFLICT (jti) DO NOTHING`);
  } else {
    await db.execute(sql`DELETE FROM sessions WHERE token = ${token}`);
  }
}

export function chatKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}
