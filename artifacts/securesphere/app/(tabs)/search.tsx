import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { FileCard } from '@/components/FileCard';
import { DUMMY_FILES, SecureFile } from '@/data/mockData';

const RECENT_SEARCHES = ['Q4 Report', 'Project Proposal', 'Security Audit', 'Team Presentation'];
const FILTERS = ['All', 'Encrypted', 'Shared', 'My Files'] as const;

export default function Search() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('All');
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const results: SecureFile[] = query.length > 0
    ? DUMMY_FILES.filter(f => {
        const matchSearch = f.name.toLowerCase().includes(query.toLowerCase());
        if (activeFilter === 'Encrypted') return matchSearch && f.encrypted;
        if (activeFilter === 'Shared') return matchSearch && f.shared;
        if (activeFilter === 'My Files') return matchSearch && f.ownerId === 'current';
        return matchSearch;
      })
    : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.orbTL} />
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Secure Search</Text>
        <View style={[styles.encryptBadge, { backgroundColor: 'rgba(0,230,118,0.12)', borderColor: 'rgba(0,230,118,0.3)' }]}>
          <Ionicons name="lock-closed" size={10} color={colors.success} />
          <Text style={[styles.encryptBadgeText, { color: colors.success }]}>Encrypted</Text>
        </View>
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: query.length > 0 ? `${colors.primary}60` : colors.border }]}>
        <Ionicons name="search" size={20} color={query.length > 0 ? colors.primary : colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          value={query}
          onChangeText={setQuery}
          placeholder="Search encrypted files..."
          placeholderTextColor={colors.mutedForeground}
          autoFocus={false}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, marginBottom: 16 }}
        style={{ flexGrow: 0 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setActiveFilter(item)}
            style={[styles.filterChip, activeFilter === item
              ? { backgroundColor: colors.primary, borderColor: colors.primary }
              : { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.filterText, { color: activeFilter === item ? colors.primaryForeground : colors.mutedForeground }]}>
              {item}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Holds recent-search strings when idle and SecureFiles when searching,
          so the element type has to be stated rather than inferred. */}
      <FlatList<string | SecureFile>
        data={query.length > 0 ? results : RECENT_SEARCHES}
        keyExtractor={(item, i) => typeof item === 'string' ? item + i : (item as SecureFile).id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'web' ? 84 : 90 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          query.length === 0 ? (
            <View>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Recent Searches</Text>
              {RECENT_SEARCHES.map((s, i) => (
                <TouchableOpacity key={i} onPress={() => setQuery(s)} style={[styles.recentItem, { borderBottomColor: colors.border }]}>
                  <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.recentText, { color: colors.foreground }]}>{s}</Text>
                  <Ionicons name="arrow-up-outline" size={14} color={colors.mutedForeground} style={{ transform: [{ rotate: '45deg' }] }} />
                </TouchableOpacity>
              ))}
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>All Files</Text>
              {DUMMY_FILES.slice(0, 5).map(file => (
                <FileCard key={file.id} file={file} onPress={() => router.push(`/file-details/${file.id}`)} />
              ))}
            </View>
          ) : results.length > 0 ? (
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{results.length} result{results.length !== 1 ? 's' : ''}</Text>
          ) : null
        }
        renderItem={query.length > 0 ? ({ item }) => (
          typeof item === 'string' ? null :
          <FileCard file={item as SecureFile} onPress={() => router.push(`/file-details/${(item as SecureFile).id}`)} />
        ) : () => null}
        ListEmptyComponent={query.length > 0 ? (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No results</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No encrypted files match "{query}"</Text>
          </View>
        ) : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  orbTL: { position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(0,212,255,0.04)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  encryptBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  encryptBadgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, height: 50, gap: 10, marginBottom: 14 },
  searchInput: { flex: 1, fontSize: 16, fontFamily: 'Inter_400Regular' },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  sectionLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 12 },
  recentItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1 },
  recentText: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
