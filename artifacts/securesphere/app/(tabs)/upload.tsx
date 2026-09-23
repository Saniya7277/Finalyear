import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";
import { useColors } from "@/hooks/useColors";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { readFileBytes, scanFile, SupportedFileType } from "@/lib/scanning/scanner";
import { encryptFileData, storeKeySecurely } from "@/lib/encryption";
import { useAuthenticatedApi } from "@/lib/authenticatedApi";

type UploadState =
  | "idle"
  | "selected"
  | "analyzing"
  | "scan_complete"
  | "blocked"
  | "encrypting"
  | "encrypted"
  | "uploading"
  | "uploaded"
  | "error";

export default function Upload() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const api = useAuthenticatedApi();

  const [state, setState] = useState<UploadState>("idle");
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    size: number;
    mimeType?: string;
  } | null>(null);

  const [scanResult, setScanResult] = useState<{
    verdict: string;
    confidence: number;
  } | null>(null);

  const [errorMsg, setErrorMsg] = useState("");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const uploadScale = useSharedValue(1);
  const iconRotation = useSharedValue(0);

  const uploadStyle = useAnimatedStyle(() => ({
    transform: [{ scale: uploadScale.value }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${iconRotation.value}deg` }],
  }));

  useEffect(() => {
    if (
      state === "analyzing" ||
      state === "encrypting" ||
      state === "uploading"
    ) {
      iconRotation.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      iconRotation.value = withTiming(0, { duration: 300 });
    }
  }, [state]);

  const handleSelectFile = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      uploadScale.value = withSequence(
        withTiming(0.94, { duration: 100 }),
        withTiming(1, { duration: 100 }),
      );

      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const file = result.assets[0];
      setSelectedFile({
        uri: file.uri,
        name: file.name,
        size: file.size || 0,
        mimeType: file.mimeType,
      });
      setState("selected");
    } catch (error) {
      console.error("File picker error:", error);
      setState("idle");
    }
  };

  const processFile = async () => {
    if (!selectedFile) return;

    setState("analyzing");

    // 1. Local AI Malware Inference
    const result = await scanFile(
      selectedFile.uri,
      selectedFile.name,
      selectedFile.size,
      selectedFile.mimeType,
    );

    if (result.verdict === "ERROR") {
      setErrorMsg(result.error || "Failed to scan file");
      setState("error");
      return;
    }

    setScanResult({ verdict: result.verdict, confidence: result.confidence });

    if (result.verdict === "MALICIOUS") {
      setState("blocked");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return; // Do NOT encrypt, do NOT upload
    }

    setState("scan_complete");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Proceed to encryption
    setTimeout(encryptAndUpload, 1500);
  };

  const encryptAndUpload = async () => {
    if (!selectedFile) return;

    try {
      setState("encrypting");

      // This existing helper reads locally with the browser API on web and
      // Expo FileSystem on native platforms. It never uploads plaintext.
      const plaintext = await readFileBytes(selectedFile.uri);

      // Encrypt locally. Plaintext never leaves the device.
      const { ciphertext, ivHex, keyHex } = encryptFileData(plaintext);
      const ciphertextSize = ciphertext.byteLength;

      plaintext.fill(0);
      setState("encrypted");

      await new Promise((resolve) => setTimeout(resolve, 1000));

      setState("uploading");

      // Step 1: Ask Vercel only for a signed Supabase upload URL.
      const urlResponse = await api.request("/api/files/upload-url", {
        method: "POST",
        body: JSON.stringify({
          filename: selectedFile.name,
        }),
      });

      if (!urlResponse.ok) {
        const detail = await urlResponse.text().catch(() => "");
        throw new Error(
          `Failed to prepare secure upload: ${urlResponse.status}${detail ? ` - ${detail}` : ""}`,
        );
      }

      const uploadInfo = await urlResponse.json();

      if (!uploadInfo.signedUrl || !uploadInfo.path) {
        throw new Error("Server did not return a valid secure upload URL.");
      }

      // Step 2: Upload ONLY ciphertext directly to Supabase Storage.
      if (Platform.OS === "web") {
        // Browsers support Blob construction from typed arrays.
        const webCiphertext = new Uint8Array(ciphertext.byteLength);
        webCiphertext.set(ciphertext);
        const ciphertextBlob = new Blob([webCiphertext.buffer], {
          type: "application/octet-stream",
        });
        webCiphertext.fill(0);
        ciphertext.fill(0);

        const storageResponse = await fetch(uploadInfo.signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
            "x-upsert": "false",
          },
          body: ciphertextBlob,
        });

        if (!storageResponse.ok) {
          const detail = await storageResponse.text().catch(() => "");
          throw new Error(
            `Secure Storage upload failed: ${storageResponse.status}${detail ? ` - ${detail}` : ""}`,
          );
        }
      } else {
        // React Native does not support Blob(ArrayBufferView). Write the
        // ciphertext to the app cache and let Expo's native uploader send the
        // file URI as a raw PUT body instead.
        const ciphertextFile = new File(
          Paths.cache,
          `securesphere-upload-${Date.now()}.enc`,
        );

        try {
          ciphertextFile.write(ciphertext);
          ciphertext.fill(0);

          const storageResponse = await FileSystem.uploadAsync(
            uploadInfo.signedUrl,
            ciphertextFile.uri,
            {
              httpMethod: "PUT",
              uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
              headers: {
                "Content-Type": "application/octet-stream",
                "x-upsert": "false",
              },
            },
          );

          if (storageResponse.status < 200 || storageResponse.status >= 300) {
            throw new Error(
              `Secure Storage upload failed: ${storageResponse.status}${storageResponse.body ? ` - ${storageResponse.body}` : ""}`,
            );
          }
        } finally {
          if (ciphertextFile.exists) {
            ciphertextFile.delete();
          }
        }
      }

      // Step 3: Tell Vercel only the small metadata needed for the DB record.
      const completeResponse = await api.request("/api/files/complete-upload", {
        method: "POST",
        body: JSON.stringify({
          path: uploadInfo.path,
          filename: selectedFile.name,
          mimeType: selectedFile.mimeType || "application/octet-stream",
          size: ciphertextSize,
          iv: ivHex,
          malwareScanResult: scanResult?.verdict || "SAFE",
          malwareScanConfidence: scanResult?.confidence ?? 0,
        }),
      });

      if (!completeResponse.ok) {
        const detail = await completeResponse.text().catch(() => "");
        throw new Error(
          `Upload completion failed: ${completeResponse.status}${detail ? ` - ${detail}` : ""}`,
        );
      }

      const data = await completeResponse.json();

      if (!data.fileId) {
        throw new Error("Upload completed but no file ID was returned.");
      }

      // Step 4: AES key stays ONLY on this device.
      try {
        await storeKeySecurely(data.fileId, keyHex);
      } catch (keyError) {
        const keyMessage =
          keyError instanceof Error
            ? keyError.message
            : "Local key storage failed";

        setErrorMsg(
          `Upload succeeded, but local key storage failed: ${keyMessage}`,
        );
        setState("error");
        return;
      }

      setState("uploaded");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : "Secure upload failed",
      );
      setState("error");
    }
  };
  const reset = () => {
    setState("idle");
    setSelectedFile(null);
    setScanResult(null);
    setErrorMsg("");
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.orbTL} />
      <View style={styles.orbBR} />

      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Secure Upload
        </Text>
      </View>

      <View style={[styles.content, { paddingBottom: botPad + 90 }]}>
        <Animated.View style={uploadStyle}>
          <TouchableOpacity
            onPress={state === "idle" ? handleSelectFile : undefined}
            activeOpacity={state === "idle" ? 0.75 : 1}
            style={[
              styles.dropZone,
              {
                borderColor:
                  state !== "idle" ? colors.primary : `${colors.primary}40`,
                backgroundColor: colors.card,
              },
            ]}
          >
            {state === "idle" && (
              <>
                <View
                  style={[
                    styles.uploadIconBg,
                    { backgroundColor: `${colors.primary}15` },
                  ]}
                >
                  <Ionicons
                    name="shield-checkmark"
                    size={52}
                    color={colors.primary}
                  />
                </View>
                <Text style={[styles.dropTitle, { color: colors.foreground }]}>
                  Select Secure File
                </Text>
                <Text
                  style={[
                    styles.dropSubtitle,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Local AI Scan → Local Encryption → Secure Upload
                </Text>
              </>
            )}

            {state === "selected" && (
              <>
                <View
                  style={[
                    styles.uploadIconBg,
                    { backgroundColor: `${colors.primary}15` },
                  ]}
                >
                  <Ionicons
                    name="document-text"
                    size={52}
                    color={colors.primary}
                  />
                </View>
                <Text style={[styles.dropTitle, { color: colors.foreground }]}>
                  {selectedFile?.name}
                </Text>
                <TouchableOpacity
                  onPress={processFile}
                  style={[
                    styles.actionBtn,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={styles.actionBtnText}>
                    Begin Secure Analysis
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {(state === "analyzing" ||
              state === "encrypting" ||
              state === "uploading") && (
              <>
                <Animated.View style={iconStyle}>
                  <View
                    style={[
                      styles.uploadIconBg,
                      { backgroundColor: `${colors.primary}15` },
                    ]}
                  >
                    <Ionicons
                      name={
                        state === "analyzing"
                          ? "analytics"
                          : state === "encrypting"
                            ? "lock-closed"
                            : "cloud-upload"
                      }
                      size={52}
                      color={colors.primary}
                    />
                  </View>
                </Animated.View>
                <Text style={[styles.dropTitle, { color: colors.foreground }]}>
                  {state === "analyzing"
                    ? "⟳ AI malware analysis..."
                    : state === "encrypting"
                      ? "○ Local encryption..."
                      : "⟳ Secure upload..."}
                </Text>
                <Text
                  style={[
                    styles.dropSubtitle,
                    { color: colors.mutedForeground },
                  ]}
                >
                  File remains on your device for analysis
                </Text>
              </>
            )}

            {(state === "scan_complete" ||
              state === "encrypted" ||
              state === "uploaded") && (
              <>
                <View
                  style={[
                    styles.uploadIconBg,
                    { backgroundColor: "rgba(0,230,118,0.15)" },
                  ]}
                >
                  <Ionicons
                    name="shield-checkmark"
                    size={52}
                    color={colors.success}
                  />
                </View>
                <Text style={[styles.dropTitle, { color: colors.foreground }]}>
                  {state === "scan_complete"
                    ? "✓ AI analysis complete"
                    : state === "encrypted"
                      ? "✓ Encrypted locally"
                      : "✓ Upload Complete"}
                </Text>

                {state === "scan_complete" &&
                  scanResult?.verdict === "SAFE" && (
                    <Text
                      style={[styles.dropSubtitle, { color: colors.success }]}
                    >
                      No malicious indicators detected. Confidence:{" "}
                      {((1 - scanResult.confidence) * 100).toFixed(1)}%
                    </Text>
                  )}

                {state === "uploaded" && (
                  <TouchableOpacity
                    onPress={reset}
                    style={[styles.resetBtn, { borderColor: colors.border }]}
                  >
                    <Text
                      style={[styles.resetBtnText, { color: colors.primary }]}
                    >
                      Upload another file
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {state === "blocked" && (
              <>
                <View
                  style={[
                    styles.uploadIconBg,
                    { backgroundColor: "rgba(255,59,48,0.15)" },
                  ]}
                >
                  <Ionicons name="warning" size={52} color={"#FF3B30"} />
                </View>
                <Text style={[styles.dropTitle, { color: "#FF3B30" }]}>
                  ⚠ SECURITY THREAT DETECTED
                </Text>
                <Text
                  style={[styles.dropSubtitle, { color: colors.foreground }]}
                >
                  This file appears to contain malicious content.
                </Text>
                <Text
                  style={[
                    styles.dropSubtitle,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Confidence: {(scanResult?.confidence! * 100).toFixed(1)}%
                </Text>
                <Text
                  style={[
                    styles.dropSubtitle,
                    { color: "#FF3B30", fontWeight: "bold", marginTop: 10 },
                  ]}
                >
                  UPLOAD BLOCKED. The file was not uploaded.
                </Text>
                <TouchableOpacity
                  onPress={reset}
                  style={[
                    styles.resetBtn,
                    { borderColor: colors.border, marginTop: 15 },
                  ]}
                >
                  <Text
                    style={[styles.resetBtnText, { color: colors.primary }]}
                  >
                    Dismiss
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {state === "error" && (
              <>
                <View
                  style={[
                    styles.uploadIconBg,
                    { backgroundColor: "rgba(255,59,48,0.15)" },
                  ]}
                >
                  <Ionicons name="close-circle" size={52} color={"#FF3B30"} />
                </View>
                <Text style={[styles.dropTitle, { color: "#FF3B30" }]}>
                  Upload Failed
                </Text>
                <Text
                  style={[styles.dropSubtitle, { color: colors.foreground }]}
                >
                  {errorMsg}
                </Text>
                <TouchableOpacity
                  onPress={reset}
                  style={[
                    styles.resetBtn,
                    { borderColor: colors.border, marginTop: 15 },
                  ]}
                >
                  <Text
                    style={[styles.resetBtnText, { color: colors.primary }]}
                  >
                    Try Again
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

        {state === "idle" && (
          <View
            style={[
              styles.infoBox,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Ionicons
              name="information-circle"
              size={24}
              color={colors.primary}
            />
            <Text style={[styles.infoText, { color: colors.mutedForeground }]}>
              Files never leave your device unencrypted. Malware scanning occurs
              entirely via on-device inference using locally stored JSON AI
              models.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  orbTL: {
    position: "absolute",
    top: -60,
    left: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(0,212,255,0.05)",
  },
  orbBR: {
    position: "absolute",
    bottom: 100,
    right: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(180,79,255,0.05)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  content: { flex: 1, paddingHorizontal: 20, gap: 20 },
  dropZone: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 20,
    minHeight: 350,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 28,
  },
  uploadIconBg: {
    width: 100,
    height: 100,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  dropTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  dropSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  actionBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 10,
  },
  actionBtnText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  resetBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 4,
  },
  resetBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  infoBox: {
    flexDirection: "row",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    alignItems: "center",
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
});
