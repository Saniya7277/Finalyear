import { Router, Request, Response } from "express";
import {
  db,
  usersTable,
  teammatesTable,
  filesTable,
  fileSharesTable,
  fileShareDeviceKeysTable,
  userDeviceKeysTable,
  type ScanVerdict,
  type SharePermission,
} from "@workspace/db";
import { eq, and, inArray, desc, isNull } from "drizzle-orm";
import { requireAuth, getClerkId } from "../middlewares/auth";
import {
  buildObjectPath,
  createSignedUploadUrl,
  downloadEncryptedObject,
  deleteEncryptedObject,
  isStorageConfigured,
} from "../lib/supabaseStorage";
import { logger } from "../lib/logger";

const router = Router();

router.use(requireAuth);

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

router.post("/upload-url", async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkId = getClerkId(req);
    const filename =
      typeof req.body?.filename === "string" && req.body.filename.trim()
        ? req.body.filename.trim()
        : "untitled";

    const objectPath = buildObjectPath(clerkId);
    const signed = await createSignedUploadUrl(objectPath);

    res.json({
      success: true,
      path: signed.path,
      token: signed.token,
      signedUrl: signed.signedUrl,
      filename,
    });
  } catch (error) {
    logger.error({ err: error }, "Failed to create secure upload URL");
    res.status(500).json({ error: "Failed to prepare secure upload." });
  }
});

