import { Router, type Request, type Response } from "express";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { conversationsTable, db, messageDeviceKeysTable, messagesTable, teammatesTable, userDeviceKeysTable } from "@workspace/db";
import { getClerkId, requireAuth } from "../middlewares/auth";

const router = Router();
router.use(requireAuth);

const routeId = (req: Request) => Array.isArray(req.params.id) ? req.params.id[0] ?? "" : req.params.id ?? "";
const isBase64 = (value: unknown, min: number, max: number) =>
  typeof value === "string" && value.length >= min && value.length <= max && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
const isGcmIv = (value: unknown) => isBase64(value, 16, 16);

async function conversationForParticipant(conversationId: string, clerkId: string) {
  const [conversation] = await db.select().from(conversationsTable).where(and(
    eq(conversationsTable.id, conversationId),
    or(eq(conversationsTable.participantOneId, clerkId), eq(conversationsTable.participantTwoId, clerkId)),
  )).limit(1);
  return conversation ?? null;
}

router.post("/conversations", async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkId = getClerkId(req);
    const teammateId = typeof req.body?.teammateId === "string" ? req.body.teammateId : "";
    if (!teammateId || teammateId === clerkId) {
      res.status(400).json({ error: "A different teammate is required." });
      return;
    }
    const [relationship] = await db.select().from(teammatesTable).where(and(
      eq(teammatesTable.userId, clerkId), eq(teammatesTable.teammateUserId, teammateId),
    )).limit(1);
    if (!relationship) {
      res.status(403).json({ error: "You can only chat with accepted teammates." });
      return;
    }
    const [participantOneId, participantTwoId] = [clerkId, teammateId].sort();
    const [created] = await db.insert(conversationsTable)
      .values({ participantOneId, participantTwoId })
      .onConflictDoNothing()
      .returning();
    if (created) {
      res.status(201).json({ conversation: created });
      return;
    }
    const [existing] = await db.select().from(conversationsTable).where(and(
      eq(conversationsTable.participantOneId, participantOneId),
      eq(conversationsTable.participantTwoId, participantTwoId),
    )).limit(1);
    if (!existing) throw new Error("Conversation lookup failed after conflict.");
    res.json({ conversation: existing });
  } catch {
    res.status(500).json({ error: "Failed to open secure conversation." });
  }
});

router.get("/conversations/:id/messages", async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkId = getClerkId(req);
    const conversation = await conversationForParticipant(routeId(req), clerkId);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }
    const deviceKeyId = typeof req.query.deviceKeyId === "string" ? req.query.deviceKeyId : "";
    const [deviceKey] = await db.select().from(userDeviceKeysTable).where(and(eq(userDeviceKeysTable.id, deviceKeyId), eq(userDeviceKeysTable.userId, clerkId), isNull(userDeviceKeysTable.revokedAt))).limit(1);
    if (!deviceKey) { res.status(400).json({ error: "An active device key is required." }); return; }
    const messages = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, conversation.id))
      .orderBy(asc(messagesTable.createdAt));
    const wraps = messages.length ? await db.select().from(messageDeviceKeysTable).where(and(inArray(messageDeviceKeysTable.messageId, messages.map((message) => message.id)), eq(messageDeviceKeysTable.recipientDeviceKeyId, deviceKey.id))) : [];
    const wrapsByMessage = new Map(wraps.map((wrap) => [wrap.messageId, wrap]));
    res.json({ messages: messages.map((message) => {
      const wrap = wrapsByMessage.get(message.id) ?? (
        // Read-only compatibility for messages stored before per-device wraps.
        // It deliberately does not attempt recovery on a different device.
        message.senderId === clerkId && message.senderDeviceKeyId === deviceKey.id
          ? { recipientDeviceKeyId: deviceKey.id, wrappedMessageKey: message.senderWrappedMessageKey, wrappingIv: message.senderWrappingIv }
          : message.recipientDeviceKeyId === deviceKey.id
            ? { recipientDeviceKeyId: deviceKey.id, wrappedMessageKey: message.recipientWrappedMessageKey, wrappingIv: message.recipientWrappingIv }
            : undefined
      );
      // The selected wrap is always for this installation, whether the caller
      // sent or received the message. This lets a second sender device read
      // history without exposing a raw AES key.
      return wrap ? { ...message, deviceWrappedMessageKey: wrap.wrappedMessageKey, deviceWrappingIv: wrap.wrappingIv, deviceKeyId: wrap.recipientDeviceKeyId } : message;
    }) });
  } catch {
    res.status(500).json({ error: "Failed to load encrypted messages." });
  }
});

