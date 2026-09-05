import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAuth } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserCard";
import {
  useFilesApi,
  formatBytes,
  pickFileFromDevice,
  type PickedFile,
  type ScanSummary,
  type TeammateSummary,
} from "@/lib/filesApi";

/**
 * The secure share pipeline.
 *
 * The file arrives here already picked from the device file explorer. Pressing
 * "Scan & Encrypt" hands it to the server, which runs the three steps below in
 * order and refuses to store anything that fails the first one.
 */
type Stage = "review" | "scanning" | "encrypting" | "storing" | "done" | "blocked";

const PIPELINE_STEPS = [
  {
    key: "scanning" as const,
    icon: "shield-search",
    title: "AI spam & malware scan",
    detail: "Checking the contents for spam, phishing and malicious code",
  },
  {
    key: "encrypting" as const,
    icon: "lock",
    title: "AES-256 encryption",
    detail: "Encrypting the file before it leaves this step",
  },
  {
    key: "storing" as const,
    icon: "database-lock",
    title: "Encrypted storage",
    detail: "Writing the ciphertext to the PostgreSQL vault",
  },
];

const STAGE_ORDER: Stage[] = ["scanning", "encrypting", "storing", "done"];

function fileIconFor(mimeType: string, name: string): { icon: string; color: string } {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mimeType === "application/pdf" || ext === "pdf")
    return { icon: "file-pdf-box", color: "#FF3B5C" };
  if (mimeType.startsWith("image/")) return { icon: "file-image", color: "#B44FFF" };
  if (["doc", "docx"].includes(ext)) return { icon: "file-word", color: "#0066FF" };
  if (["ppt", "pptx"].includes(ext)) return { icon: "file-powerpoint", color: "#FF8C00" };
  if (["xls", "xlsx", "csv"].includes(ext)) return { icon: "file-excel", color: "#00E676" };
  return { icon: "file-document", color: "#7A9BB5" };
}

function riskColor(score: number, colors: ReturnType<typeof useColors>): string {
  if (score >= 70) return colors.destructive;
  if (score >= 35) return colors.warning;
  return colors.success;
}

