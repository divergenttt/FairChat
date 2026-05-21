import { pgTable, text, integer, primaryKey } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique("users_username_key"),
  display_name: text("display_name").notNull(),
  password_hash: text("password_hash").notNull(),
  public_key: text("public_key").notNull(),
  last_seen: text("last_seen"),
  avatar_url: text("avatar_url"),
  bio: text("bio"),
  wallet_address: text("wallet_address"),
  tokens_invalid_before: text("tokens_invalid_before"),
  created_at: text("created_at").notNull(),
});

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  sender_id: text("sender_id").notNull().references(() => users.id),
  recipient_id: text("recipient_id").notNull().references(() => users.id),
  encrypted_content: text("encrypted_content").notNull(),
  reply_to_id: text("reply_to_id"),
  edited_at: text("edited_at"),
  is_read: integer("is_read").notNull().default(0),
  created_at: text("created_at").notNull(),
  attachment_url: text("attachment_url"),
  attachment_name: text("attachment_name"),
  attachment_type: text("attachment_type"),
  attachment_size: integer("attachment_size"),
  destroy_after: integer("destroy_after"),
  destroy_at: text("destroy_at"),
  message_type: text("message_type").default("text"),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique("sessions_token_key"),
  expires_at: text("expires_at").notNull(),
  created_at: text("created_at").notNull(),
});

export const pinned_messages = pgTable("pinned_messages", {
  chat_key: text("chat_key").primaryKey(),
  message_id: text("message_id"),
  pinned_by: text("pinned_by").notNull(),
  pinned_at: text("pinned_at").notNull(),
});

export const reactions = pgTable("reactions", {
  message_id: text("message_id").notNull(),
  user_id: text("user_id").notNull(),
  emoji: text("emoji").notNull(),
  created_at: text("created_at").notNull(),
}, (table) => ({
  pk: primaryKey({ name: "reactions_pkey", columns: [table.message_id, table.user_id, table.emoji] }),
}));

export const revoked_tokens = pgTable("revoked_tokens", {
  jti: text("jti").primaryKey(),
  revoked_at: text("revoked_at").notNull(),
});

export const user_blocks = pgTable("user_blocks", {
  blocker_id: text("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  blocked_id: text("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  created_at: text("created_at").notNull(),
}, (table) => ({
  pk: primaryKey({ name: "user_blocks_pkey", columns: [table.blocker_id, table.blocked_id] }),
}));

export const user_mutes = pgTable("user_mutes", {
  muter_id: text("muter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  muted_id: text("muted_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  created_at: text("created_at").notNull(),
}, (table) => ({
  pk: primaryKey({ name: "user_mutes_pkey", columns: [table.muter_id, table.muted_id] }),
}));

export const user_contacts = pgTable("user_contacts", {
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contact_id: text("contact_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  created_at: text("created_at").notNull(),
}, (table) => ({
  pk: primaryKey({ name: "user_contacts_pkey", columns: [table.user_id, table.contact_id] }),
}));

export const file_uploads = pgTable("file_uploads", {
  filename: text("filename").primaryKey(),
  uploader_id: text("uploader_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  uploaded_at: text("uploaded_at").notNull(),
});
