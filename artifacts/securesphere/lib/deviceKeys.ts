import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { gcm } from "@noble/ciphers/aes.js";
import { p256 } from "@noble/curves/nist.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

const PREFIX = "securesphere_ecdh_private_";
const encoder = new TextEncoder();
const initializations = new Map<string, Promise<{ publicKey: JsonWebKey }>>();
type DeviceRecord = { privateKey: string | JsonWebKey; publicKey: JsonWebKey };
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const fromB64url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4)), (character) => character.charCodeAt(0));
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
// Device private keys have one persistence location: Expo SecureStore. In
// particular, do not fall back to AsyncStorage or browser localStorage.
async function save(id: string, value: string) { await SecureStore.setItemAsync(PREFIX + id, value); }
async function load(id: string) { return SecureStore.getItemAsync(PREFIX + id); }

function readDeviceRecord(stored: string): DeviceRecord {
  try {
    const record = JSON.parse(stored) as Partial<DeviceRecord>;
    if (!record.privateKey || !record.publicKey || record.publicKey.kty !== "EC" || record.publicKey.crv !== "P-256") throw new Error("invalid record");
    return record as DeviceRecord;
  } catch {
    // Never silently replace an existing identity: it may be needed for older content.
    throw new Error("Secure device key storage is unavailable or corrupted. Re-register this device before sending new messages.");
  }
}

function privateBytes(record: DeviceRecord): Uint8Array {
  const encoded = typeof record.privateKey === "string" ? record.privateKey : record.privateKey.d;
  if (!encoded) throw new Error("Secure device key storage is unavailable or corrupted.");
  const key = fromB64url(encoded);
  if (!p256.utils.isValidSecretKey(key)) throw new Error("Secure device key storage is unavailable or corrupted.");
  return key;
}

function publicBytes(publicKey: JsonWebKey): Uint8Array {
  if (!publicKey.x || !publicKey.y) throw new Error("The supplied device public key is invalid.");
  const x = fromB64url(publicKey.x); const y = fromB64url(publicKey.y);
  if (x.length !== 32 || y.length !== 32) throw new Error("The supplied device public key is invalid.");
  const point = new Uint8Array(65); point[0] = 4; point.set(x, 1); point.set(y, 33);
  if (!p256.utils.isValidPublicKey(point, false)) throw new Error("The supplied device public key is invalid.");
  return point;
}

function publicJwk(privateKey: Uint8Array): JsonWebKey {
  const point = p256.getPublicKey(privateKey, false);
  return { kty: "EC", crv: "P-256", x: b64url(point.slice(1, 33)), y: b64url(point.slice(33, 65)), ext: true };
}

function generatePrivateKey(): Uint8Array {
  let key: Uint8Array;
  do key = Crypto.getRandomBytes(32); while (!p256.utils.isValidSecretKey(key!));
  return key!;
}

async function initializeDeviceKey(userId: string): Promise<{ publicKey: JsonWebKey }> {
  const existing = await load(userId);
  if (existing) return { publicKey: readDeviceRecord(existing).publicKey };
  // Hermes lacks SubtleCrypto ECDH; use native Expo CSPRNG plus pure-JS P-256.
  const privateKey = generatePrivateKey();
  const record: DeviceRecord = { privateKey: b64url(privateKey), publicKey: publicJwk(privateKey) };
  await save(userId, JSON.stringify(record));
  return { publicKey: record.publicKey };
}

export function ensureDeviceKey(userId: string): Promise<{ publicKey: JsonWebKey }> {
  const inFlight = initializations.get(userId);
  if (inFlight) return inFlight;
  const initialization = initializeDeviceKey(userId).finally(() => initializations.delete(userId));
  initializations.set(userId, initialization);
  return initialization;
}

function wrappingKey(record: DeviceRecord, peer: JsonWebKey, salt: string, info: string): Uint8Array {
  // WebCrypto deriveBits(ECDH, 256) is the 32-byte X coordinate of the shared point.
  const shared = p256.getSharedSecret(privateBytes(record), publicBytes(peer), false).slice(1, 33);
  return hkdf(sha256, shared, encoder.encode(salt), encoder.encode(info), 32);
}

async function wrap(userId: string, peer: JsonWebKey, salt: string, info: string, keyHex: string) {
  const stored = await load(userId); if (!stored) throw new Error("Secure device key unavailable on this device.");
  const iv = Crypto.getRandomBytes(12);
  const raw = Uint8Array.from(keyHex.match(/.{1,2}/g) ?? [], (value) => parseInt(value, 16));
  return { wrappedKey: b64(gcm(wrappingKey(readDeviceRecord(stored), peer, salt, info), iv).encrypt(raw)), wrappingIv: b64(iv) };
}

async function unwrap(userId: string, peer: JsonWebKey, salt: string, info: string, wrappedKey: string, wrappingIv: string): Promise<string> {
  const stored = await load(userId); if (!stored) throw new Error("Secure device key unavailable on this device.");
  const raw = gcm(wrappingKey(readDeviceRecord(stored), peer, salt, info), fromB64(wrappingIv)).decrypt(fromB64(wrappedKey));
  return Array.from(raw).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function wrapFileKey(userId: string, recipientPublicKey: JsonWebKey, fileId: string, keyHex: string) {
  const result = await wrap(userId, recipientPublicKey, fileId, "SecureSphere file-key wrap v1", keyHex);
  return { wrappedFileKey: result.wrappedKey, wrappingIv: result.wrappingIv, wrappingAlgorithm: "ECDH-P256/HKDF-SHA256/AES-256-GCM" as const };
}
export async function unwrapFileKey(userId: string, ownerPublicKey: JsonWebKey, fileId: string, wrappedFileKey: string, wrappingIv: string) { return unwrap(userId, ownerPublicKey, fileId, "SecureSphere file-key wrap v1", wrappedFileKey, wrappingIv); }
export async function wrapMessageKey(userId: string, recipientPublicKey: JsonWebKey, conversationId: string, messageIv: string, keyHex: string) {
  const result = await wrap(userId, recipientPublicKey, `${conversationId}:${messageIv}`, "SecureSphere chat message-key wrap v1", keyHex);
  return { wrappedMessageKey: result.wrappedKey, wrappingIv: result.wrappingIv, wrappingAlgorithm: "ECDH-P256/HKDF-SHA256/AES-256-GCM" as const };
}
export async function unwrapMessageKey(userId: string, otherPublicKey: JsonWebKey, conversationId: string, messageIv: string, wrappedMessageKey: string, wrappingIv: string) { return unwrap(userId, otherPublicKey, `${conversationId}:${messageIv}`, "SecureSphere chat message-key wrap v1", wrappedMessageKey, wrappingIv); }
