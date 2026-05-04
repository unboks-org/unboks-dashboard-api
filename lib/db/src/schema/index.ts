import { pgTable, text, boolean, timestamp, uuid } from "drizzle-orm/pg-core";

export const conversationsTable = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientSlug: text("client_slug").notNull(),
  externalId: text("external_id").notNull(),
  platform: text("platform").notNull().default("unknown"),
  contactId: text("contact_id"),
  contactName: text("contact_name"),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  unread: boolean("unread").notNull().default(true),
  escalated: boolean("escalated").notNull().default(false),
  escalationResolved: boolean("escalation_resolved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messagesTable = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id").notNull(),
  externalId: text("external_id"),
  role: text("role").notNull().default("user"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Conversation = typeof conversationsTable.$inferSelect;
export type NewConversation = typeof conversationsTable.$inferInsert;
export type Message = typeof messagesTable.$inferSelect;
export type NewMessage = typeof messagesTable.$inferInsert;
