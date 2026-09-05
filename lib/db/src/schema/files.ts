import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  real,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./teammates";

export type ScanVerdict = "clean" | "flagged";
export type SharePermission = "viewer" | "editor";

/**
 * Files - metadata only. **No file content is ever stored in this table.**
 *
 * The pipeline is: scan -> encrypt -> upload ciphertext -> insert this row.
 * By the time a row exists, the bytes are already AES-256-GCM ciphertext
 * sitting in a private Supabase Storage bucket at `supabasePath`.
 *
 * What Supabase can see:
 *   - this metadata row (filename, mime type, size, owner, scan verdict)
 *   - an opaque encrypted blob in Storage
 *
 * What Supabase can NOT see:
 *   - the plaintext of any file
 *   - the encryption key (FILE_ENCRYPTION_KEY lives only in the API server's
 *     environment and is never written to the database or to Storage)
 *   - the AI scan's written reasoning, which can quote file content and is
 *     therefore deliberately returned to the client but never persisted
 *
 * `iv` is the per-file AES-GCM nonce. It is not secret, but it lives here
 * rather than in Storage so that the blob alone is not self-describing: you
 * need the row, the object, and the key to recover a file.
 */
export const filesTable = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    ownerClerkId: text("owner_clerk_id")
      .notNull()
      .references(() => usersTable.clerkId, { onDelete: "cascade" }),

    filename: text("filename").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),

    /** Object key in the private Storage bucket. Opaque - never derived from the filename. */
    supabasePath: text("supabase_path").notNull(),

    /** Hex-encoded 96-bit AES-GCM nonce, unique per file. */
    iv: text("iv").notNull(),

    encrypted: boolean("encrypted").notNull().default(true),

    /** "clean" | "flagged". Only "clean" files ever get a row. */
    malwareScanResult: text("malware_scan_result").$type<ScanVerdict>(),

    /** 0.0 - 1.0 confidence that the file is malicious. */
    malwareScanConfidence: real("malware_scan_confidence"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("files_owner_idx").on(table.ownerClerkId),
    index("files_created_at_idx").on(table.createdAt),
    uniqueIndex("files_supabase_path_idx").on(table.supabasePath),
  ],
).enableRLS();

/**
 * File shares - which teammates an encrypted file was shared with.
 *
 * Recipients get access to the same ciphertext object; decryption still happens
 * server-side with the key Supabase never sees. Uniqueness stops the same file
 * being shared with the same person twice.
 */
export const fileSharesTable = pgTable(
  "file_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    fileId: uuid("file_id")
      .notNull()
      .references(() => filesTable.id, { onDelete: "cascade" }),

    sharedWithUserId: text("shared_with_user_id")
      .notNull()
      .references(() => usersTable.clerkId, { onDelete: "cascade" }),

    sharedByUserId: text("shared_by_user_id")
      .notNull()
      .references(() => usersTable.clerkId, { onDelete: "cascade" }),

    permission: text("permission")
      .notNull()
      .$type<SharePermission>()
      .default("viewer"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("file_shares_unique_idx").on(
      table.fileId,
      table.sharedWithUserId,
    ),
    index("file_shares_recipient_idx").on(table.sharedWithUserId),
  ],
).enableRLS();

// Zod schemas
export type InsertFile = typeof filesTable.$inferInsert;
export type FileRecord = typeof filesTable.$inferSelect;

export const insertFileShareSchema = createInsertSchema(fileSharesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertFileShare = typeof fileSharesTable.$inferInsert;
export type FileShare = typeof fileSharesTable.$inferSelect;
