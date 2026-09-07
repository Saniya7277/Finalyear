import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const PREFIX = "securesphere_ecdh_private_";

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  return bytes.slice().buffer;
};

const b64 = (bytes: ArrayBuffer | Uint8Array): string => {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  return btoa(String.fromCharCode(...array));
};

const fromB64 = (value: string): Uint8Array => {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
};

const storage = () => (Platform.OS === "web" ? window.localStorage : null);

async function save(id: string, value: string) {
  const s = storage();

  if (s) {
    s.setItem(PREFIX + id, value);
  } else {
    await SecureStore.setItemAsync(PREFIX + id, value);
  }
}

async function load(id: string) {
  const s = storage();

  return s ? s.getItem(PREFIX + id) : SecureStore.getItemAsync(PREFIX + id);
}

function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure device keys are unavailable on this platform.");
  }

  return globalThis.crypto.subtle;
}

export async function ensureDeviceKey(
  userId: string,
): Promise<{ publicKey: JsonWebKey }> {
  const existing = await load(userId);

  if (existing) {
    return {
      publicKey: JSON.parse(existing).publicKey,
    };
  }

  const pair = await subtle().generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveBits"],
  );

  const record = {
    privateKey: await subtle().exportKey("jwk", pair.privateKey),
    publicKey: await subtle().exportKey("jwk", pair.publicKey),
  };

  await save(userId, JSON.stringify(record));

  return {
    publicKey: record.publicKey,
  };
}

export async function wrapFileKey(
  userId: string,
  recipientPublicKey: JsonWebKey,
  fileId: string,
  keyHex: string,
) {
  const stored = await load(userId);

  if (!stored) {
    throw new Error(
      "Encryption key unavailable on this device. This file cannot be shared from this device.",
    );
  }

  const record = JSON.parse(stored);

  if (!record.privateKey) {
    throw new Error(
      "Encryption key unavailable on this device. This file cannot be shared from this device.",
    );
  }

  const own = await subtle().importKey(
    "jwk",
    record.privateKey,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    false,
    ["deriveBits"],
  );

  const recipient = await subtle().importKey(
    "jwk",
    recipientPublicKey,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    false,
    [],
  );

  const secret = await subtle().deriveBits(
    {
      name: "ECDH",
      public: recipient,
    },
    own,
    256,
  );

  const material = await subtle().importKey(
    "raw",
    toArrayBuffer(new Uint8Array(secret)),
    "HKDF",
    false,
    ["deriveKey"],
  );

  const salt = new TextEncoder().encode(fileId);
  const info = new TextEncoder().encode("SecureSphere file-key wrap v1");

  const wrapping = await subtle().deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(info),
    },
    material,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const raw = Uint8Array.from(keyHex.match(/.{1,2}/g) ?? [], (x) =>
    parseInt(x, 16),
  );

  const ciphertext = await subtle().encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
    },
    wrapping,
    toArrayBuffer(raw),
  );

  return {
    wrappedFileKey: b64(ciphertext),
    wrappingIv: b64(iv),
    wrappingAlgorithm: "ECDH-P256/HKDF-SHA256/AES-256-GCM",
  };
}

/** Reverse wrapFileKey locally; no key material is sent to the API. */
export async function unwrapFileKey(userId: string, ownerPublicKey: JsonWebKey, fileId: string, wrappedFileKey: string, wrappingIv: string): Promise<string> {
  const stored = await load(userId);
  if (!stored) throw new Error("This device does not have the private key required for this share.");
  const record = JSON.parse(stored);
  const own = await subtle().importKey("jwk", record.privateKey, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const owner = await subtle().importKey("jwk", ownerPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const secret = await subtle().deriveBits({ name: "ECDH", public: owner }, own, 256);
  const material = await subtle().importKey("raw", toArrayBuffer(new Uint8Array(secret)), "HKDF", false, ["deriveKey"]);
  const wrapping = await subtle().deriveKey({ name: "HKDF", hash: "SHA-256", salt: toArrayBuffer(new TextEncoder().encode(fileId)), info: toArrayBuffer(new TextEncoder().encode("SecureSphere file-key wrap v1")) }, material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const raw = new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: toArrayBuffer(fromB64(wrappingIv)) }, wrapping, toArrayBuffer(fromB64(wrappedFileKey))));
  return Array.from(raw).map(x => x.toString(16).padStart(2, "0")).join("");
}
