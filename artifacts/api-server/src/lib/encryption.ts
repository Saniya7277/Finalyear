import crypto from "node:crypto";

/**
 * AES-256-GCM file encryption.
 *
 * GCM is authenticated encryption: on top of confidentiality it produces an
 * auth tag that makes tampering with the stored ciphertext detectable, so a
 * modified `cipher_text` column fails to decrypt instead of returning garbage.
 *
 * The key comes from FILE_ENCRYPTION_KEY (64 hex characters = 32 bytes) and is
 * never written to the database - losing it means losing every stored file.
 * Generate one with:  openssl rand -hex 32
 */

export const ENCRYPTION_ALGORITHM = "aes-256-gcm";

const KEY_BYTES = 32;
const IV_BYTES = 12; // 96-bit nonce, the size GCM is specified for
const TAG_BYTES = 16; // 128-bit GCM authentication tag

export interface EncryptedPayload {
  algorithm: string;
  cipherText: Buffer;
  /** Hex-encoded initialisation vector, unique per file. */
  iv: string;
  /** Hex-encoded GCM authentication tag. */
  authTag: string;
}

let cachedKey: Buffer | null = null;

/**
 * Resolve and validate the encryption key. Throws a descriptive error rather
 * than silently falling back to a weak key - a misconfigured server must not
 * be able to store files it cannot protect.
 */
export function getEncryptionKey(): Buffer {
  if (cachedKey) {
    return cachedKey;
  }

  const raw = process.env.FILE_ENCRYPTION_KEY;

  if (!raw) {
    throw new Error(
      "FILE_ENCRYPTION_KEY is not set. Generate one with `openssl rand -hex 32` " +
        "and add it to the server environment before uploading files.",
    );
  }

  const trimmed = raw.trim();

  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error(
      "FILE_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). " +
        "Generate one with `openssl rand -hex 32`.",
    );
  }

  const key = Buffer.from(trimmed, "hex");

  if (key.length !== KEY_BYTES) {
    throw new Error("FILE_ENCRYPTION_KEY did not decode to 32 bytes.");
  }

  cachedKey = key;
  return key;
}

/** True when the server is configured to encrypt, without throwing. */
export function isEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptBuffer(plainText: Buffer): EncryptedPayload {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);

  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const cipherText = Buffer.concat([cipher.update(plainText), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    algorithm: ENCRYPTION_ALGORITHM,
    cipherText,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

export function decryptBuffer(payload: {
  cipherText: Buffer;
  iv: string;
  authTag: string;
}): Buffer {
  const key = getEncryptionKey();

  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    key,
    Buffer.from(payload.iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "hex"));

  // .final() throws if the auth tag does not match the ciphertext.
  return Buffer.concat([decipher.update(payload.cipherText), decipher.final()]);
}

export function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// ---------------------------------------------------------------------------
// Storage blob format
//
// The `files` table has an `iv` column but no auth-tag column, so the 16-byte
// GCM tag is appended to the ciphertext inside the stored object:
//
//     [ ciphertext ][ 16-byte auth tag ]
//
// The IV stays in the database row. That split is deliberate: the object in
// Supabase Storage is not self-describing, so possession of the bucket alone is
// not enough - you also need the row and, above all, the key.
// ---------------------------------------------------------------------------

export interface EncryptedBlob {
  /** ciphertext || authTag - the exact bytes to upload to Storage. */
  blob: Buffer;
  /** Hex-encoded IV, to be written to the `iv` column. */
  iv: string;
}

/** Encrypt plaintext into the blob layout stored in Supabase Storage. */
export function encryptToBlob(plainText: Buffer): EncryptedBlob {
  const { cipherText, iv, authTag } = encryptBuffer(plainText);
  return {
    blob: Buffer.concat([cipherText, Buffer.from(authTag, "hex")]),
    iv,
  };
}

/**
 * Reverse of `encryptToBlob`. Throws if the blob is truncated or if the auth
 * tag does not match - i.e. if the stored object was tampered with.
 */
export function decryptBlob(blob: Buffer, iv: string): Buffer {
  if (blob.length < TAG_BYTES) {
    throw new Error(
      "Stored object is too short to contain an authentication tag.",
    );
  }

  const cipherText = blob.subarray(0, blob.length - TAG_BYTES);
  const authTag = blob.subarray(blob.length - TAG_BYTES);

  return decryptBuffer({
    cipherText,
    iv,
    authTag: authTag.toString("hex"),
  });
}
