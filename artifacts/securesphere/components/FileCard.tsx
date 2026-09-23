import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { SecureFile, FileType } from "@/data/mockData";

function getFileIcon(type: FileType): { name: string; color: string } {
  switch (type) {
    case "pdf": return { name: "file-pdf-box", color: "#FF5C6C" };
    case "docx": return { name: "file-word", color: "#19D3F3" };
    case "pptx": return { name: "file-powerpoint", color: "#FFB547" };
    case "xlsx": return { name: "file-excel", color: "#21E6A5" };
    case "image": return { name: "file-image", color: "#A855F7" };
    default: return { name: "file-document", color: "#8EA6BC" };
  }
}

export function FileCard({ file, onPress }: { file: SecureFile; onPress?: () => void }) {
  const colors = useColors(); const icon = getFileIcon(file.type);
  return <TouchableOpacity activeOpacity={0.72} onPress={onPress} style={[styles.row, { borderBottomColor: colors.border }]}>
    <View style={[styles.iconBox, { backgroundColor: `${icon.color}18` }]}><MaterialCommunityIcons name={icon.name as any} size={25} color={icon.color} /></View>
    <View style={styles.info}><Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{file.name}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>{file.type.toUpperCase()} · {file.size} · {file.modifiedAt}</Text></View>
    <View style={styles.badges}>{file.encrypted && <View style={[styles.badge, { backgroundColor: "rgba(25,211,243,0.10)", borderColor: "rgba(25,211,243,0.22)" }]}><Ionicons name="lock-closed" size={10} color={colors.primary} /></View>}{file.shared && <View style={[styles.badge, { backgroundColor: "rgba(142,166,188,0.10)", borderColor: "rgba(142,166,188,0.2)" }]}><Ionicons name="people" size={10} color={colors.mutedForeground} /></View>}</View>
  </TouchableOpacity>;
}
const styles = StyleSheet.create({ row: { flexDirection: "row", alignItems: "center", minHeight: 68, paddingVertical: 11, gap: 12, borderBottomWidth: 1 }, iconBox: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" }, info: { flex: 1, gap: 4 }, name: { fontSize: 15, fontFamily: "Inter_600SemiBold" }, meta: { fontSize: 12, fontFamily: "Inter_400Regular" }, badges: { flexDirection: "row", gap: 6 }, badge: { width: 24, height: 24, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" } });
