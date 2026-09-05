import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useAuthenticatedApi } from "./authenticatedApi";
import type { FileType } from "@/data/mockData";

/** A file the user picked from their device, before it goes anywhere. */
export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  /** Present on web, where DocumentPicker hands back a real File object. */
  file?: File;
}

/** What the AI layer decided about a file. */
export interface ScanSummary {
  verdict: "clean" | "flagged";
  riskScore: number;
  reason: string;
  labels: string[];
  engine: string;
  aiAvailable: boolean;
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
  /**
   * Only the verdict and score are persisted. The scan's written reason and
   * labels come back on the upload response but are never stored, because they
   * can quote the file's contents.
   */
  scan: {
    verdict: "clean" | "flagged" | null;
    riskScore: number;
  };
  createdAt: string;
  /** Mirrors createdAt: stored files are immutable, there is no re-upload. */
  modifiedAt: string;
}

export interface TeammateSummary {
  clerkId: string;
  name: string | null;
  email: string;
}

export interface ShareSuccess {
  ok: true;
  file: SecureFileRecord;
  scan: ScanSummary;
  sharedWith: string[];
}

export interface ShareBlocked {
  ok: false;
  blocked: true;
  scan: ScanSummary;
  message: string;
}

export interface ShareFailed {
  ok: false;
  blocked: false;
  message: string;
}

export type ShareOutcome = ShareSuccess | ShareBlocked | ShareFailed;

/** Human-readable size for the UI. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Open the device file explorer and return the chosen file, or null if the
 * user backed out.
 */
export async function pickFileFromDevice(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    multiple: false,
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets?.[0];
  if (!asset) {
    return null;
  }

  return {
    uri: asset.uri,
    name: asset.name || "untitled",
    mimeType: asset.mimeType || "application/octet-stream",
    size: asset.size ?? 0,
    file: (asset as { file?: File }).file,
  };
}

export function useFilesApi() {
  const { request } = useAuthenticatedApi();

  /**
   * Send the picked file through the secure pipeline.
   * The server scans it, and only encrypts and stores it on a clean verdict —
   * a flagged file comes back as `blocked` and was never written to the vault.
   */
  const shareFile = async (
    picked: PickedFile,
    options: { shareWith?: string[]; permission?: "viewer" | "editor" } = {},
  ): Promise<ShareOutcome> => {
    const form = new FormData();

    if (Platform.OS === "web") {
      // On web we need real bytes; DocumentPicker gives us a File, and if it
      // does not, the uri is a blob: URL we can read back.
      const blob = picked.file ?? (await (await fetch(picked.uri)).blob());
      form.append("file", blob, picked.name);
    } else {
      // React Native's FormData takes this descriptor instead of a Blob.
      form.append("file", {
        uri: picked.uri,
        name: picked.name,
        type: picked.mimeType,
      } as unknown as Blob);
    }

    if (options.shareWith?.length) {
      form.append("shareWith", JSON.stringify(options.shareWith));
    }
    if (options.permission) {
      form.append("permission", options.permission);
    }

    let response: Response;
    try {
      response = await request("/api/files/share", {
        method: "POST",
        body: form,
      });
    } catch (error) {
      return {
        ok: false,
        blocked: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not reach the server. Check your connection and try again.",
      };
    }

    const payload = await response.json().catch(() => ({}) as any);

    if (response.status === 422 && payload?.scan) {
      return {
        ok: false,
        blocked: true,
        scan: payload.scan as ScanSummary,
        message: payload.error || "This file was blocked by the security scan.",
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        blocked: false,
        message: payload?.error || `Upload failed (${response.status}).`,
      };
    }

    return {
      ok: true,
      file: payload.file as SecureFileRecord,
      scan: payload.scan as ScanSummary,
      sharedWith: (payload.sharedWith as string[]) ?? [],
    };
  };

  const listFiles = async (): Promise<{
    owned: SecureFileRecord[];
    sharedWithMe: SecureFileRecord[];
  }> => {
    const response = await request("/api/files");
    if (!response.ok) {
      throw new Error(`Failed to load files (${response.status}).`);
    }
    const data = await response.json();
    return {
      owned: data.owned ?? [],
      sharedWithMe: data.sharedWithMe ?? [],
    };
  };

  const listTeammates = async (): Promise<TeammateSummary[]> => {
    const response = await request("/api/teammates/list");
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    return data.teammates ?? [];
  };

  const deleteFile = async (id: string): Promise<boolean> => {
    const response = await request(`/api/files/${id}`, { method: "DELETE" });
    return response.ok;
  };

  return { shareFile, listFiles, listTeammates, deleteFile };
}
