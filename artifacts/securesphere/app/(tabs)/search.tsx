import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { FileCard } from "@/components/FileCard";
import type { SecureFile } from "@/data/mockData";
import { formatBytes, type SecureFileRecord, useFilesApi } from "@/lib/filesApi";

type Filter = "All" | "My Files" | "Shared";
const toCard = (file: SecureFileRecord, shared: boolean): SecureFile => ({ id: file.id, name: file.name, type: file.type, size: formatBytes(file.sizeBytes), encrypted: file.encrypted, shared, ownerId: file.ownerId, sharedWith: [], createdAt: file.createdAt, modifiedAt: new Date(file.modifiedAt).toLocaleDateString() });

export default function Search() {
  const colors = useColors(); const insets = useSafeAreaInsets(); const { listFiles } = useFilesApi(); const apiRef = useRef(listFiles); apiRef.current = listFiles;
  const [all, setAll] = useState<SecureFile[]>([]); const [query, setQuery] = useState(""); const [filter, setFilter] = useState<Filter>("All"); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(null); try { const { owned, sharedWithMe } = await apiRef.current(); setAll([...owned.map(file => toCard(file, false)), ...sharedWithMe.map(file => toCard(file, true))]); } catch (cause) { setAll([]); setError(cause instanceof Error ? cause.message : "Could not load authorized files."); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const needle = query.trim().toLocaleLowerCase();
  const results = all.filter(file => (!needle || file.name.toLocaleLowerCase().includes(needle)) && (filter === "All" || filter === "Shared" ? (filter !== "Shared" || file.shared) : !file.shared));
  const top = Platform.OS === "web" ? 67 : insets.top;
  return <View style={[s.container, { backgroundColor: colors.background }]}>
    <View style={[s.header, { paddingTop: top + 16 }]}><View><Text style={[s.title, { color: colors.foreground }]}>Secure Search</Text><Text style={[s.caption, { color: colors.success }]}>Local filename search · Encrypted files stay encrypted</Text></View><Ionicons name="lock-closed" size={18} color={colors.success} /></View>
    <View style={[s.search, { backgroundColor: colors.card, borderColor: colors.border }]}><Ionicons name="search" size={20} color={colors.mutedForeground} /><TextInput value={query} onChangeText={setQuery} style={[s.input, { color: colors.foreground }]} placeholder="Search authorized file names" placeholderTextColor={colors.mutedForeground} />{query && <TouchableOpacity onPress={() => setQuery("")}><Ionicons name="close-circle" size={18} color={colors.mutedForeground} /></TouchableOpacity>}</View>
    <View style={s.filters}>{(["All", "My Files", "Shared"] as Filter[]).map(item => <TouchableOpacity key={item} onPress={() => setFilter(item)} style={[s.chip, filter === item ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={{ color: filter === item ? colors.primaryForeground : colors.mutedForeground }}>{item}</Text></TouchableOpacity>)}</View>
    {error && <View style={[s.error, { borderColor: colors.border }]}><Text style={{ color: colors.mutedForeground }}>{error}</Text><TouchableOpacity onPress={() => void load()}><Text style={{ color: colors.primary }}>Retry</Text></TouchableOpacity></View>}
    <FlatList data={results} keyExtractor={item => item.id} refreshing={loading} onRefresh={() => void load()} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === "web" ? 84 : 90 }} ListHeaderComponent={!loading ? <Text style={[s.count, { color: colors.mutedForeground }]}>{needle ? `${results.length} matching authorized file${results.length === 1 ? "" : "s"}` : `${results.length} authorized file${results.length === 1 ? "" : "s"}`}</Text> : null} renderItem={({ item }) => <FileCard file={item} onPress={() => router.push(`/file-details/${item.id}`)} />} ListEmptyComponent={<View style={s.empty}>{loading ? <ActivityIndicator color={colors.primary} /> : <><Ionicons name="search-outline" size={48} color={colors.mutedForeground} /><Text style={[s.emptyTitle, { color: colors.foreground }]}>{error ? "Search unavailable" : "No matching files"}</Text><Text style={{ color: colors.mutedForeground, textAlign: "center" }}>{error ? "Check your connection and try again." : "Search runs locally over metadata already authorized for this device."}</Text></>}</View>} />
  </View>;
}
const s = StyleSheet.create({ container: { flex: 1 }, header: { paddingHorizontal: 20, paddingBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, title: { fontSize: 26, fontFamily: "Inter_700Bold" }, caption: { fontSize: 11, marginTop: 3, fontFamily: "Inter_500Medium" }, search: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, height: 50, paddingHorizontal: 14, gap: 10, borderWidth: 1, borderRadius: 14 }, input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" }, filters: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingVertical: 14 }, chip: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18 }, count: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 10 }, error: { marginHorizontal: 20, marginBottom: 6, padding: 10, borderWidth: 1, borderRadius: 10, flexDirection: "row", justifyContent: "space-between" }, empty: { minHeight: 300, alignItems: "center", justifyContent: "center", paddingHorizontal: 35, gap: 12 }, emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" } });