router.post("/conversations/:id/messages", async (req: Request, res: Response): Promise<void> => {
  try {
    const senderId = getClerkId(req);
    const conversation = await conversationForParticipant(routeId(req), senderId);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }
    const body = req.body ?? {};
    // Reject common plaintext fields so accidental client regressions fail closed.
    if ("plaintext" in body || "content" in body || "message" in body) {
      res.status(400).json({ error: "Plaintext messages are not accepted." });
      return;
    }
    if (
      !isBase64(body.ciphertext, 24, 262144) || !isGcmIv(body.iv) ||
      !isBase64(body.senderWrappedMessageKey, 24, 1024) || !isGcmIv(body.senderWrappingIv) ||
      body.encryptionAlgorithm !== "AES-256-GCM" ||
      body.wrappingAlgorithm !== "ECDH-P256/HKDF-SHA256/AES-256-GCM" ||
      typeof body.senderDeviceKeyId !== "string" || !Array.isArray(body.senderDeviceKeys) || !body.senderDeviceKeys.length || !Array.isArray(body.recipientDeviceKeys) || !body.recipientDeviceKeys.length
    ) {
      res.status(400).json({ error: "Valid encrypted message metadata is required." });
      return;
    }
    const recipientId = senderId === conversation.participantOneId
      ? conversation.participantTwoId : conversation.participantOneId;
    const [senderKey] = await Promise.all([
      db.select().from(userDeviceKeysTable).where(and(eq(userDeviceKeysTable.id, body.senderDeviceKeyId), eq(userDeviceKeysTable.userId, senderId), isNull(userDeviceKeysTable.revokedAt))).limit(1),
    ]);
    const senderKeyIds = body.senderDeviceKeys.map((key: unknown) => typeof key === "object" && key ? (key as { recipientDeviceKeyId?: unknown }).recipientDeviceKeyId : "");
    const recipientKeyIds = body.recipientDeviceKeys.map((key: unknown) => typeof key === "object" && key ? (key as { recipientDeviceKeyId?: unknown }).recipientDeviceKeyId : "");
    const allWraps = [...body.senderDeviceKeys, ...body.recipientDeviceKeys] as unknown[];
    const allKeyIds = [...senderKeyIds, ...recipientKeyIds];
    if (!senderKey[0] || !allKeyIds.every((id: unknown) => typeof id === "string") || new Set(allKeyIds).size !== allKeyIds.length || allWraps.some((key: unknown) => { const value = key as Record<string, unknown>; return !value || !isBase64(value.wrappedMessageKey, 24, 1024) || !isGcmIv(value.wrappingIv); })) {
      res.status(409).json({ error: "An active device key is required for both participants." });
      return;
    }
    const [senderRecipientKeys, recipientKeys] = await Promise.all([
      db.select().from(userDeviceKeysTable).where(and(inArray(userDeviceKeysTable.id, senderKeyIds as string[]), eq(userDeviceKeysTable.userId, senderId), isNull(userDeviceKeysTable.revokedAt))),
      db.select().from(userDeviceKeysTable).where(and(inArray(userDeviceKeysTable.id, recipientKeyIds as string[]), eq(userDeviceKeysTable.userId, recipientId), isNull(userDeviceKeysTable.revokedAt))),
    ]);
    if (senderRecipientKeys.length !== senderKeyIds.length || recipientKeys.length !== recipientKeyIds.length) { res.status(409).json({ error: "An active device key is required for both participants." }); return; }
    const firstWrap = body.recipientDeviceKeys[0] as { recipientDeviceKeyId: string; wrappedMessageKey: string; wrappingIv: string };
    const [message] = await db.insert(messagesTable).values({
      conversationId: conversation.id, senderId, recipientId,
      ciphertext: body.ciphertext, iv: body.iv, encryptionAlgorithm: body.encryptionAlgorithm,
      senderWrappedMessageKey: body.senderWrappedMessageKey, senderWrappingIv: body.senderWrappingIv,
      wrappingAlgorithm: body.wrappingAlgorithm,
      senderDeviceKeyId: senderKey[0].id, recipientDeviceKeyId: firstWrap.recipientDeviceKeyId,
      recipientWrappedMessageKey: firstWrap.wrappedMessageKey, recipientWrappingIv: firstWrap.wrappingIv,
    }).returning();
    await db.insert(messageDeviceKeysTable).values(allWraps.map((key: unknown) => ({ messageId: message.id, ...(key as { recipientDeviceKeyId: string; wrappedMessageKey: string; wrappingIv: string }) })));
    await db.update(conversationsTable).set({ updatedAt: new Date() }).where(eq(conversationsTable.id, conversation.id));
    res.status(201).json({ message });
  } catch {
    res.status(500).json({ error: "Failed to store encrypted message." });
  }
});

export default router;
