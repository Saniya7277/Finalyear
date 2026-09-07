import React, { useCallback, useRef, useState } from "react";
import { FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { formatBytes, SecureFileRecord, useFilesApi } from "@/lib/filesApi";

type Tab = "byMe" | "byOthers";
const when = (date?: string) => date ? new Date(date).toLocaleDateString() : "";

export default function Shared() {
  const colors = useColors(); const insets = useSafeAreaInsets(); const api = useFilesApi();
  const apiRef = useRef(api); apiRef.current = api;
  const [tab, setTab] = useState<Tab>("byMe"); const [owned, setOwned] = useState<SecureFileRecord[]>([]); const [received, setReceived] = useState<SecureFileRecord[]>([]); const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => { try { setError(null); const data = await apiRef.current.listFiles(); setOwned(data.owned.filter((file) => (file.shares?.length ?? 0) > 0)); setReceived(data.sharedWithMe); } catch { setError("Could not load shared files."); } }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const files = tab === "byMe" ? owned : received;
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  return <View style={[styles.container, { backgroundColor: colors.background }]}>
    <View style={[styles.header, { paddingTop: topPad + 8 }]}><TouchableOpacity onPress={() => router.back()} style={[styles.icon, { backgroundColor: colors.card, borderColor: colors.border }]}><Ionicons name="arrow-back" size={20} color={colors.foreground} /></TouchableOpacity><Text style={[styles.title, { color: colors.foreground }]}>Shared Files</Text><View style={styles.icon} /></View>
    <View style={[styles.tabs, { backgroundColor: colors.card, borderColor: colors.border }]}>{([ ["byMe", "Shared by Me"], ["byOthers", "Shared by Others"] ] as const).map(([value, label]) => <TouchableOpacity key={value} onPress={() => setTab(value)} style={[styles.tab, tab === value && { backgroundColor: colors.primary }]}><Text style={[styles.tabText, { color: tab === value ? colors.primaryForeground : colors.mutedForeground }]}>{label}</Text></TouchableOpacity>)}</View>
    <FlatList data={files} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} renderItem={({ item }) => <TouchableOpacity onPress={() => router.push(`/file-details/${item.id}`)} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><Ionicons name="lock-closed" size={22} color={colors.primary} /><View style={styles.grow}><Text style={[styles.name, { color: colors.foreground }]}>{item.name}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{item.type.toUpperCase()} · {formatBytes(item.sizeBytes)}</Text>{tab === "byMe" ? <Text style={[styles.detail, { color: colors.mutedForeground }]}>{item.shares?.length === 1 ? `Shared with ${item.shares[0].name || item.shares[0].email} · ${item.shares[0].permission}` : `Shared with ${item.shares?.length ?? 0} teammates`}</Text> : <Text style={[styles.detail, { color: colors.mutedForeground }]}>Shared by {item.sharedBy?.name || item.sharedBy?.email} · {item.permission} · {when(item.sharedAt)}</Text>}</View><Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} /></TouchableOpacity>} ListEmptyComponent={<View style={styles.empty}><Ionicons name="share-social-outline" size={48} color={colors.mutedForeground} /><Text style={[styles.emptyTitle, { color: colors.foreground }]}>{error || (tab === "byMe" ? "Not sharing any files" : "No files shared with you")}</Text>{error && <TouchableOpacity onPress={() => void refresh()}><Text style={[styles.retry, { color: colors.primary }]}>Try again</Text></TouchableOpacity>}</View>} />
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 16 }, icon: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" }, title: { fontSize: 20, fontFamily: "Inter_700Bold" }, tabs: { flexDirection: "row", marginHorizontal: 20, borderRadius: 12, borderWidth: 1, padding: 4, marginBottom: 16 }, tab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" }, tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold" }, list: { paddingHorizontal: 20, paddingBottom: 28 }, card: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 }, grow: { flex: 1 }, name: { fontSize: 15, fontFamily: "Inter_600SemiBold" }, meta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 }, detail: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 5 }, empty: { alignItems: "center", paddingTop: 60, gap: 12 }, emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" }, retry: { fontSize: 14, fontFamily: "Inter_600SemiBold" } });
