import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { GlassCard } from "@/components/GlassCard";
import { StatCard } from "@/components/StatCard";
import { SecurityScore } from "@/components/SecurityScore";
import { FileCard } from "@/components/FileCard";
import { UserAvatar } from "@/components/UserCard";
import type { SecureFile } from "@/data/mockData";
import { formatBytes, useFilesApi } from "@/lib/filesApi";
import type { SecureFileRecord } from "@/lib/filesApi";

type QuickAction = {
  icon: string;
  label: string;
  color: string;
  /** Plain navigation target, or "share" to open the secure share pipeline. */
  route?: string;
  action?: "share";
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: "cloud-upload",
    label: "Upload",
    color: "#00D4FF",
    route: "/(tabs)/upload",
  },
  { icon: "share-social", label: "Share", color: "#0066FF", action: "share" },
  { icon: "people", label: "Teammates", color: "#B44FFF", route: "/members" },
  {
    icon: "sparkles",
    label: "AI Assist",
    color: "#FF8C00",
    route: "/ai-assistant",
  },
];

function toFileCard(record: SecureFileRecord): SecureFile {
  const modified = new Date(record.modifiedAt);

  return {
    id: record.id,
    name: record.name,
    type: record.type,
    size: formatBytes(record.sizeBytes),
    encrypted: record.encrypted,
    shared: (record.shares?.length ?? 0) > 0,
    ownerId: record.ownerId,
    sharedWith: record.shares?.map((share) => share.clerkId) ?? [],
    createdAt: record.createdAt,
    modifiedAt: Number.isNaN(modified.getTime())
      ? record.modifiedAt
      : modified.toLocaleDateString(),
  };
}

