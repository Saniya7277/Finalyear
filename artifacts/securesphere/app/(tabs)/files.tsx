import React, { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { FileCard } from '@/components/FileCard';
import { SecureFile, FileType } from '@/data/mockData';
import { formatBytes, SecureFileRecord, useFilesApi } from '@/lib/filesApi';

const FILTERS: { label: string; type: FileType | 'all' }[] = [
  { label: 'All', type: 'all' },
  { label: 'PDF', type: 'pdf' },
  { label: 'DOCX', type: 'docx' },
  { label: 'PPTX', type: 'pptx' },
  { label: 'XLSX', type: 'xlsx' },
  { label: 'Images', type: 'image' },
];

function toFileCard(record: SecureFileRecord): SecureFile {
  const modified = new Date(record.modifiedAt);

  return {
    id: record.id,
    name: record.name,
    type: record.type,
    size: formatBytes(record.sizeBytes),
    encrypted: record.encrypted,
    // This tab intentionally lists only files owned by the signed-in user.
    // Sharing status is not part of the upload metadata returned by /api/files.
    shared: false,
    ownerId: record.ownerId,
    sharedWith: [],
    createdAt: record.createdAt,
    modifiedAt: Number.isNaN(modified.getTime())
      ? record.modifiedAt
      : modified.toLocaleDateString(),
  };
}

export default function Files() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { listFiles } = useFilesApi();
  const listFilesRef = useRef(listFiles);
  listFilesRef.current = listFiles;
  const [filter, setFilter] = useState<FileType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [files, setFiles] = useState<SecureFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const loadOwnedFiles = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const { owned } = await listFilesRef.current();
      setFiles(owned.map(toFileCard));
    } catch (error) {
      setFiles([]);
      setLoadError(error instanceof Error ? error.message : 'Could not load your files.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadOwnedFiles();
    }, [loadOwnedFiles]),
  );

  const filtered = files.filter(f => {
    const matchType = filter === 'all' || f.type === filter;
    const matchSearch = f.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const renderFile = ({ item }: { item: SecureFile }) => <FileCard file={item} />;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.orbTL} />
      <View style={[styles.header, { paddingTop: topPad + 16 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>My Files</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="funnel-outline" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="grid-outline" size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search files..."
          placeholderTextColor={colors.mutedForeground}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filtersWrap}>
        <FlatList
          data={FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={item => item.type}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setFilter(item.type)}
              style={[
                styles.filterChip,
                filter === item.type
                  ? { backgroundColor: colors.primary, borderColor: colors.primary }
                  : { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[
                styles.filterText,
                { color: filter === item.type ? colors.primaryForeground : colors.mutedForeground }
              ]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <View style={styles.listHeader}>
        <Text style={[styles.listCount, { color: colors.mutedForeground }]}>
          {filtered.length} file{filtered.length !== 1 ? 's' : ''}
        </Text>
        <TouchableOpacity>
          <Text style={[styles.sortText, { color: colors.primary }]}>Date Modified</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderFile}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Platform.OS === 'web' ? 84 : 90 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="documents-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {isLoading ? 'Loading files…' : loadError ? 'Could not load files' : 'No files found'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {loadError ?? (isLoading ? 'Fetching your encrypted file metadata' : 'Upload your first file to see it here')}
            </Text>
            {loadError && (
              <TouchableOpacity onPress={() => void loadOwnedFiles()}>
                <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  orbTL: { position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(0,102,255,0.05)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  headerActions: { flexDirection: 'row', gap: 10 },
  iconBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, height: 46, gap: 10, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  filtersWrap: { marginBottom: 12 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 },
  listCount: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  sortText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', paddingHorizontal: 40 },
  retryText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
