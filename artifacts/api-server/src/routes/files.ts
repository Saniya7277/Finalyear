import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import {
  db,
  usersTable,
  teammatesTable,
  filesTable,
  fileSharesTable,
  type ScanVerdict,
  type SharePermission,
} from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { requireAuth, getClerkId } from "../middlewares/auth";
import { scanFile } from "../lib/spamScanner";
import { encryptToBlob, decryptBlob, isEncryptionConfigured } from "../lib/encryption";
import {
  buildObjectPath,
  uploadEncryptedObject,
  downloadEncryptedObject,
  deleteEncryptedObject,
  isStorageConfigured,
} from "../lib/supabaseStorage";
import { logger } from "../lib/logger";

const router = Router();

router.use(requireAuth);

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Files are held in memory only long enough to scan and encrypt them. The
// plaintext never touches disk and never leaves this process unencrypted.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

/**
 * Multer reports failures through `next(err)`, which would otherwise bypass the
 * route handler and fall through to Express' HTML error page. Translate them
 * into the same JSON shape the rest of the API returns.
 */
function acceptUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? `File is too large. The limit is ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`
          : `Upload failed: ${err.message}`;
      res.status(400).json({ error: message });
      return;
    }

    next(err);
  });
}

/** Map a MIME type onto the file kinds the app knows how to render. */
function resolveFileKind(mimeType: string, fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (mimeType.startsWith("image/")) return "image";
  if (ext === "doc" || ext === "docx" || mimeType.includes("wordprocessingml"))
    return "docx";
  if (ext === "ppt" || ext === "pptx" || mimeType.includes("presentationml"))
    return "pptx";
  if (
    ext === "xls" ||
    ext === "xlsx" ||
    ext === "csv" ||
    mimeType.includes("spreadsheetml")
  )
    return "xlsx";
  return "txt";
}

/**
 * The shape the mobile app consumes.
 *
 * Never includes `supabasePath` or `iv`: those are internal storage details,
 * and handing them to a client would invite attempts to reach the bucket
 * directly instead of going through this API, which is where authorisation and
 * decryption live.
 */
function toFileResponse(row: {
  id: string;
  ownerClerkId: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  encrypted: boolean;
  malwareScanResult: ScanVerdict | null;
  malwareScanConfidence: number | null;
  createdAt: Date;
}) {
  const mimeType = row.mimeType ?? "application/octet-stream";

  return {
    id: row.id,
    ownerId: row.ownerClerkId,
    name: row.filename,
    mimeType,
    type: resolveFileKind(mimeType, row.filename),
    sizeBytes: row.sizeBytes ?? 0,
    encrypted: row.encrypted,
    encryptionAlgorithm: "aes-256-gcm",
    scan: {
      verdict: row.malwareScanResult,
      // Stored as 0.0-1.0; the app displays 0-100.
      riskScore: Math.round((row.malwareScanConfidence ?? 0) * 100),
    },
    createdAt: row.createdAt,
    modifiedAt: row.createdAt,
  };
}

const fileColumns = {
  id: filesTable.id,
  ownerClerkId: filesTable.ownerClerkId,
  filename: filesTable.filename,
  mimeType: filesTable.mimeType,
  sizeBytes: filesTable.sizeBytes,
  encrypted: filesTable.encrypted,
  malwareScanResult: filesTable.malwareScanResult,
  malwareScanConfidence: filesTable.malwareScanConfidence,
  createdAt: filesTable.createdAt,
};

/**
 * Express 5 types route params as `string | string[]` (a param can repeat).
 * A file id is always singular, so collapse it to one value.
 */
function paramId(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/** Look up the caller's user row; every file operation is scoped to it. */
async function requireUserRow(clerkId: string) {
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId))
    .limit(1);
  return rows[0] ?? null;
}

