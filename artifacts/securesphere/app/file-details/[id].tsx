import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "@clerk/expo";
import * as FileSystem from "expo-file-system/legacy";
import { useColors } from "@/hooks/useColors";
import { GlassCard } from "@/components/GlassCard";
import { decryptFileData } from "@/lib/encryption";
import { unwrapFileKey } from "@/lib/deviceKeys";
import { FileDetailsResponse, formatBytes, useFilesApi } from "@/lib/filesApi";

const icons: Record<string, { icon: string; color: string }> = { pdf: { icon: "file-pdf-box", color: "#FF3B5C" }, docx: { icon: "file-word", color: "#0066FF" }, pptx: { icon: "file-powerpoint", color: "#FF8C00" }, xlsx: { icon: "file-excel", color: "#00E676" }, image: { icon: "file-image", color: "#B44FFF" }, txt: { icon: "file-document", color: "#7A9BB5" } };
function base64(bytes: Uint8Array) { let value = ""; for (let start = 0; start < bytes.length; start += 0x8000) value += String.fromCharCode(...bytes.subarray(start, start + 0x8000)); return btoa(value); }

export default function FileDetails() {
  const { id } = useLocalSearchParams<{ id: string }>(); const colors = useColors(); const insets = useSafeAreaInsets(); const { user } = useUser(); const api = useFilesApi(); const apiRef = useRef(api); apiRef.current = api;
  const [details, setDetails] = useState<FileDetailsResponse | null>(null); const [error, setError] = useState<string | null>(null); const [downloading, setDownloading] = useState(false);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const load = useCallback(async () => { if (!id) return; try { setError(null); setDetails(await apiRef.current.getFile(id)); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load file."); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  const download = async () => {
    if (!details || !user?.id) return;
    try {
      setDownloading(true); setError(null);
      const keyShare = await apiRef.current.getKeyShare(details.file.id);
      const fileKey = await unwrapFileKey(user.id, keyShare.ownerPublicKey as JsonWebKey, details.file.id, keyShare.wrappedFileKey, keyShare.wrappingIv);
      const ciphertext = await apiRef.current.downloadCiphertext(details.file.id);
      const plaintext = decryptFileData(ciphertext, fileKey, keyShare.fileIv);
      if (Platform.OS === "web") {
        const href = URL.createObjectURL(new Blob([new Uint8Array(plaintext)], { type: details.file.mimeType }));
        const anchor = document.createElement("a"); anchor.href = href; anchor.download = details.file.name; anchor.click(); URL.revokeObjectURL(href);
      } else {
        const uri = `${FileSystem.documentDirectory}${details.file.name.replace(/[\\/:*?"<>|]/g, "_")}`;
        await FileSystem.writeAsStringAsync(uri, base64(plaintext), { encoding: FileSystem.EncodingType.Base64 });
        Alert.alert("Saved securely", `Decrypted file saved locally.\n${uri}`, [{ text: "Open", onPress: () => { void Linking.openURL(uri); } }, { text: "OK" }]);
      }
      plaintext.fill(0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Secure download failed."); }
    finally { setDownloading(false); }
  };
  if (!details) return <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}><Text style={[styles.error, { color: colors.mutedForeground }]}>{error || "Loading file…"}</Text>{error && <TouchableOpacity onPress={() => void load()}><Text style={{ color: colors.primary }}>Try again</Text></TouchableOpacity>}</View>;
  const { file, isOwner, sharedWith } = details; const icon = icons[file.type] ?? icons.txt;
  return <View style={[styles.container, { backgroundColor: colors.background }]}><View style={[styles.header, { paddingTop: topPad + 8 }]}><TouchableOpacity onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}><Ionicons name="arrow-back" size={20} color={colors.foreground} /></TouchableOpacity><Text style={[styles.headerTitle, { color: colors.foreground }]}>File Details</Text><View style={styles.back} /></View><ScrollView contentContainerStyle={styles.scroll}><GlassCard style={styles.hero} glowColor={icon.color}><View style={[styles.icon, { backgroundColor: `${icon.color}18` }]}><MaterialCommunityIcons name={icon.icon as any} size={64} color={icon.color} /></View><Text style={[styles.fileName, { color: colors.foreground }]}>{file.name}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{formatBytes(file.sizeBytes)} · {file.type.toUpperCase()}</Text><Text style={[styles.encrypted, { color: colors.success }]}>AES-256-GCM encrypted</Text></GlassCard><View style={styles.actions}>{isOwner ? <TouchableOpacity onPress={() => router.push({ pathname: "/share-file", params: { fileId: file.id } })} style={[styles.action, { backgroundColor: colors.card, borderColor: colors.border }]}><Ionicons name="share-social" size={22} color={colors.accent} /><Text style={[styles.actionText, { color: colors.foreground }]}>Share</Text></TouchableOpacity> : <TouchableOpacity disabled={downloading} onPress={() => void download()} style={[styles.action, { backgroundColor: colors.card, borderColor: colors.border }]}>{downloading ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="cloud-download" size={22} color={colors.primary} />}<Text style={[styles.actionText, { color: colors.foreground }]}>{downloading ? "Decrypting…" : "Secure Download"}</Text></TouchableOpacity>}</View>{error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}<GlassCard><Text style={[styles.section, { color: colors.foreground }]}>File Info</Text><Text style={[styles.info, { color: colors.mutedForeground }]}>Created: {new Date(file.createdAt).toLocaleDateString()}</Text><Text style={[styles.info, { color: colors.mutedForeground }]}>Access: {isOwner ? "Owner" : `${file.permission ?? "viewer"} · shared by ${file.sharedBy?.name || file.sharedBy?.email}`}</Text></GlassCard>{isOwner && sharedWith.length > 0 && <GlassCard><Text style={[styles.section, { color: colors.foreground }]}>Shared With</Text>{sharedWith.map((share) => <View key={share.clerkId} style={styles.recipient}><View><Text style={[styles.recipientName, { color: colors.foreground }]}>{share.name || share.email}</Text><Text style={[styles.info, { color: colors.mutedForeground }]}>{share.email} · {share.permission} · {new Date(share.createdAt).toLocaleDateString()}</Text></View></View>)}</GlassCard>}</ScrollView></View>;
}
const styles = StyleSheet.create({ container: { flex: 1 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 12 }, back: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" }, headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" }, scroll: { padding: 20, gap: 16 }, hero: { alignItems: "center", gap: 10, paddingVertical: 28 }, icon: { width: 100, height: 100, borderRadius: 24, alignItems: "center", justifyContent: "center" }, fileName: { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" }, meta: { fontSize: 13, fontFamily: "Inter_400Regular" }, encrypted: { fontSize: 12, fontFamily: "Inter_600SemiBold" }, actions: { flexDirection: "row" }, action: { flex: 1, alignItems: "center", gap: 6, padding: 14, borderRadius: 14, borderWidth: 1 }, actionText: { fontSize: 13, fontFamily: "Inter_600SemiBold" }, section: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10 }, info: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 }, recipient: { paddingVertical: 9 }, recipientName: { fontSize: 14, fontFamily: "Inter_600SemiBold" }, error: { textAlign: "center", margin: 20, fontSize: 14, fontFamily: "Inter_400Regular" } });
