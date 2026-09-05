import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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

type UploadState =
  "idle" | "selecting" | "uploading" | "encrypting" | "complete";

const FILE_TYPES = [
  { icon: "document", label: "Document", color: "#0066FF" },
  { icon: "image", label: "Image", color: "#B44FFF" },
  { icon: "videocam", label: "Video", color: "#FF8C00" },
  { icon: "musical-notes", label: "Audio", color: "#00E676" },
] as const;

export default function Upload() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [encryptionEnabled, setEncryptionEnabled] = useState(true);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const uploadScale = useSharedValue(1);
  const progressWidth = useSharedValue(0);
  const iconRotation = useSharedValue(0);

  const uploadStyle = useAnimatedStyle(() => ({
    transform: [{ scale: uploadScale.value }],
  }));
  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value * 100}%` as any,
  }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${iconRotation.value}deg` }],
  }));

  useEffect(() => {
    if (state === "uploading" || state === "encrypting") {
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
      // Haptic feedback
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Button animation
      uploadScale.value = withSequence(
        withTiming(0.94, { duration: 100 }),
        withTiming(1, { duration: 100 }),
      );

      // Open the real file picker
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: false,
        copyToCacheDirectory: true,
      });

      // User cancelled the picker
      if (result.canceled) {
        return;
      }

      // A file was selected
      const file = result.assets?.[0];

      if (!file) {
        return;
      }

      console.log("Selected file:", file);

      // Now continue with your existing upload animation
      setState("selecting");

      setTimeout(() => {
        setState("uploading");
        simulateProgress();
      }, 800);
    } catch (error) {
      console.error("File picker error:", error);
      setState("idle");
    }
  };

  const simulateProgress = () => {
    let p = 0;
    const interval = setInterval(() => {
      p += 0.04 + Math.random() * 0.04;
      if (p >= 0.5) {
        clearInterval(interval);
        progressWidth.value = withTiming(0.5, { duration: 300 });
        setProgress(50);
        setTimeout(() => {
          setState("encrypting");
          simulateEncryption();
        }, 400);
      } else {
        progressWidth.value = withTiming(p, { duration: 200 });
        setProgress(Math.round(p * 100));
      }
    }, 180);
  };

  const simulateEncryption = () => {
    let p = 0.5;
    const interval = setInterval(() => {
      p += 0.03 + Math.random() * 0.03;
      if (p >= 1) {
        clearInterval(interval);
        progressWidth.value = withTiming(1, { duration: 400 });
        setProgress(100);
        setTimeout(() => {
          setState("complete");
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }, 500);
      } else {
        progressWidth.value = withTiming(p, { duration: 200 });
        setProgress(Math.round(p * 100));
      }
    }, 150);
  };

  const reset = () => {
    setState("idle");
    setProgress(0);
    progressWidth.value = 0;
    setSelectedType(null);
  };

  const getStateLabel = (): string => {
    switch (state) {
      case "selecting":
        return "Preparing file...";
      case "uploading":
        return `Uploading... ${progress}%`;
      case "encrypting":
        return `Encrypting... ${progress}%`;
      case "complete":
        return "Upload Complete!";
      default:
        return "";
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.orbTL} />
      <View style={styles.orbBR} />

      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Upload</Text>
        <TouchableOpacity
          style={[
            styles.iconBtn,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Ionicons name="time-outline" size={18} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <View style={[styles.content, { paddingBottom: botPad + 90 }]}>
        {/* Upload Zone */}
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
                    name="cloud-upload-outline"
                    size={52}
                    color={colors.primary}
                  />
                </View>
                <Text style={[styles.dropTitle, { color: colors.foreground }]}>
                  Tap to select file
                </Text>
                <Text
                  style={[
                    styles.dropSubtitle,
                    { color: colors.mutedForeground },
                  ]}
                >
                  PDF, DOCX, PPTX, XLSX, Images supported
                </Text>
              </>
            )}

            {(state === "uploading" ||
              state === "encrypting" ||
              state === "selecting") && (
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
                        state === "encrypting" ? "lock-closed" : "cloud-upload"
                      }
                      size={52}
                      color={colors.primary}
                    />
                  </View>
                </Animated.View>
                <Text style={[styles.dropTitle, { color: colors.foreground }]}>
                  {getStateLabel()}
                </Text>
                <View
                  style={[
                    styles.progressBar,
                    { backgroundColor: colors.muted },
                  ]}
                >
                  <Animated.View
                    style={[
                      styles.progressFill,
                      progressStyle,
                      {
                        backgroundColor:
                          state === "encrypting"
                            ? colors.success
                            : colors.primary,
                      },
                    ]}
                  />
                </View>
                {state !== "selecting" && (
                  <Text
                    style={[
                      styles.progressLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {state === "encrypting"
                      ? "🔒 AES-256 encryption in progress"
                      : "⬆ Secure transfer active"}
                  </Text>
                )}
              </>
            )}

            {state === "complete" && (
              <>
                <View
                  style={[
                    styles.uploadIconBg,
                    { backgroundColor: "rgba(0,230,118,0.15)" },
                  ]}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={52}
                    color={colors.success}
                  />
                </View>
                <Text style={[styles.dropTitle, { color: colors.foreground }]}>
                  File encrypted & uploaded!
                </Text>
                <Text
                  style={[
                    styles.dropSubtitle,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Your file is now protected with AES-256
                </Text>
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
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

        {state === "idle" && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              File Type
            </Text>
            <View style={styles.typeRow}>
              {FILE_TYPES.map((ft, i) => (
                <TouchableOpacity
                  key={ft.label}
                  onPress={() => setSelectedType(i)}
                  style={[
                    styles.typeBtn,
                    {
                      backgroundColor:
                        selectedType === i ? `${ft.color}18` : colors.card,
                      borderColor:
                        selectedType === i ? `${ft.color}60` : colors.border,
                    },
                  ]}
                >
                  <Ionicons name={ft.icon as any} size={24} color={ft.color} />
                  <Text
                    style={[
                      styles.typeLabel,
                      {
                        color:
                          selectedType === i
                            ? ft.color
                            : colors.mutedForeground,
                      },
                    ]}
                  >
                    {ft.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View
              style={[
                styles.encryptRow,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.encryptLeft}>
                <Ionicons
                  name="shield-checkmark"
                  size={20}
                  color={colors.success}
                />
                <View>
                  <Text
                    style={[styles.encryptTitle, { color: colors.foreground }]}
                  >
                    Encrypt File
                  </Text>
                  <Text
                    style={[
                      styles.encryptSub,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    AES-256 encryption
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setEncryptionEnabled((e) => !e)}
                style={[
                  styles.toggle,
                  {
                    backgroundColor: encryptionEnabled
                      ? colors.success
                      : colors.muted,
                  },
                ]}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    { transform: [{ translateX: encryptionEnabled ? 18 : 2 }] },
                  ]}
                />
              </TouchableOpacity>
            </View>
          </>
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
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flex: 1, paddingHorizontal: 20, gap: 20 },
  dropZone: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 20,
    minHeight: 220,
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
  progressBar: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3 },
  progressLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  resetBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 4,
  },
  resetBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  typeRow: { flexDirection: "row", gap: 10 },
  typeBtn: {
    flex: 1,
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  typeLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  encryptRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  encryptLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  encryptTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  encryptSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  toggle: { width: 44, height: 26, borderRadius: 13, justifyContent: "center" },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
});