/** Keep only the ids that are actually accepted teammates of the caller. */
async function filterToTeammates(
  clerkId: string,
  candidateIds: string[],
): Promise<string[]> {
  if (candidateIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({ teammateUserId: teammatesTable.teammateUserId })
    .from(teammatesTable)
    .where(
      and(
        eq(teammatesTable.userId, clerkId),
        inArray(teammatesTable.teammateUserId, candidateIds),
      ),
    );

  return rows.map((row) => row.teammateUserId);
}

/**
 * POST /api/files/share
 *
 * The secure share pipeline, in strict order:
 *   1. Accept the picked file into server memory
 *   2. AI layer scans the plaintext for spam / phishing / malware
 *   3. Only on a clean verdict, encrypt with AES-256-GCM
 *   4. Only after encryption, upload the ciphertext to Supabase Storage
 *   5. Only after the upload, insert the metadata row
 *   6. Record the share rows for the selected teammates
 *
 * A flagged file is never encrypted, never uploaded, and never recorded - it is
 * rejected with the scan verdict so the app can explain why.
 *
 * The scan needs plaintext, which is why it runs before encryption and why it
 * runs here rather than anywhere Supabase can observe. Supabase only ever
 * receives step 4's output.
 *
 * Multipart fields: `file` (required), `shareWith` (optional JSON array of
 * teammate Clerk ids), `permission` (optional "viewer" | "editor").
 */
router.post(
  "/share",
  acceptUpload,
  async (req: Request, res: Response): Promise<void> => {
    // Tracked so a failure after the upload can remove the orphaned ciphertext.
    let uploadedPath: string | null = null;

    try {
      const clerkId = getClerkId(req);
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: "No file was uploaded." });
        return;
      }

      if (file.size === 0) {
        res.status(400).json({ error: "The selected file is empty." });
        return;
      }

      const user = await requireUserRow(clerkId);
      if (!user) {
        res.status(404).json({
          error: "User profile not found. Sign out and back in to sync it.",
        });
        return;
      }

      // Fail before spending a scan if the file could not be protected anyway.
      // Refusing here is the point: without a key there is no path that stores
      // a readable file.
      if (!isEncryptionConfigured()) {
        res.status(503).json({
          error:
            "File encryption is not configured on the server. Set FILE_ENCRYPTION_KEY (openssl rand -hex 32).",
        });
        return;
      }

      if (!isStorageConfigured()) {
        res.status(503).json({
          error:
            "Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        });
        return;
      }

      const fileName = file.originalname || "untitled";
      const mimeType = file.mimetype || "application/octet-stream";

      // --- Step 1: AI scan (needs plaintext, so it must run first) ----------
      const scan = await scanFile({
        fileName,
        mimeType,
        buffer: file.buffer,
      });

      if (scan.verdict === "flagged") {
        // Nothing is encrypted, uploaded, or recorded. The reason is returned
        // to the user but deliberately not persisted - it can quote file
        // content, and that content is exactly what must not reach the database.
        logger.warn(
          { riskScore: scan.riskScore, labels: scan.labels },
          "Upload blocked by AI scan",
        );

        res.status(422).json({
          error: "This file was blocked by the security scan.",
          scan: {
            verdict: scan.verdict,
            riskScore: scan.riskScore,
            reason: scan.reason,
            labels: scan.labels,
            engine: scan.engine,
            aiAvailable: scan.aiAvailable,
          },
        });
        return;
      }

      // --- Step 2: encrypt (only reached on a green signal) -----------------
      const { blob, iv } = encryptToBlob(file.buffer);

      // --- Step 3: upload ciphertext ----------------------------------------
      const objectPath = buildObjectPath(clerkId);
      await uploadEncryptedObject(objectPath, blob);
      uploadedPath = objectPath;

      // --- Step 4: record the metadata --------------------------------------
      const [stored] = await db
        .insert(filesTable)
        .values({
          ownerClerkId: clerkId,
          filename: fileName,
          mimeType,
          sizeBytes: file.size,
          supabasePath: objectPath,
          iv,
          encrypted: true,
          malwareScanResult: scan.verdict,
          malwareScanConfidence: scan.riskScore / 100,
        })
        .returning(fileColumns);

      // The row now owns the object; no rollback needed past this point.
      uploadedPath = null;

      // --- Step 5: share with the selected teammates ------------------------
      let requestedIds: string[] = [];
      const rawShareWith = req.body?.shareWith;
      if (typeof rawShareWith === "string" && rawShareWith.trim()) {
        try {
          const parsed = JSON.parse(rawShareWith);
          if (Array.isArray(parsed)) {
            requestedIds = parsed.filter(
              (value): value is string => typeof value === "string",
            );
          }
        } catch {
          // A malformed shareWith should not undo a successful upload.
          logger.warn("Ignoring malformed shareWith field");
        }
      }

      const permission: SharePermission =
        req.body?.permission === "editor" ? "editor" : "viewer";

      const recipientIds = await filterToTeammates(clerkId, requestedIds);

      if (recipientIds.length > 0) {
        await db
          .insert(fileSharesTable)
          .values(
            recipientIds.map((recipientId) => ({
              fileId: stored.id,
              sharedWithUserId: recipientId,
              sharedByUserId: clerkId,
              permission,
            })),
          )
          .onConflictDoNothing();
      }

      res.status(201).json({
        success: true,
        file: toFileResponse(stored),
        scan: {
          verdict: scan.verdict,
          riskScore: scan.riskScore,
          reason: scan.reason,
          labels: scan.labels,
          engine: scan.engine,
          aiAvailable: scan.aiAvailable,
        },
        sharedWith: recipientIds,
        ignoredRecipients: requestedIds.filter(
          (id) => !recipientIds.includes(id),
        ),
      });
      return;
    } catch (error) {
      // An upload that never got its row would leave ciphertext nobody can
      // account for. Remove it.
      if (uploadedPath) {
        await deleteEncryptedObject(uploadedPath).catch((cleanupError) => {
          logger.error(
            { err: cleanupError, path: uploadedPath },
            "Failed to clean up orphaned encrypted object",
          );
        });
      }

      logger.error({ err: error }, "Secure share failed");
      res.status(500).json({ error: "Failed to store the file securely." });
      return;
    }
  },
);