router.post(
  "/complete-upload",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const clerkId = getClerkId(req);
      const {
        path: objectPath,
        filename,
        mimeType,
        size,
        iv,
        malwareScanResult,
        malwareScanConfidence,
      } = req.body ?? {};

      if (
        typeof objectPath !== "string" ||
        !objectPath.startsWith(`${clerkId}/`) ||
        typeof filename !== "string" ||
        typeof mimeType !== "string" ||
        !Number.isFinite(Number(size)) ||
        typeof iv !== "string" ||
        !iv
      ) {
        res.status(400).json({ error: "Invalid upload metadata." });
        return;
      }

      if (!isStorageConfigured()) {
        res.status(503).json({ error: "Secure storage is not configured." });
        return;
      }

      await requireUserRow(clerkId);

      const scanVerdict =
        typeof malwareScanResult === "string"
          ? malwareScanResult.trim().toUpperCase()
          : "SAFE";

      if (scanVerdict !== "SAFE") {
        res.status(400).json({ error: "Only clean files can be completed." });
        return;
      }

      const confidence = Number(malwareScanConfidence ?? 0);

      const [stored] = await db
        .insert(filesTable)
        .values({
          ownerClerkId: clerkId,
          filename: filename.trim() || "untitled",
          mimeType: mimeType.trim() || "application/octet-stream",
          sizeBytes: Number(size),
          supabasePath: objectPath,
          iv: iv.toLowerCase(),
          encrypted: true,
          malwareScanResult: "clean",
          malwareScanConfidence: Number.isFinite(confidence) ? confidence : 0,
        })
        .returning(fileColumns);

      res.status(201).json({
        success: true,
        fileId: stored.id,
        file: toFileResponse(stored),
      });
    } catch (error) {
      logger.error({ err: error }, "Failed to complete secure upload");
      res.status(500).json({ error: "Failed to complete secure upload." });
    }
  },
);
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

    const ownedShares = await db
      .select({
        fileId: fileSharesTable.fileId,
        clerkId: usersTable.clerkId,
        name: usersTable.name,
        email: usersTable.email,
        permission: fileSharesTable.permission,
        createdAt: fileSharesTable.createdAt,
      })
      .from(fileSharesTable)
      .innerJoin(usersTable, eq(usersTable.clerkId, fileSharesTable.sharedWithUserId))
      .innerJoin(filesTable, eq(filesTable.id, fileSharesTable.fileId))
      .where(eq(filesTable.ownerClerkId, clerkId));

    const sharedWithMe = await db
      .select({
        ...fileColumns,
        sharedById: usersTable.clerkId,
        sharedByName: usersTable.name,
        sharedByEmail: usersTable.email,
        permission: fileSharesTable.permission,
        sharedAt: fileSharesTable.createdAt,
      })
      .from(fileSharesTable)
      .innerJoin(filesTable, eq(filesTable.id, fileSharesTable.fileId))
      .innerJoin(usersTable, eq(usersTable.clerkId, fileSharesTable.sharedByUserId))
      .where(eq(fileSharesTable.sharedWithUserId, clerkId))
      .orderBy(desc(filesTable.createdAt));

    res.json({
      owned: owned.map((file) => ({
        ...toFileResponse(file),
        shares: ownedShares
          .filter((share) => share.fileId === file.id)
          .map(({ fileId: _fileId, ...share }) => share),
      })),
      sharedWithMe: sharedWithMe.map((file) => ({
        ...toFileResponse(file),
        permission: file.permission,
        sharedAt: file.sharedAt,
        sharedBy: {
          clerkId: file.sharedById,
          name: file.sharedByName,
          email: file.sharedByEmail,
        },
      })),
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

/** GET /api/files/:id/content — authorizes and returns opaque ciphertext only. */
router.get(
  "/:id/key-share",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const clerkId = getClerkId(req);
      const deviceKeyId = typeof req.query.deviceKeyId === "string" ? req.query.deviceKeyId : "";
      if (!deviceKeyId) { res.status(400).json({ error: "A recipient device key is required." }); return; }
      const [requestDevice] = await db.select({ id: userDeviceKeysTable.id }).from(userDeviceKeysTable).where(and(
        eq(userDeviceKeysTable.id, deviceKeyId),
        eq(userDeviceKeysTable.userId, clerkId),
        isNull(userDeviceKeysTable.revokedAt),
      )).limit(1);
      if (!requestDevice) { res.status(403).json({ error: "Recipient device key unavailable on this device." }); return; }
      const [share] = await db.select().from(fileSharesTable).where(and(eq(fileSharesTable.fileId, paramId(req)), eq(fileSharesTable.sharedWithUserId, clerkId))).limit(1);
      if (!share || !share.ownerDeviceKeyId) { res.status(404).json({ error: "No usable secure share was found." }); return; }
      const [deviceWrap] = await db.select().from(fileShareDeviceKeysTable).where(and(eq(fileShareDeviceKeysTable.fileShareId, share.id), eq(fileShareDeviceKeysTable.recipientDeviceKeyId, deviceKeyId))).limit(1);
      const legacyWrap = share.recipientDeviceKeyId === deviceKeyId && share.wrappedFileKey && share.wrappingIv && share.wrappingAlgorithm
        ? { recipientDeviceKeyId: deviceKeyId, wrappedFileKey: share.wrappedFileKey, wrappingIv: share.wrappingIv, wrappingAlgorithm: share.wrappingAlgorithm }
        : null;
      const selectedWrap = deviceWrap ?? legacyWrap;
      if (!selectedWrap) { res.status(404).json({ error: "This share was not encrypted for this device." }); return; }
      const [ownerKey] = await db.select({ publicKey: userDeviceKeysTable.publicKey }).from(userDeviceKeysTable).where(eq(userDeviceKeysTable.id, share.ownerDeviceKeyId)).limit(1);
      if (!ownerKey) { res.status(409).json({ error: "Owner device key is unavailable." }); return; }
      const [file] = await db.select({ iv: filesTable.iv }).from(filesTable).where(eq(filesTable.id, share.fileId)).limit(1);
      if (!file?.iv) { res.status(409).json({ error: "File encryption metadata is unavailable." }); return; }
      res.json({ wrappedFileKey: selectedWrap.wrappedFileKey, wrappingIv: selectedWrap.wrappingIv, wrappingAlgorithm: selectedWrap.wrappingAlgorithm, ownerPublicKey: ownerKey.publicKey, ownerDeviceKeyId: share.ownerDeviceKeyId, recipientDeviceKeyId: selectedWrap.recipientDeviceKeyId, fileIv: file.iv });
    } catch (error) { logger.error({ err: error }, "Failed to load secure share key"); res.status(500).json({ error: "Failed to load secure share key." }); }
  },
);

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

      // The API only authorizes and proxies opaque ciphertext. Decryption is
      // exclusively client-side, using the device-local key material.
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(file.filename)}"`,
      );
      res.send(cipherBlob);
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
router.post(
  "/:id/share",
  async (req: Request, res: Response): Promise<void> => {
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

      const { recipientId, ownerDeviceKeyId, recipientDeviceKeys } = req.body ?? {};
      const permission: SharePermission =
        req.body?.permission === "editor" ? "editor" : "viewer";

      if (typeof recipientId !== "string" || typeof ownerDeviceKeyId !== "string" || !Array.isArray(recipientDeviceKeys) || !recipientDeviceKeys.length) {
        res.status(400).json({ error: "Wrapped-key sharing metadata is required." });
        return;
      }
      const recipientIds = await filterToTeammates(clerkId, [recipientId]);
      if (!recipientIds.length) {
        res.status(403).json({ error: "Recipient is not an authorized teammate." });
        return;
      }
      const [ownerKey] = await db.select().from(userDeviceKeysTable).where(and(eq(userDeviceKeysTable.id, ownerDeviceKeyId), eq(userDeviceKeysTable.userId, clerkId), isNull(userDeviceKeysTable.revokedAt))).limit(1);
      const recipientKeyIds = recipientDeviceKeys.map((key: unknown) => typeof key === "object" && key ? (key as { recipientDeviceKeyId?: unknown }).recipientDeviceKeyId : "");
      if (!recipientKeyIds.every((id: unknown) => typeof id === "string") || new Set(recipientKeyIds).size !== recipientKeyIds.length || !ownerKey) { res.status(409).json({ error: "Valid active device keys are required." }); return; }
      const recipientKeys = await db.select().from(userDeviceKeysTable).where(and(inArray(userDeviceKeysTable.id, recipientKeyIds as string[]), eq(userDeviceKeysTable.userId, recipientId), isNull(userDeviceKeysTable.revokedAt)));
      if (recipientKeys.length !== recipientKeyIds.length || recipientDeviceKeys.some((key: unknown) => { const value = key as Record<string, unknown>; return !value || typeof value.wrappedFileKey !== "string" || typeof value.wrappingIv !== "string" || value.wrappingAlgorithm !== "ECDH-P256/HKDF-SHA256/AES-256-GCM"; })) { res.status(409).json({ error: "Valid active device keys are required." }); return; }

      const [share] = await db
        .insert(fileSharesTable)
        .values(
          [{ fileId: rows[0].id, sharedWithUserId: recipientId,
            sharedByUserId: clerkId,
            permission, ownerDeviceKeyId }],
        )
        .onConflictDoUpdate({ target: [fileSharesTable.fileId, fileSharesTable.sharedWithUserId], set: { ownerDeviceKeyId, permission } })
        .returning({ id: fileSharesTable.id });
      await db.delete(fileShareDeviceKeysTable).where(eq(fileShareDeviceKeysTable.fileShareId, share.id));
      await db.insert(fileShareDeviceKeysTable).values(recipientDeviceKeys.map((key: { recipientDeviceKeyId: string; wrappedFileKey: string; wrappingIv: string; wrappingAlgorithm: string }) => ({ fileShareId: share.id, ...key })));

      res.json({ success: true, sharedWith: recipientIds });
      return;
    } catch (error) {
      logger.error({ err: error }, "Failed to share file");
      res.status(500).json({ error: "Failed to share the file." });
      return;
    }
  },
);

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
