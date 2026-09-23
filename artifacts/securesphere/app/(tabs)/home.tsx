import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ImageBackground,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
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
  { icon: "people", label: "Team", color: "#21E6A5", route: "/members" },
  { icon: "share-social", label: "Share", color: "#19D3F3", action: "share" },
  {
    icon: "sparkles",
    label: "AI Assist",
    color: "#A855F7",
    route: "/ai-assistant",
  },
];

/** Purely decorative, pointer-free atmosphere kept behind the real Home UI. */
function SecurityAtmosphere() {
  return <View pointerEvents="none" style={styles.atmosphere}>
    <ImageBackground
      source={require("../../assets/images/backgound.png")}
      resizeMode="cover"
      style={styles.backgroundImageContainer}
      imageStyle={styles.backgroundImage}
    >
      <View style={styles.backgroundOverlay} />
    </ImageBackground>
  </View>;
}

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
      <SecurityAtmosphere />
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
              Your secure workspace
            </Text>
            <Text style={[styles.greetName, { color: colors.foreground }]}>
              Good evening, {currentUser.name.split(" ")[0]} 👋
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
            <TouchableOpacity onPress={() => router.push("/(tabs)/profile")}>
              <UserAvatar
                name={currentUser.name}
                color={currentUser.avatarColor}
                size={40}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Security Score + Storage */}
        <View style={[styles.securityHero, { backgroundColor: "rgba(17,36,56,0.58)", borderColor: "rgba(25,211,243,0.36)" }]}>
          <View style={styles.securityDetail}>
            <SecurityScore score={currentUser.securityScore} size={104} />
            <View style={styles.securityCopy}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Security status</Text>
              <Text style={[styles.securityHeadline, { color: colors.foreground }]}>Your workspace is secure</Text>
              <View style={styles.secureLine}><Ionicons name="checkmark-circle" size={14} color={colors.success} /><Text style={[styles.secureText, { color: colors.mutedForeground }]} numberOfLines={1}>Encryption active</Text></View>
              <TouchableOpacity style={styles.improveBtn}><Text style={[styles.improveBtnText, { color: colors.primary }]}>View security</Text><Ionicons name="arrow-forward" size={13} color={colors.primary} /></TouchableOpacity>
            </View>
          </View>
          <View style={[styles.scoreRight, { borderTopColor: colors.border }]}>
              <Text
                style={[styles.sectionLabel, { color: colors.mutedForeground }]}
              >
                Storage
              </Text>
              <View style={styles.storageInfo}>
                <Text
                  style={[styles.storageUsed, { color: colors.foreground }]}
                >
                  {currentUser.storageUsed} GB / {currentUser.storageTotal} GB
                </Text>
                <Text
                  style={[
                    styles.storageMeta,
                    { color: colors.mutedForeground },
                  ]}
                >
                  secure storage used
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
                  Encryption active
                </Text>
              </View>
          </View>
        </View>

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
              <Text style={[styles.actionLabel, { color: colors.foreground }]} numberOfLines={1}>{action.label}</Text><View style={[styles.actionArrow, { backgroundColor: `${action.color}20` }]}><Ionicons name="arrow-forward" size={14} color={action.color} /></View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Workspace overview */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          Workspace overview
        </Text>
        <View style={[styles.statsRow, { backgroundColor: "rgba(17,36,56,0.54)", borderColor: "rgba(25,211,243,0.28)" }]}>
          {[
            { label: "Files", value: isLoading ? "…" : loadError ? "—" : `${files.length}`, icon: "documents", color: colors.primary },
            { label: "Shared", value: isLoading ? "…" : loadError ? "—" : `${sharedCount}`, icon: "share-social", color: colors.mutedForeground },
            { label: "Encrypted", value: isLoading ? "…" : loadError ? "—" : `${encryptedCount}`, icon: "lock-closed", color: colors.success },
          ].map((item, index) => <View key={item.label} style={[styles.metric, index > 0 && { borderLeftColor: colors.border, borderLeftWidth: 1 }]}>
            <Ionicons name={item.icon as any} size={17} color={item.color} />
            <Text style={[styles.metricValue, { color: colors.foreground }]}>{item.value}</Text>
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
          </View>)}
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
        <View style={[styles.recentList, { backgroundColor: "rgba(17,36,56,0.40)", borderColor: "rgba(25,211,243,0.18)" }]}>
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
        </View>
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  atmosphere: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  backgroundImageContainer: { ...StyleSheet.absoluteFillObject },
  backgroundImage: { resizeMode: "cover" },
  backgroundOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(3, 11, 24, 0.28)" },
  scroll: { paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  greeting: { flex: 1, minWidth: 0, gap: 2 },
  greetLine: { fontSize: 13, fontFamily: "Inter_400Regular" },
  greetName: { fontSize: 24, fontFamily: "Inter_700Bold" },
  headerActions: { flexDirection: "row", flexShrink: 0, alignItems: "center", gap: 12 },
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
  securityHero: { marginBottom: 26, padding: 18, borderRadius: 18, borderWidth: 1, shadowColor: "#19D3F3", shadowOpacity: 0.16, shadowRadius: 18, elevation: 4 },
  scoreRight: { gap: 8, marginTop: 14, paddingTop: 14, borderTopWidth: 1 },
  securityDetail: { flexDirection: "row", alignItems: "center", gap: 14 },
  securityCopy: { flex: 1, minWidth: 0, gap: 6 },
  securityHeadline: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  secureLine: { flexDirection: "row", alignItems: "center", gap: 5 },
  secureText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, textTransform: "uppercase" },
  improveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
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
  actionsRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 10, marginBottom: 28 },
  actionBtn: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(25,211,243,0.25)",
    backgroundColor: "rgba(17,36,56,0.54)",
    gap: 8,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  actionArrow: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  statsRow: { flexDirection: "row", marginBottom: 28, paddingVertical: 17, borderRadius: 15, borderWidth: 1 },
  metric: { flex: 1, alignItems: "center", gap: 4, paddingHorizontal: 4 },
  metricValue: { fontSize: 22, fontFamily: "Inter_700Bold" },
  metricLabel: { fontSize: 11, fontFamily: "Inter_500Medium" },
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  recentList: { borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, overflow: "hidden" },
  seeAll: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  recentState: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingVertical: 20,
  },
  recentStateWrap: { alignItems: "center" },
  retryText: { fontSize: 14, fontFamily: "Inter_600SemiBold", paddingBottom: 20 },
});
