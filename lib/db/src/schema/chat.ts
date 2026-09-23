import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./teammates";
import { userDeviceKeysTable } from "./files";

/** A canonical two-party conversation; message content is stored separately. */
export const conversationsTable = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    participantOneId: text("participant_one_id").notNull().references(() => usersTable.clerkId, { onDelete: "cascade" }),
    participantTwoId: text("participant_two_id").notNull().references(() => usersTable.clerkId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("conversations_distinct_participants", sql`${table.participantOneId} <> ${table.participantTwoId}`),
    check("conversations_canonical_participants", sql`${table.participantOneId} < ${table.participantTwoId}`),
    uniqueIndex("conversations_participants_unique_idx").on(table.participantOneId, table.participantTwoId),
    index("conversations_participant_one_idx").on(table.participantOneId),
    index("conversations_participant_two_idx").on(table.participantTwoId),
  ],
).enableRLS();

/** Ciphertext and locally-wrapped message keys only. No plaintext is persisted. */
export const messagesTable = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
    senderId: text("sender_id").notNull().references(() => usersTable.clerkId, { onDelete: "cascade" }),
    recipientId: text("recipient_id").notNull().references(() => usersTable.clerkId, { onDelete: "cascade" }),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    encryptionAlgorithm: text("encryption_algorithm").notNull().default("AES-256-GCM"),
    senderWrappedMessageKey: text("sender_wrapped_message_key").notNull(),
    senderWrappingIv: text("sender_wrapping_iv").notNull(),
    recipientWrappedMessageKey: text("recipient_wrapped_message_key").notNull(),
    recipientWrappingIv: text("recipient_wrapping_iv").notNull(),
    wrappingAlgorithm: text("wrapping_algorithm").notNull(),
    senderDeviceKeyId: uuid("sender_device_key_id").notNull().references(() => userDeviceKeysTable.id),
    recipientDeviceKeyId: uuid("recipient_device_key_id").notNull().references(() => userDeviceKeysTable.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("messages_conversation_created_idx").on(table.conversationId, table.createdAt)],
).enableRLS();

/** One locally-wrapped message key per recipient device. */
export const messageDeviceKeysTable = pgTable(
  "message_device_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").notNull().references(() => messagesTable.id, { onDelete: "cascade" }),
    recipientDeviceKeyId: uuid("recipient_device_key_id").notNull().references(() => userDeviceKeysTable.id),
    wrappedMessageKey: text("wrapped_message_key").notNull(),
    wrappingIv: text("wrapping_iv").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("message_device_keys_unique_idx").on(table.messageId, table.recipientDeviceKeyId),
    index("message_device_keys_recipient_idx").on(table.recipientDeviceKeyId),
  ],
).enableRLS();