export default function Home() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser, notificationCount } = useApp();
  const api = useFilesApi();
  const apiRef = useRef(api);
  apiRef.current = api;
  const [files, setFiles] = useState<SecureFileRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const { owned } = await apiRef.current.listFiles();
      setFiles(owned);
    } catch (error) {
      setFiles([]);
      setLoadError(
        error instanceof Error ? error.message : "Could not load your files.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadFiles();
    }, [loadFiles]),
  );

  const recentFiles = [...files]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 4)
    .map(toFileCard);
  const encryptedCount = files.filter((file) => file.encrypted).length;
  const sharedCount = files.filter(
    (file) => (file.shares?.length ?? 0) > 0,
  ).length;

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const storagePercent = currentUser.storageUsed / currentUser.storageTotal;

  /**
   * Share starts at the device file explorer. Once a file is chosen it moves to
   * the secure share screen, which runs the AI scan, then encryption, then
   * storage — in that order, and only proceeds while each step passes.
   */
  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/share-file");
  };

  const handleQuickAction = (action: QuickAction) => {
    if (action.action === "share") {
      handleShare();
      return;
    }
    if (action.route) {
      router.push(action.route as any);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Decorative orbs */}
      <View style={styles.orbTL} />
      <View style={styles.orbBR} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topPad + 16, paddingBottom: 100 },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.greeting}>
            <Text style={[styles.greetLine, { color: colors.mutedForeground }]}>
              Good morning,
            </Text>
            <Text style={[styles.greetName, { color: colors.foreground }]}>
              {currentUser.name.split(" ")[0]}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[
                styles.iconBtn,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() => router.push("/notifications")}
            >
              <Ionicons
                name="notifications-outline"
                size={20}
                color={colors.foreground}
              />
              {notificationCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{notificationCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/settings")}>
              <UserAvatar
                name={currentUser.name}
                color={currentUser.avatarColor}
                size={40}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Security Score + Storage */}
        <GlassCard style={styles.scoreCard} glowColor="#00D4FF">
          <View style={styles.scoreRow}>
            <View style={styles.scoreLeft}>
              <Text
                style={[styles.sectionLabel, { color: colors.mutedForeground }]}
              >
                Security Score
              </Text>
              <SecurityScore score={currentUser.securityScore} size={130} />
              <TouchableOpacity
                style={[styles.improveBtn, { borderColor: colors.border }]}
              >
                <Text
                  style={[styles.improveBtnText, { color: colors.primary }]}
                >
                  Improve Score
                </Text>
                <Ionicons
                  name="chevron-forward"
                  size={13}
                  color={colors.primary}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.scoreRight}>
              <Text
                style={[styles.sectionLabel, { color: colors.mutedForeground }]}
              >
                Storage
              </Text>
              <View style={styles.storageInfo}>
                <Text
                  style={[styles.storageUsed, { color: colors.foreground }]}
                >
                  {currentUser.storageUsed} GB
                </Text>
                <Text
                  style={[
                    styles.storageMeta,
                    { color: colors.mutedForeground },
                  ]}
                >
                  of {currentUser.storageTotal} GB
                </Text>
              </View>
              <View
                style={[styles.storageBar, { backgroundColor: colors.muted }]}
              >
                <View
                  style={[
                    styles.storageBarFill,
                    {
                      width: `${storagePercent * 100}%`,
                      backgroundColor:
                        storagePercent > 0.8 ? colors.warning : colors.primary,
                    },
                  ]}
                />
              </View>
              <Text
                style={[styles.storagePct, { color: colors.mutedForeground }]}
              >
                {Math.round(storagePercent * 100)}% used
              </Text>

              <View style={styles.encryptionStatus}>
                <Ionicons
                  name="shield-checkmark"
                  size={14}
                  color={colors.success}
                />
                <Text
                  style={[
                    styles.encryptionStatusText,
                    { color: colors.success },
                  ]}
                >
                  AES-256 Active
                </Text>
              </View>
            </View>
          </View>
        </GlassCard>

        {/* Quick Actions */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Quick Actions
        </Text>
        <View style={styles.actionsRow}>
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.label}
              activeOpacity={0.75}
              onPress={() => handleQuickAction(action)}
              style={[
                styles.actionBtn,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.actionIcon,
                  { backgroundColor: `${action.color}18` },
                ]}
              >
                <Ionicons
                  name={action.icon as any}
                  size={22}
                  color={action.color}
                />
              </View>
              <Text
                style={[styles.actionLabel, { color: colors.mutedForeground }]}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stats */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Overview
        </Text>
        <View style={styles.statsRow}>
          <StatCard
            label="Total Files"
            value={isLoading ? "…" : loadError ? "—" : `${files.length}`}
            icon="documents"
            color={colors.primary}
          />
          <StatCard
            label="Shared"
            value={isLoading ? "…" : loadError ? "—" : `${sharedCount}`}
            icon="share-social"
            color={colors.accent}
          />
          <StatCard
            label="Encrypted"
            value={isLoading ? "…" : loadError ? "—" : `${encryptedCount}`}
            icon="lock-closed"
            color={colors.success}
          />
        </View>

        {/* Recent Files */}
        <View style={styles.recentHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Recent Files
          </Text>
          <TouchableOpacity onPress={() => router.push("/(tabs)/files")}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>
              See all
            </Text>
          </TouchableOpacity>
        </View>
        {isLoading ? (
          <Text style={[styles.recentState, { color: colors.mutedForeground }]}>
            Loading files…
          </Text>
        ) : loadError ? (
          <View style={styles.recentStateWrap}>
            <Text style={[styles.recentState, { color: colors.mutedForeground }]}>
              Could not load recent files.
            </Text>
            <TouchableOpacity onPress={() => void loadFiles()}>
              <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : recentFiles.length === 0 ? (
          <Text style={[styles.recentState, { color: colors.mutedForeground }]}>
            No files yet. Upload your first file to see it here.
          </Text>
        ) : (
          recentFiles.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              onPress={() => router.push(`/file-details/${file.id}`)}
            />
          ))
        )}
      </ScrollView>

      {/* Floating Upload Button */}
      <TouchableOpacity
        style={[styles.fab, { shadowColor: colors.primary }]}
        activeOpacity={0.85}
        onPress={() => router.push("/(tabs)/upload")}
      >
        <View style={styles.fabInner}>
          <Ionicons name="cloud-upload" size={24} color="#050B18" />
        </View>
      </TouchableOpacity>
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
    top: 200,
    right: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(0,102,255,0.05)",
  },
  scroll: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  greeting: { gap: 2 },
  greetLine: { fontSize: 13, fontFamily: "Inter_400Regular" },
  greetName: { fontSize: 24, fontFamily: "Inter_700Bold" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FF3B5C",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
  scoreCard: { marginBottom: 24 },
  scoreRow: { flexDirection: "row", gap: 16 },
  scoreLeft: { flex: 1, alignItems: "center", gap: 8 },
  scoreRight: { flex: 1, gap: 8, justifyContent: "center" },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  improveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  improveBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  storageInfo: { gap: 2 },
  storageUsed: { fontSize: 22, fontFamily: "Inter_700Bold" },
  storageMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  storageBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  storageBarFill: { height: "100%", borderRadius: 3 },
  storagePct: { fontSize: 11, fontFamily: "Inter_400Regular" },
  encryptionStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  encryptionStatusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 14 },
  actionsRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 24 },
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  seeAll: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  recentState: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingVertical: 20,
  },
  recentStateWrap: { alignItems: "center" },
  retryText: { fontSize: 14, fontFamily: "Inter_600SemiBold", paddingBottom: 20 },
  fab: {
    position: "absolute",
    bottom: 90,
    right: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  fabInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#00D4FF",
    alignItems: "center",
    justifyContent: "center",
  },
});
