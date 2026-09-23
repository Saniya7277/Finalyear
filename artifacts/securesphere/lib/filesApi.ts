import { useAuthenticatedApi } from "./authenticatedApi";
import { useUser } from "@clerk/expo";
import { ensureDeviceKey } from "./deviceKeys";
import type { FileType } from "@/data/mockData";

export interface ShareRecipient {
  clerkId: string;
  name: string | null;
  email: string;
  permission: "viewer" | "editor";
  createdAt: string;
}

export interface SecureFileRecord {
  id: string;
  ownerId: string;
  name: string;
  mimeType: string;
  type: FileType;
  sizeBytes: number;
  encrypted: boolean;
  encryptionAlgorithm: string;
  scan: { verdict: "clean" | "flagged" | null; riskScore: number };
  createdAt: string;
  modifiedAt: string;
  shares?: ShareRecipient[];
  permission?: "viewer" | "editor";
  sharedAt?: string;
  sharedBy?: Pick<ShareRecipient, "clerkId" | "name" | "email">;
}

export interface TeammateSummary {
  clerkId: string;
  name: string | null;
  email: string;
}

export interface DevicePublicKey {
  id: string;
  publicKey: JsonWebKey | string;
}

export interface KeySharePayload {
  wrappedFileKey: string;
  wrappingIv: string;
  wrappingAlgorithm: string;
  ownerPublicKey: JsonWebKey | string;
  ownerDeviceKeyId: string;
  recipientDeviceKeyId: string;
  fileIv: string;
}

export interface FileDetailsResponse {
  file: SecureFileRecord;
  isOwner: boolean;
  sharedWith: ShareRecipient[];
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parsePublicKey(value: JsonWebKey | string): JsonWebKey {
  return typeof value === "string" ? JSON.parse(value) as JsonWebKey : value;
}

export function useFilesApi() {
  const { request } = useAuthenticatedApi();
  const { user } = useUser();
  const listFiles = async (): Promise<{ owned: SecureFileRecord[]; sharedWithMe: SecureFileRecord[] }> => {
    const response = await request("/api/files");
    if (!response.ok) throw new Error(`Failed to load files (${response.status}).`);
    const data = await response.json();
    return { owned: data.owned ?? [], sharedWithMe: data.sharedWithMe ?? [] };
  };
  const getFile = async (id: string): Promise<FileDetailsResponse> => {
    const response = await request(`/api/files/${id}`);
    if (!response.ok) throw new Error(`Failed to load file (${response.status}).`);
    return await response.json();
  };
  const listTeammates = async (): Promise<TeammateSummary[]> => {
    const response = await request("/api/teammates/list");
    if (!response.ok) return [];
    return (await response.json()).teammates ?? [];
  };
  const getMyDeviceKey = async (): Promise<DevicePublicKey> => {
    if (!user?.id) throw new Error("Your active device key is unavailable.");
    // `/me` cannot know which of a user's devices made this request. Register
    // this installation's already-local public key instead; registration is
    // idempotent for that exact key and returns its matching database record.
    const { publicKey } = await ensureDeviceKey(user.id);
    const response = await request("/api/keys/register", {
      method: "POST",
      body: JSON.stringify({ publicKey: JSON.stringify(publicKey) }),
    });
    if (!response.ok) throw new Error("Your active device key is unavailable.");
    const value = await response.json();
    return { ...value, publicKey: parsePublicKey(value.publicKey) };
  };
  const getTeammateDeviceKeys = async (userId: string): Promise<DevicePublicKey[]> => {
    const response = await request(`/api/keys/teammates/${userId}`);
    if (!response.ok) throw new Error("This teammate has no active secure device key.");
    const value = await response.json();
    return (value.keys ?? []).map((key: DevicePublicKey) => ({ ...key, publicKey: parsePublicKey(key.publicKey) }));
  };
  const getMyDeviceKeys = async (): Promise<DevicePublicKey[]> => {
    // Ensure this installation is included before asking for the account set.
    await getMyDeviceKey();
    const response = await request("/api/keys/mine");
    if (!response.ok) throw new Error("Your active device keys are unavailable.");
    const value = await response.json();
    return (value.keys ?? []).map((key: DevicePublicKey) => ({ ...key, publicKey: parsePublicKey(key.publicKey) }));
  };
  const createSecureShare = async (fileId: string, payload: {
    recipientId: string; ownerDeviceKeyId: string;
    recipientDeviceKeys: { recipientDeviceKeyId: string; wrappedFileKey: string; wrappingIv: string; wrappingAlgorithm: string }[];
    permission?: "viewer" | "editor";
  }): Promise<void> => {
    const response = await request(`/api/files/${fileId}/share`, { method: "POST", body: JSON.stringify(payload) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Failed to create secure share (${response.status}).`);
    }
  };
  const getKeyShare = async (fileId: string, deviceKeyId: string): Promise<KeySharePayload> => {
    const response = await request(`/api/files/${fileId}/key-share?deviceKeyId=${encodeURIComponent(deviceKeyId)}`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({} as { error?: unknown }));
      const detail = typeof body.error === "string" ? body.error : "The secure key share is unavailable.";
      throw new Error(detail);
    }
    const value = await response.json();
    if (value.recipientDeviceKeyId !== deviceKeyId) {
      throw new Error("The returned wrapped file key is not addressed to this device.");
    }
    return { ...value, ownerPublicKey: parsePublicKey(value.ownerPublicKey) };
  };
  const downloadCiphertext = async (fileId: string): Promise<Uint8Array> => {
    const response = await request(`/api/files/${fileId}/content`);
    if (!response.ok) {
      const body = await response.json().catch(() => ({} as { error?: unknown }));
      const detail = typeof body.error === "string" ? body.error : `Failed to download ciphertext (${response.status}).`;
      throw new Error(`File ciphertext unavailable: ${detail}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  };
  const deleteFile = async (id: string): Promise<boolean> => (await request(`/api/files/${id}`, { method: "DELETE" })).ok;
  return { listFiles, getFile, listTeammates, getMyDeviceKey, getMyDeviceKeys, getTeammateDeviceKeys, createSecureShare, getKeyShare, downloadCiphertext, deleteFile };
}
