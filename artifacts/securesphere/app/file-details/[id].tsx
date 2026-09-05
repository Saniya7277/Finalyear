import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { GlassCard } from '@/components/GlassCard';
import { UserAvatar } from '@/components/UserCard';
import { getFileById, getUserById, DUMMY_USERS } from '@/data/mockData';

export default function FileDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const file = getFileById(id ?? '');
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  if (!file) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>File not found</Text>
      </View>
    );
  }

  const owner = getUserById(file.ownerId);
  const sharedUsers = file.sharedWith.map(id => getUserById(id)).filter(Boolean);

  const fileIconMap: Record<string, { icon: string; color: string }> = {
    pdf: { icon: 'file-pdf-box', color: '#FF3B5C' },
    docx: { icon: 'file-word', color: '#0066FF' },
    pptx: { icon: 'file-powerpoint', color: '#FF8C00' },
    xlsx: { icon: 'file-excel', color: '#00E676' },
    image: { icon: 'file-image', color: '#B44FFF' },
    txt: { icon: 'file-document', color: '#7A9BB5' },
  };
  const iconInfo = fileIconMap[file.type] ?? fileIconMap.txt;

  const handleAction = (action: string) => {
    Alert.alert(action, `${action} functionality will be available once backend is integrated.`);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>File Details</Text>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 24 }]} showsVerticalScrollIndicator={false}>
        {/* File Hero Card */}
        <GlassCard style={styles.heroCard} glowColor={iconInfo.color}>
          <View style={[styles.fileIconBig, { backgroundColor: `${iconInfo.color}18` }]}>
            <MaterialCommunityIcons name={iconInfo.icon as any} size={64} color={iconInfo.color} />
          </View>
          <Text style={[styles.fileName, { color: colors.foreground }]} numberOfLines={2}>{file.name}</Text>
          <Text style={[styles.fileMeta, { color: colors.mutedForeground }]}>{file.size} · {file.type.toUpperCase()}</Text>
          <View style={styles.badgeRow}>
            {file.encrypted && (
              <View style={[styles.heroBadge, { backgroundColor: 'rgba(0,230,118,0.12)', borderColor: 'rgba(0,230,118,0.3)' }]}>
                <Ionicons name="lock-closed" size={12} color={colors.success} />
                <Text style={[styles.heroBadgeText, { color: colors.success }]}>AES-256 Encrypted</Text>
              </View>
            )}
            {!file.encrypted && (
              <View style={[styles.heroBadge, { backgroundColor: 'rgba(255,140,0,0.12)', borderColor: 'rgba(255,140,0,0.3)' }]}>
                <Ionicons name="lock-open" size={12} color={colors.warning} />
                <Text style={[styles.heroBadgeText, { color: colors.warning }]}>Not Encrypted</Text>
              </View>
            )}
            {file.shared && (
              <View style={[styles.heroBadge, { backgroundColor: 'rgba(0,102,255,0.12)', borderColor: 'rgba(0,102,255,0.3)' }]}>
                <Ionicons name="people" size={12} color={colors.accent} />
                <Text style={[styles.heroBadgeText, { color: colors.accent }]}>Shared</Text>
              </View>
            )}
          </View>
        </GlassCard>

        {/* Actions */}
        <View style={styles.actionsRow}>
          {[
            { icon: 'share-social', label: 'Share', color: colors.accent },
            { icon: 'cloud-download', label: 'Download', color: colors.primary },
            { icon: 'create', label: 'Rename', color: colors.warning },
            { icon: 'trash', label: 'Delete', color: colors.destructive },
          ].map(a => (
            <TouchableOpacity
              key={a.label}
              onPress={() => handleAction(a.label)}
              style={[styles.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Ionicons name={a.icon as any} size={22} color={a.color} />
              <Text style={[styles.actionLabel, { color: colors.mutedForeground }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Info */}
        <GlassCard style={styles.infoCard}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>File Info</Text>
          {[
            { label: 'Created', value: file.createdAt },
            { label: 'Modified', value: file.modifiedAt },
            { label: 'Owner', value: owner?.name ?? 'Unknown' },
            { label: 'Encryption', value: file.encrypted ? 'AES-256-GCM' : 'None' },
            { label: 'Access', value: file.shared ? 'Restricted sharing' : 'Private' },
          ].map(row => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: colors.border }]}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{row.label}</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>{row.value}</Text>
            </View>
          ))}
        </GlassCard>

        {/* Shared With */}
        {sharedUsers.length > 0 && (
          <GlassCard>
            <View style={styles.sharedHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Shared With</Text>
              <TouchableOpacity onPress={() => handleAction('Manage Access')}>
                <Text style={[styles.manageText, { color: colors.primary }]}>Manage</Text>
              </TouchableOpacity>
            </View>
            {sharedUsers.map(user => user && (
              <View key={user.id} style={styles.sharedUser}>
                <UserAvatar name={user.name} color={user.avatarColor} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sharedName, { color: colors.foreground }]}>{user.name}</Text>
                  <Text style={[styles.sharedRole, { color: colors.mutedForeground }]}>{user.role}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </View>
            ))}
          </GlassCard>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  scroll: { paddingHorizontal: 20, gap: 16 },
  heroCard: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  fileIconBig: { width: 100, height: 100, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  fileMeta: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  badgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  heroBadgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 1, gap: 6 },
  actionLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  infoCard: { gap: 0 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1 },
  infoLabel: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  infoValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  sharedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  manageText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  sharedUser: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  sharedName: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  sharedRole: { fontSize: 12, fontFamily: 'Inter_400Regular', textTransform: 'capitalize' },
  errorText: { textAlign: 'center', marginTop: 100, fontSize: 16, fontFamily: 'Inter_400Regular' },
});
