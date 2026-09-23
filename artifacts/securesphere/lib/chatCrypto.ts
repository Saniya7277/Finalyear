import { decryptFileData, encryptFileData, hexToBytes } from "./encryption";

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

/** Generates a new AES-256-GCM key and IV through the existing client cipher. */
export function encryptChatMessage(plaintext: string) {
  const encrypted = encryptFileData(new TextEncoder().encode(plaintext));
  return {
    ciphertext: toBase64(encrypted.ciphertext),
    iv: toBase64(hexToBytes(encrypted.ivHex)),
    keyHex: encrypted.keyHex,
  };
}

export function decryptChatMessage(ciphertext: string, keyHex: string, iv: string): string {
  const ivHex = Array.from(fromBase64(iv)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return new TextDecoder().decode(decryptFileData(fromBase64(ciphertext), keyHex, ivHex));
}
