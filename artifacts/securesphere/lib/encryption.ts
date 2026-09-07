/**
 * Real device-side authenticated encryption using AES-256-GCM.
 *
 * Uses @noble/ciphers which is pure JS and compatible with React Native/Hermes.
 * Uses expo-crypto for secure random byte generation.
 * Uses expo-secure-store for local key storage on native platforms.
 * Uses a browser-only local fallback on web so Chrome does not fail while keeping
 * the key entirely client-side and never sending it to the backend.
 *
 * The encryption keys NEVER leave the device.
 */

import { Platform } from "react-native";
import { gcm } from "@noble/ciphers/aes.js";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const WEB_KEY_STORAGE_PREFIX = "secure_file_key_";

function isWebPlatform(): boolean {
  return Platform.OS === "web";
}

function getWebStorage(): Storage | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  return window.localStorage;
}

async function setWebKey(fileId: string, keyHex: string): Promise<void> {
  const storage = getWebStorage();
  if (!storage) {
    throw new Error("Web local storage is unavailable for key persistence");
  }

  storage.setItem(`${WEB_KEY_STORAGE_PREFIX}${fileId}`, keyHex);
}

async function getWebKey(fileId: string): Promise<string | null> {
  const storage = getWebStorage();
  if (!storage) {
    return null;
  }

  return storage.getItem(`${WEB_KEY_STORAGE_PREFIX}${fileId}`);
}

/**
 * Generate 32 bytes (256 bits) of random data for an AES key.
 */
function generateKey(): Uint8Array {
  return Crypto.getRandomBytes(32);
}

/**
 * Generate 12 bytes of random data for a GCM IV.
 */
function generateIV(): Uint8Array {
  return Crypto.getRandomBytes(12);
}

/**
 * Convert Uint8Array to Hex String.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert Hex String to Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Encrypt file data.
 * @param plaintext The raw file bytes
 * @returns { ciphertext: Uint8Array, ivHex: string, keyHex: string }
 */
export function encryptFileData(plaintext: Uint8Array): {
  ciphertext: Uint8Array;
  ivHex: string;
  keyHex: string;
} {
  const key = generateKey();
  const iv = generateIV();

  // @noble/ciphers aes-gcm implementation
  const aesGcm = gcm(key, iv);
  const ciphertext = aesGcm.encrypt(plaintext);

  return {
    ciphertext,
    ivHex: bytesToHex(iv),
    keyHex: bytesToHex(key),
  };
}

/**
 * Decrypt file data.
 * @param ciphertext The encrypted file bytes
 * @param keyHex The key in hex format
 * @param ivHex The IV in hex format
 */
export function decryptFileData(
  ciphertext: Uint8Array,
  keyHex: string,
  ivHex: string,
): Uint8Array {
  const key = hexToBytes(keyHex);
  const iv = hexToBytes(ivHex);

  const aesGcm = gcm(key, iv);
  return aesGcm.decrypt(ciphertext);
}

/**
 * Securely store a file's encryption key on the device.
 * @param fileId UUID returned from the backend after upload
 * @param keyHex The hex-encoded encryption key
 */
export async function storeKeySecurely(
  fileId: string,
  keyHex: string,
): Promise<void> {
  if (isWebPlatform()) {
    await setWebKey(fileId, keyHex);
    return;
  }

  await SecureStore.setItemAsync(`file_key_${fileId}`, keyHex);
}

/**
 * Retrieve a securely stored encryption key from the device.
 * @param fileId The UUID of the file
 */
export async function retrieveKeySecurely(
  fileId: string,
): Promise<string | null> {
  if (isWebPlatform()) {
    return await getWebKey(fileId);
  }

  return await SecureStore.getItemAsync(`file_key_${fileId}`);
}