/**
 * GET /api/files
 * Files the caller owns plus files teammates shared with them.
 */
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkId = getClerkId(req);

    const owned = await db
      .select(fileColumns)
      .from(filesTable)
      .where(eq(filesTable.ownerClerkId, clerkId))
      .orderBy(desc(filesTable.createdAt));

    const sharedWithMe = await db
      .select(fileColumns)
      .from(fileSharesTable)
      .innerJoin(filesTable, eq(filesTable.id, fileSharesTable.fileId))
      .where(eq(fileSharesTable.sharedWithUserId, clerkId))
      .orderBy(desc(filesTable.createdAt));

    res.json({
      owned: owned.map(toFileResponse),
      sharedWithMe: sharedWithMe.map(toFileResponse),
    });
    return;
  } catch (error) {
    logger.error({ err: error }, "Failed to list files");
    res.status(500).json({ error: "Failed to list files." });
    return;
  }
});

/** Resolve a file the caller is allowed to see, or null. */
async function findAccessibleFile(fileId: string, clerkId: string) {
  const rows = await db
    .select()
    .from(filesTable)
    .where(eq(filesTable.id, fileId))
    .limit(1);

  const file = rows[0];
  if (!file) {
    return { file: null, isOwner: false };
  }

  if (file.ownerClerkId === clerkId) {
    return { file, isOwner: true };
  }

  const share = await db
    .select()
    .from(fileSharesTable)
    .where(
      and(
        eq(fileSharesTable.fileId, fileId),
        eq(fileSharesTable.sharedWithUserId, clerkId),
      ),
    )
    .limit(1);

  return { file: share.length > 0 ? file : null, isOwner: false };
}

/**
 * GET /api/files/:id
 * Metadata plus the recipient list. No content, no storage path.
 */
router.get("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkId = getClerkId(req);
    const { file, isOwner } = await findAccessibleFile(paramId(req), clerkId);

    if (!file) {
      res.status(404).json({ error: "File not found." });
      return;
    }

    const shares = await db
      .select({
        clerkId: usersTable.clerkId,
        name: usersTable.name,
        email: usersTable.email,
        permission: fileSharesTable.permission,
        createdAt: fileSharesTable.createdAt,
      })
      .from(fileSharesTable)
      .innerJoin(
        usersTable,
        eq(usersTable.clerkId, fileSharesTable.sharedWithUserId),
      )
      .where(eq(fileSharesTable.fileId, file.id));

    res.json({
      file: toFileResponse(file),
      isOwner,
      sharedWith: shares,
    });
    return;
  } catch (error) {
    logger.error({ err: error }, "Failed to load file");
    res.status(500).json({ error: "Failed to load the file." });
    return;
  }
});

