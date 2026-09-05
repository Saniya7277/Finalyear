import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { FileCard } from '@/components/FileCard';
import { DUMMY_FILES } from '@/data/mockData';

const TABS = ['Shared with me', 'Shared by me'] as const;
type TabType = typeof TABS[number];

export default function Shared() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>('Shared with me');
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const sharedWithMe = DUMMY_FILES.filter(f => f.ownerId !== 'current' && f.sharedWith.includes('current'));
  const sharedByMe = DUMMY_FILES.filter(f => f.ownerId === 'current' && f.sharedWith.length > 0);
  const files = activeTab === 'Shared with me' ? sharedWithMe : sharedByMe;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.orbTL} />
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Shared Files</Text>
        <TouchableOpacity onPress={() => router.push('/members')} style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="people" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.tabs, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primaryForeground : colors.mutedForeground }]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={files}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: botPad + 24 }]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <FileCard file={item} onPress={() => router.push(`/file-details/${item.id}`)} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="share-social-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {activeTab === 'Shared with me' ? 'No shared files yet' : 'Not sharing any files'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {activeTab === 'Shared with me' ? 'Files shared with you will appear here' : 'Share files with collaborators from My Files'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  orbTL: { position: 'absolute', top: -60, left: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(180,79,255,0.05)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  tabs: { flexDirection: 'row', marginHorizontal: 20, borderRadius: 12, borderWidth: 1, padding: 4, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  tabText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  list: { paddingHorizontal: 20 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 40 },
});