export default function ShareFile() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    uri?: string;
    name?: string;
    mimeType?: string;
    size?: string;
  }>();
  const { shareFile, listTeammates } = useFilesApi();
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth();

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [picked, setPicked] = useState<PickedFile | null>(
    params.uri
      ? {
          uri: params.uri,
          name: params.name || "untitled",
          mimeType: params.mimeType || "application/octet-stream",
          size: Number(params.size ?? 0),
        }
      : null,
  );

  const [stage, setStage] = useState<Stage>("review");
  const [teammates, setTeammates] = useState<TeammateSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadingTeammates, setLoadingTeammates] = useState(true);
  const [scan, setScan] = useState<ScanSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sharedCount, setSharedCount] = useState(0);

  // Advances the visible stage while the single upload request is in flight.
  // The server really does run scan -> encrypt -> store in this order; only the
  // moment we switch labels is approximate.
  const stageTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearStageTimers = useCallback(() => {
    stageTimers.current.forEach(clearTimeout);
    stageTimers.current = [];
  }, []);

  useEffect(() => clearStageTimers, [clearStageTimers]);

  useEffect(() => {
    // Wait for Clerk: the API helper throws if it has no session token yet,
    // and an empty list would wrongly read as "you have no teammates".
    if (!isAuthLoaded) {
      return;
    }
    if (!isSignedIn) {
      setLoadingTeammates(false);
      return;
    }

    let cancelled = false;

    listTeammates()
      .then((list) => {
        if (!cancelled) setTeammates(list);
      })
      .catch(() => {
        if (!cancelled) setTeammates([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTeammates(false);
      });

    return () => {
      cancelled = true;
    };
    // listTeammates is recreated on every render by the hook; key off auth only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoaded, isSignedIn]);

  const icon = useMemo(
    () => fileIconFor(picked?.mimeType ?? "", picked?.name ?? ""),
    [picked?.mimeType, picked?.name],
  );

  const toggleRecipient = (clerkId: string) => {
    Haptics.selectionAsync();
    setSelected((current) =>
      current.includes(clerkId)
        ? current.filter((id) => id !== clerkId)
        : [...current, clerkId],
    );
  };

  const handlePickAnother = async () => {
    try {
      const next = await pickFileFromDevice();
      if (next) {
        setPicked(next);
        setStage("review");
        setScan(null);
        setErrorMessage(null);
      }
    } catch (error) {
      console.error("File picker error:", error);
      setErrorMessage("Could not open the file picker.");
    }
  };

  const handleStart = async () => {
    if (!picked || stage !== "review") {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setErrorMessage(null);
    setScan(null);
    setStage("scanning");

    clearStageTimers();
    stageTimers.current.push(setTimeout(() => setStage("encrypting"), 2200));
    stageTimers.current.push(setTimeout(() => setStage("storing"), 3600));

    const outcome = await shareFile(picked, { shareWith: selected });

    clearStageTimers();

    if (outcome.ok) {
      setScan(outcome.scan);
      setSharedCount(outcome.sharedWith.length);
      setStage("done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    if (outcome.blocked) {
      setScan(outcome.scan);
      setErrorMessage(outcome.message);
      setStage("blocked");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setErrorMessage(outcome.message);
    setStage("review");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const isRunning =
    stage === "scanning" || stage === "encrypting" || stage === "storing";

  const stepState = (key: Stage): "pending" | "active" | "done" => {
    if (stage === "blocked") {
      return key === "scanning" ? "active" : "pending";
    }
    const currentIndex = STAGE_ORDER.indexOf(stage);
    const stepIndex = STAGE_ORDER.indexOf(key);
    if (currentIndex < 0) return "pending";
    if (stepIndex < currentIndex) return "done";
    if (stepIndex === currentIndex) return "active";
    return "pending";
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.orbTL} />
      <View style={styles.orbBR} />

      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          disabled={isRunning}
          style={[
            styles.iconBtn,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: isRunning ? 0.4 : 1,
            },
          ]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Secure Share
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Selected file */}
        {picked ? (
          <View
            style={[
              styles.fileCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={[styles.fileIcon, { backgroundColor: `${icon.color}18` }]}>
              <MaterialCommunityIcons
                name={icon.icon as any}
                size={30}
                color={icon.color}
              />
            </View>
            <View style={styles.fileInfo}>
              <Text
                style={[styles.fileName, { color: colors.foreground }]}
                numberOfLines={2}
              >
                {picked.name}
              </Text>
              <Text style={[styles.fileMeta, { color: colors.mutedForeground }]}>
                {picked.size > 0 ? formatBytes(picked.size) : "Unknown size"} ·{" "}
                {picked.mimeType}
              </Text>
            </View>
            {stage === "review" && (
              <TouchableOpacity onPress={handlePickAnother} style={styles.swapBtn}>
                <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <TouchableOpacity
            onPress={handlePickAnother}
            style={[
              styles.emptyPicker,
              { borderColor: `${colors.primary}40`, backgroundColor: colors.card },
            ]}
          >
            <Ionicons name="folder-open-outline" size={44} color={colors.primary} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Choose a file to share
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Opens your device file explorer
            </Text>
          </TouchableOpacity>
        )}

        {/* Pipeline */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {stage === "done"
            ? "Completed"
            : stage === "blocked"
              ? "Stopped at the first step"
              : "What happens next"}
        </Text>

        <View style={styles.steps}>
          {PIPELINE_STEPS.map((step) => {
            const state = stepState(step.key);
            const blockedHere = stage === "blocked" && step.key === "scanning";
            const tint = blockedHere
              ? colors.destructive
              : state === "done"
                ? colors.success
                : state === "active"
                  ? colors.primary
                  : colors.mutedForeground;

            return (
              <View
                key={step.key}
                style={[
                  styles.step,
                  {
                    backgroundColor: colors.card,
                    borderColor:
                      state === "pending" ? colors.border : `${tint}55`,
                  },
                ]}
              >
                <View
                  style={[styles.stepIcon, { backgroundColor: `${tint}18` }]}
                >
                  {state === "active" && isRunning && !blockedHere ? (
                    <ActivityIndicator size="small" color={tint} />
                  ) : (
                    <MaterialCommunityIcons
                      name={
                        (blockedHere
                          ? "shield-alert"
                          : state === "done"
                            ? "check"
                            : step.icon) as any
                      }
                      size={20}
                      color={tint}
                    />
                  )}
                </View>
                <View style={styles.stepText}>
                  <Text style={[styles.stepTitle, { color: colors.foreground }]}>
                    {step.title}
                  </Text>
                  <Text
                    style={[styles.stepDetail, { color: colors.mutedForeground }]}
                  >
                    {blockedHere ? "Blocked — nothing was stored" : step.detail}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Scan verdict */}
        {scan && (
          <View
            style={[
              styles.verdictCard,
              {
                backgroundColor:
                  scan.verdict === "flagged"
                    ? `${colors.destructive}12`
                    : `${colors.success}12`,
                borderColor:
                  scan.verdict === "flagged"
                    ? `${colors.destructive}45`
                    : `${colors.success}45`,
              },
            ]}
          >
            <View style={styles.verdictHead}>
              <Ionicons
                name={
                  scan.verdict === "flagged"
                    ? "warning"
                    : "shield-checkmark"
                }
                size={22}
                color={
                  scan.verdict === "flagged" ? colors.destructive : colors.success
                }
              />
              <Text style={[styles.verdictTitle, { color: colors.foreground }]}>
                {scan.verdict === "flagged"
                  ? "Blocked by the AI scan"
                  : "Green signal — file is clean"}
              </Text>
            </View>

            <Text style={[styles.verdictReason, { color: colors.mutedForeground }]}>
              {scan.reason}
            </Text>

            <View style={styles.riskRow}>
              <Text style={[styles.riskLabel, { color: colors.mutedForeground }]}>
                Risk score
              </Text>
              <Text
                style={[styles.riskValue, { color: riskColor(scan.riskScore, colors) }]}
              >
                {scan.riskScore}/100
              </Text>
            </View>
            <View style={[styles.riskBar, { backgroundColor: colors.muted }]}>
              <View
                style={[
                  styles.riskBarFill,
                  {
                    width: `${Math.max(2, Math.min(100, scan.riskScore))}%`,
                    backgroundColor: riskColor(scan.riskScore, colors),
                  },
                ]}
              />
            </View>

            {scan.labels.length > 0 && (
              <View style={styles.labelRow}>
                {scan.labels.map((label) => (
                  <View
                    key={label}
                    style={[
                      styles.label,
                      {
                        backgroundColor: `${colors.destructive}18`,
                        borderColor: `${colors.destructive}35`,
                      },
                    ]}
                  >
                    <Text style={[styles.labelText, { color: colors.destructive }]}>
                      {label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.engineText, { color: colors.mutedForeground }]}>
              Scanned by {scan.engine}
              {!scan.aiAvailable && " · deep content scan unavailable"}
            </Text>
          </View>
        )}

        {/* Recipients */}
        {stage === "review" && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Share with teammates{" "}
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                (optional)
              </Text>
            </Text>

            {loadingTeammates ? (
              <ActivityIndicator color={colors.primary} style={{ marginBottom: 20 }} />
            ) : teammates.length === 0 ? (
              <TouchableOpacity
                onPress={() => router.push("/invite-teammate")}
                style={[
                  styles.noTeammates,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Ionicons name="person-add-outline" size={18} color={colors.primary} />
                <Text style={[styles.noTeammatesText, { color: colors.mutedForeground }]}>
                  No teammates yet — invite someone by email
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.recipients}>
                {teammates.map((teammate) => {
                  const isSelected = selected.includes(teammate.clerkId);
                  const displayName = teammate.name || teammate.email.split("@")[0];
                  return (
                    <TouchableOpacity
                      key={teammate.clerkId}
                      onPress={() => toggleRecipient(teammate.clerkId)}
                      style={[
                        styles.recipient,
                        {
                          backgroundColor: isSelected
                            ? `${colors.primary}15`
                            : colors.card,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <UserAvatar name={displayName} color={colors.accent} size={36} />
                      <View style={styles.recipientInfo}>
                        <Text
                          style={[styles.recipientName, { color: colors.foreground }]}
                          numberOfLines={1}
                        >
                          {displayName}
                        </Text>
                        <Text
                          style={[
                            styles.recipientEmail,
                            { color: colors.mutedForeground },
                          ]}
                          numberOfLines={1}
                        >
                          {teammate.email}
                        </Text>
                      </View>
                      <Ionicons
                        name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                        size={22}
                        color={isSelected ? colors.primary : colors.mutedForeground}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        )}

        {errorMessage && stage !== "blocked" && (
          <View
            style={[
              styles.errorBox,
              {
                backgroundColor: `${colors.destructive}12`,
                borderColor: `${colors.destructive}40`,
              },
            ]}
          >
            <Ionicons name="alert-circle" size={18} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {errorMessage}
            </Text>
          </View>
        )}

        {stage === "done" && (
          <View
            style={[
              styles.successNote,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Ionicons name="lock-closed" size={16} color={colors.success} />
            <Text style={[styles.successNoteText, { color: colors.mutedForeground }]}>
              Stored encrypted with AES-256-GCM
              {sharedCount > 0
                ? ` and shared with ${sharedCount} teammate${sharedCount === 1 ? "" : "s"}.`
                : "."}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action bar */}
      <View
        style={[
          styles.actionBar,
          {
            paddingBottom: (Platform.OS === "web" ? 20 : insets.bottom) + 16,
            backgroundColor: colors.background,
            borderTopColor: colors.border,
          },
        ]}
      >
        {stage === "review" && (
          <TouchableOpacity
            onPress={handleStart}
            disabled={!picked}
            activeOpacity={0.85}
            style={[
              styles.primaryBtn,
              { backgroundColor: picked ? colors.primary : colors.muted },
            ]}
          >
            <Ionicons
              name="shield-checkmark"
              size={18}
              color={picked ? colors.primaryForeground : colors.mutedForeground}
            />
            <Text
              style={[
                styles.primaryBtnText,
                {
                  color: picked ? colors.primaryForeground : colors.mutedForeground,
                },
              ]}
            >
              Scan & Encrypt
            </Text>
          </TouchableOpacity>
        )}

        {isRunning && (
          <View style={[styles.primaryBtn, { backgroundColor: colors.muted }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.primaryBtnText, { color: colors.foreground }]}>
              {stage === "scanning"
                ? "Scanning for threats…"
                : stage === "encrypting"
                  ? "Encrypting…"
                  : "Storing securely…"}
            </Text>
          </View>
        )}

        {(stage === "done" || stage === "blocked") && (
          <View style={styles.doneRow}>
            <TouchableOpacity
              onPress={handlePickAnother}
              style={[
                styles.secondaryBtn,
                { borderColor: colors.border, backgroundColor: colors.card },
              ]}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
                Share another
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.back()}
              style={[styles.primaryBtn, { flex: 1, backgroundColor: colors.primary }]}
            >
              <Text
                style={[styles.primaryBtnText, { color: colors.primaryForeground }]}
              >
                Done
              </Text>
            </TouchableOpacity>
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
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(0,212,255,0.05)",
  },
  orbBR: {
    position: "absolute",
    bottom: 120,
    right: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(0,102,255,0.05)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  fileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  fileIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  fileInfo: { flex: 1, gap: 4 },
  fileName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  fileMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  swapBtn: { padding: 6 },
  emptyPicker: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
  },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginBottom: 12,
  },
  steps: { gap: 10, marginBottom: 24 },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: { flex: 1, gap: 3 },
  stepTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  stepDetail: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  verdictCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    marginBottom: 24,
  },
  verdictHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  verdictTitle: { fontSize: 15, fontFamily: "Inter_700Bold", flex: 1 },
  verdictReason: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  riskRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  riskLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  riskValue: { fontSize: 13, fontFamily: "Inter_700Bold" },
  riskBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  riskBarFill: { height: "100%", borderRadius: 3 },
  labelRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  label: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  labelText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  engineText: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  recipients: { gap: 8, marginBottom: 20 },
  recipient: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  recipientInfo: { flex: 1, gap: 2 },
  recipientName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  recipientEmail: { fontSize: 12, fontFamily: "Inter_400Regular" },
  noTeammates: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 20,
  },
  noTeammatesText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  errorText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  successNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  successNoteText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  actionBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 14,
  },
  primaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  doneRow: { flexDirection: "row", gap: 10 },
  secondaryBtn: {
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