/**
 * GET /api/files/:id/content
 *
 * Fetch the ciphertext from Storage and decrypt it here, in the API. This is
 * the only place a file exists as plaintext again, and it happens after the
 * caller's access has been checked. No signed Storage URL is ever issued, so
 * there is no path by which a client reads the bucket directly.
 *
 * GCM authenticates as it decrypts: a modified object fails rather than
 * returning corrupted bytes.
 */
router.get(
  "/:id/content",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const clerkId = getClerkId(req);
      const { file } = await findAccessibleFile(paramId(req), clerkId);

      if (!file) {
        res.status(404).json({ error: "File not found." });
        return;
      }

      let cipherBlob: Buffer;
      try {
        cipherBlob = await downloadEncryptedObject(file.supabasePath);
      } catch (error) {
        logger.error(
          { err: error, fileId: file.id },
          "Failed to fetch encrypted object from Storage",
        );
        res.status(502).json({ error: "Could not retrieve the stored file." });
        return;
      }

      let plainText: Buffer;
      try {
        plainText = decryptBlob(cipherBlob, file.iv);
      } catch (error) {
        logger.error({ err: error, fileId: file.id }, "Decryption failed");
        res.status(500).json({
          error:
            "This file could not be decrypted. It may have been tampered with, or the encryption key changed.",
        });
        return;
      }

      res.setHeader(
        "Content-Type",
        file.mimeType ?? "application/octet-stream",
      );
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(file.filename)}"`,
      );
      res.send(plainText);
      return;
    } catch (error) {
      logger.error({ err: error }, "Failed to read file content");
      res.status(500).json({ error: "Failed to read the file." });
      return;
    }
  },
);

/**
 * POST /api/files/:id/share
 * Share an already-stored file with more teammates.
 */
router.post("/:id/share", async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkId = getClerkId(req);
    const rows = await db
      .select()
      .from(filesTable)
      .where(
        and(
          eq(filesTable.id, paramId(req)),
          eq(filesTable.ownerClerkId, clerkId),
        ),
      )
      .limit(1);

    if (!rows.length) {
      res.status(404).json({ error: "File not found." });
      return;
    }

    const { teammateIds } = req.body ?? {};
    const permission: SharePermission =
      req.body?.permission === "editor" ? "editor" : "viewer";

    if (!Array.isArray(teammateIds) || teammateIds.length === 0) {
      res.status(400).json({ error: "teammateIds must be a non-empty array." });
      return;
    }

    const recipientIds = await filterToTeammates(
      clerkId,
      teammateIds.filter((id: unknown): id is string => typeof id === "string"),
    );

    if (recipientIds.length === 0) {
      res.status(400).json({
        error: "None of the selected people are your teammates yet.",
      });
      return;
    }

    await db
      .insert(fileSharesTable)
      .values(
        recipientIds.map((recipientId) => ({
          fileId: rows[0].id,
          sharedWithUserId: recipientId,
          sharedByUserId: clerkId,
          permission,
        })),
      )
      .onConflictDoNothing();

    res.json({ success: true, sharedWith: recipientIds });
    return;
  } catch (error) {
    logger.error({ err: error }, "Failed to share file");
    res.status(500).json({ error: "Failed to share the file." });
    return;
  }
});

/**
 * DELETE /api/files/:id
 * Owner only. Removes the ciphertext from Storage as well as the row, so a
 * deleted file leaves nothing behind in Supabase. Share rows cascade.
 */
router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkId = getClerkId(req);

    const deleted = await db
      .delete(filesTable)
      .where(
        and(
          eq(filesTable.id, paramId(req)),
          eq(filesTable.ownerClerkId, clerkId),
        ),
      )
      .returning({
        id: filesTable.id,
        supabasePath: filesTable.supabasePath,
      });

    if (!deleted.length) {
      res.status(404).json({ error: "File not found." });
      return;
    }

    try {
      await deleteEncryptedObject(deleted[0].supabasePath);
    } catch (error) {
      // The row is already gone, so the object is now unreachable and
      // undecryptable regardless. Surface it for cleanup rather than failing
      // the user's delete.
      logger.error(
        { err: error, path: deleted[0].supabasePath },
        "Row deleted but Storage object remains",
      );
    }

    res.json({ success: true, id: deleted[0].id });
    return;
  } catch (error) {
    logger.error({ err: error }, "Failed to delete file");
    res.status(500).json({ error: "Failed to delete the file." });
    return;
  }
});

export default router;
