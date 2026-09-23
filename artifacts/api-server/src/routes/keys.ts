import { Router, type Request, type Response } from "express";
import { db, userDeviceKeysTable, teammatesTable } from "@workspace/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getClerkId, requireAuth } from "../middlewares/auth";

const router = Router();
router.use(requireAuth);
const normalisePublicKey = (value: unknown): string | null => {
  const encoded = typeof value === "string" ? value : value && typeof value === "object" ? JSON.stringify(value) : "";
  if (encoded.length <= 20 || encoded.length >= 8192) return null;
  try { const key = JSON.parse(encoded); return key.kty === "EC" && key.crv === "P-256" && typeof key.x === "string" && typeof key.y === "string" ? encoded : null; } catch { return null; }
};

router.post("/register", async (req: Request, res: Response) => {
  const userId = getClerkId(req); const publicKey = normalisePublicKey(req.body?.publicKey);
  if (!publicKey) return res.status(400).json({ error: "A valid P-256 public key is required." });
  // A public key identifies a single installation. Never reuse another
  // installation's key just because it belongs to the same Clerk account.
  const [existing] = await db.select().from(userDeviceKeysTable).where(and(
    eq(userDeviceKeysTable.userId, userId),
    eq(userDeviceKeysTable.publicKey, publicKey),
    isNull(userDeviceKeysTable.revokedAt),
  )).limit(1);
  if (existing) return res.json({ id: existing.id, publicKey: existing.publicKey });
  const [created] = await db.insert(userDeviceKeysTable).values({ userId, publicKey }).onConflictDoNothing().returning({ id: userDeviceKeysTable.id, publicKey: userDeviceKeysTable.publicKey });
  if (created) return res.status(201).json(created);
  // A concurrent registration won the unique-index race. Return that exact
  // installation record rather than creating another key row.
  const [registered] = await db.select({ id: userDeviceKeysTable.id, publicKey: userDeviceKeysTable.publicKey }).from(userDeviceKeysTable).where(and(eq(userDeviceKeysTable.userId, userId), eq(userDeviceKeysTable.publicKey, publicKey), isNull(userDeviceKeysTable.revokedAt))).limit(1);
  if (!registered) return res.status(409).json({ error: "Device key registration conflicted. Please retry." });
  return res.json(registered);
});
router.get("/me", async (req: Request, res: Response) => {
  const userId = getClerkId(req);
  const [key] = await db.select({ id: userDeviceKeysTable.id, publicKey: userDeviceKeysTable.publicKey }).from(userDeviceKeysTable).where(and(eq(userDeviceKeysTable.userId, userId), isNull(userDeviceKeysTable.revokedAt))).orderBy(desc(userDeviceKeysTable.createdAt)).limit(1);
  if (!key) return res.status(404).json({ error: "No active device key is registered." });
  return res.json(key);
});
// `/me` is retained for older clients. New clients need the full set so a
// message can be wrapped for every installation of its sender as well.
router.get("/mine", async (req: Request, res: Response) => {
  const userId = getClerkId(req);
  const keys = await db.select({ id: userDeviceKeysTable.id, publicKey: userDeviceKeysTable.publicKey })
    .from(userDeviceKeysTable)
    .where(and(eq(userDeviceKeysTable.userId, userId), isNull(userDeviceKeysTable.revokedAt)))
    .orderBy(desc(userDeviceKeysTable.createdAt));
  return res.json({ keys });
});
router.get("/teammates/:userId", async (req: Request, res: Response) => {
  const userId = getClerkId(req); const target = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const [relationship] = await db.select().from(teammatesTable).where(and(eq(teammatesTable.userId, userId), eq(teammatesTable.teammateUserId, target))).limit(1);
  if (!relationship) return res.status(403).json({ error: "Recipient is not an authorized teammate." });
  const keys = await db.select({ id: userDeviceKeysTable.id, publicKey: userDeviceKeysTable.publicKey }).from(userDeviceKeysTable).where(and(eq(userDeviceKeysTable.userId, target), isNull(userDeviceKeysTable.revokedAt))).orderBy(desc(userDeviceKeysTable.createdAt));
  if (!keys.length) return res.status(409).json({ error: "Recipient must sign in to SecureSphere once before files can be shared securely." });
  return res.json({ keys });
});
export default router;
