import React, { useCallback, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "@/components/UserCard";
import { useFilesApi, type DevicePublicKey, type TeammateSummary } from "@/lib/filesApi";
import { useChatApi, type EncryptedMessage } from "@/lib/chatApi";
import { decryptChatMessage, encryptChatMessage } from "@/lib/chatCrypto";
import { unwrapMessageKey, wrapMessageKey } from "@/lib/deviceKeys";

type VisibleMessage = { id: string; text: string; mine: boolean; createdAt: string; failed?: boolean };
const nameOf = (person: TeammateSummary) => person.name?.trim() || person.email;
const avatarColor = (id: string) => ["#00D4FF", "#B44FFF", "#00E676", "#FF8C00", "#FF3B5C"][id.charCodeAt(0) % 5];
const jwk = (key: DevicePublicKey): JsonWebKey => typeof key.publicKey === "string" ? JSON.parse(key.publicKey) as JsonWebKey : key.publicKey;

export default function Chat() {
  const colors = useColors(); const insets = useSafeAreaInsets(); const { userId } = useAuth();
  const filesApi = useFilesApi(); const chatApi = useChatApi();
  const filesRef = useRef(filesApi); filesRef.current = filesApi;
  const chatRef = useRef(chatApi); chatRef.current = chatApi;
  const [teammates, setTeammates] = useState<TeammateSummary[]>([]); const [selected, setSelected] = useState<TeammateSummary | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null); const [messages, setMessages] = useState<VisibleMessage[]>([]);
  const [draft, setDraft] = useState(""); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);

  const decrypt = useCallback(async (encrypted: EncryptedMessage[], me: DevicePublicKey, myKeys: DevicePublicKey[], teammateKeys: DevicePublicKey[]): Promise<VisibleMessage[]> => {
    if (!userId) return [];
    return Promise.all(encrypted.map(async message => {
      const mine = message.senderId === userId;
      try {
        const senderKey = (mine ? myKeys : teammateKeys).find((key) => key.id === message.senderDeviceKeyId);
        if (!senderKey || !message.deviceWrappedMessageKey || !message.deviceWrappingIv) throw new Error("Message key is unavailable for this device.");
        const keyHex = await unwrapMessageKey(userId, jwk(senderKey), message.conversationId, message.iv, message.deviceWrappedMessageKey, message.deviceWrappingIv);
        return { id: message.id, mine, createdAt: message.createdAt, text: decryptChatMessage(message.ciphertext, keyHex, message.iv) };
      } catch { return { id: message.id, mine, createdAt: message.createdAt, failed: true, text: "Unable to decrypt this message on this device." }; }
    }));
  }, [userId]);
  const loadTeammates = useCallback(async () => { setLoading(true); setError(null); try { setTeammates(await filesRef.current.listTeammates()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load teammates."); } finally { setLoading(false); } }, []);
  useFocusEffect(useCallback(() => { void loadTeammates(); }, [loadTeammates]));
  const open = async (teammate: TeammateSummary, existingId?: string) => {
    if (!userId) return; setBusy(true); setError(null);
    try {
      const conversation = existingId ? { id: existingId } : await chatRef.current.openConversation(teammate.clerkId);
      const [mine, mineKeys, theirs] = await Promise.all([filesRef.current.getMyDeviceKey(), filesRef.current.getMyDeviceKeys(), filesRef.current.getTeammateDeviceKeys(teammate.clerkId)]);
      const encrypted = await chatRef.current.listMessages(conversation.id, mine.id);
      setSelected(teammate); setConversationId(conversation.id); setMessages(await decrypt(encrypted, mine, mineKeys, theirs));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load the secure conversation."); } finally { setBusy(false); }
  };
  const send = async () => {
    const plaintext = draft.trim(); if (!plaintext || !selected || !conversationId || !userId || busy) return;
    setBusy(true); setError(null);
    try {
      const [mine, mineKeys, theirs] = await Promise.all([filesApi.getMyDeviceKey(), filesApi.getMyDeviceKeys(), filesApi.getTeammateDeviceKeys(selected.clerkId)]);
      // This is the only plaintext variable. request() receives only encrypted metadata below.
      const encrypted = encryptChatMessage(plaintext);
      const senderDeviceKeys = await Promise.all(mineKeys.map(async (sender) => ({ recipientDeviceKeyId: sender.id, ...(await wrapMessageKey(userId, jwk(sender), conversationId, encrypted.iv, encrypted.keyHex)) })));
      const senderWrap = senderDeviceKeys.find((key) => key.recipientDeviceKeyId === mine.id);
      if (!senderWrap) throw new Error("This device's secure message key is unavailable.");
      const recipientDeviceKeys = await Promise.all(theirs.map(async (recipient) => ({ recipientDeviceKeyId: recipient.id, ...(await wrapMessageKey(userId, jwk(recipient), conversationId, encrypted.iv, encrypted.keyHex)) })));
      const saved = await chatApi.sendMessage(conversationId, { ciphertext: encrypted.ciphertext, iv: encrypted.iv, encryptionAlgorithm: "AES-256-GCM", senderWrappedMessageKey: senderWrap.wrappedMessageKey, senderWrappingIv: senderWrap.wrappingIv, wrappingAlgorithm: senderWrap.wrappingAlgorithm, senderDeviceKeyId: mine.id, senderDeviceKeys, recipientDeviceKeys });
      setDraft(""); setMessages(old => [...old, { id: saved.id, mine: true, text: plaintext, createdAt: saved.createdAt }]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send the encrypted message."); } finally { setBusy(false); }
  };
  const top = Platform.OS === "web" ? 67 : insets.top;
  return <View style={[s.container, { backgroundColor: colors.background }]}>
    <View style={[s.header, { paddingTop: top + 14, borderBottomColor: colors.border }]}>{selected && <TouchableOpacity onPress={() => { setSelected(null); setConversationId(null); setMessages([]); }}><Ionicons name="arrow-back" size={23} color={colors.foreground} /></TouchableOpacity>}<View style={{ flex: 1 }}><Text style={[s.title, { color: colors.foreground }]}>{selected ? nameOf(selected) : "Secure Chat"}</Text><Text style={[s.security, { color: colors.success }]}>● End-to-end encrypted</Text></View>{selected && <TouchableOpacity onPress={() => void open(selected, conversationId ?? undefined)}><Ionicons name="refresh" size={21} color={colors.primary} /></TouchableOpacity>}</View>
    {error && <View style={[s.error, { borderColor: colors.border }]}><Text style={{ color: colors.mutedForeground }}>{error}</Text></View>}
    {!selected ? <FlatList data={teammates} keyExtractor={x => x.clerkId} refreshing={loading} onRefresh={() => void loadTeammates()} contentContainerStyle={s.people} ListEmptyComponent={<View style={s.empty}>{loading ? <ActivityIndicator color={colors.primary} /> : <><Ionicons name="people-outline" size={48} color={colors.mutedForeground} /><Text style={[s.emptyTitle, { color: colors.foreground }]}>No accepted teammates</Text><Text style={{ color: colors.mutedForeground, textAlign: "center" }}>Accept a teammate invitation to start an encrypted conversation.</Text></>}</View>} renderItem={({ item }) => <TouchableOpacity onPress={() => void open(item)} style={[s.person, { borderColor: colors.border, backgroundColor: colors.card }]}><UserAvatar name={nameOf(item)} color={avatarColor(item.clerkId)} size={44} /><View style={{ flex: 1 }}><Text style={[s.name, { color: colors.foreground }]}>{nameOf(item)}</Text><Text style={{ color: colors.mutedForeground }} numberOfLines={1}>{item.email}</Text></View><Ionicons name="chevron-forward" color={colors.mutedForeground} size={18} /></TouchableOpacity>} /> : <>
      {busy ? <View style={s.empty}><ActivityIndicator color={colors.primary} /></View> : <FlatList data={messages} keyExtractor={x => x.id} contentContainerStyle={s.messageList} ListEmptyComponent={<View style={s.empty}><Ionicons name="chatbubble-ellipses-outline" size={45} color={colors.mutedForeground}/><Text style={{ color: colors.mutedForeground }}>Send the first encrypted message.</Text></View>} renderItem={({ item }) => <View style={[s.bubble, item.mine ? { alignSelf: "flex-end", backgroundColor: colors.primary } : { alignSelf: "flex-start", backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}><Text style={{ color: item.mine ? colors.primaryForeground : colors.foreground }}>{item.text}</Text><Text style={[s.timestamp, { color: item.mine ? "rgba(7,17,31,0.68)" : colors.mutedForeground }]}>{new Date(item.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</Text>{item.failed && <Text style={[s.failure, { color: colors.mutedForeground }]}>Message unavailable</Text>}</View>} />}
      <View style={[s.composer, { backgroundColor: colors.card, borderColor: colors.border }]}><TextInput value={draft} onChangeText={setDraft} placeholder="Encrypted message" placeholderTextColor={colors.mutedForeground} style={[s.input, { color: colors.foreground }]} multiline editable={!busy} /><TouchableOpacity onPress={() => void send()} disabled={!draft.trim() || busy} style={[s.send, { backgroundColor: colors.primary, opacity: !draft.trim() || busy ? .5 : 1 }]}>{busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Ionicons name="send" size={18} color={colors.primaryForeground} />}</TouchableOpacity></View>
    </>}
  </View>;
}
const s = StyleSheet.create({ container: { flex: 1 }, header: { paddingHorizontal: 20, paddingBottom: 14, flexDirection: "row", gap: 12, alignItems: "center", borderBottomWidth: 1 }, title: { fontSize: 24, fontFamily: "Inter_700Bold" }, security: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 2 }, error: { marginHorizontal: 20, marginBottom: 8, padding: 10, borderWidth: 1, borderRadius: 10 }, people: { paddingHorizontal: 20, paddingBottom: 90 }, person: { minHeight: 72, borderBottomWidth: 1, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 12 }, name: { fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 2 }, empty: { flex: 1, minHeight: 260, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 35 }, emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" }, messageList: { padding: 16, paddingBottom: 10, gap: 8 }, bubble: { maxWidth: "80%", paddingHorizontal: 13, paddingVertical: 10, borderRadius: 16 }, timestamp: { fontSize: 10, marginTop: 5, alignSelf: "flex-end" }, failure: { fontSize: 11, marginTop: 5 }, composer: { flexDirection: "row", alignItems: "flex-end", margin: 12, marginBottom: Platform.OS === "web" ? 72 : 82, borderWidth: 1, borderRadius: 18, padding: 7, gap: 8 }, input: { flex: 1, fontSize: 15, maxHeight: 100, paddingHorizontal: 8, paddingVertical: 7, fontFamily: "Inter_400Regular" }, send: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" } });
