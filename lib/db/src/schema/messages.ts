import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id")
    .notNull()
    .references(() => usersTable.id),
  recipientId: integer("recipient_id")
    .notNull()
    .references(() => usersTable.id),
  encryptedContent: text("encrypted_content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Message = typeof messagesTable.$inferSelect;
