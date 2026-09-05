import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { DUMMY_NOTIFICATIONS, Notification } from '@/data/mockData';
import { useApp } from '@/context/AppContext';

function getNotificationIcon(type: Notification['type']): { icon: string; color: string } {
  switch (type) {
    case 'share': return { icon: 'share-social', color: '#0066FF' };
    case 'invite': return { icon: 'person-add', color: '#00D4FF' };
    case 'security': return { icon: 'shield-checkmark', color: '#00E676' };
    case 'upload': return { icon: 'cloud-upload', color: '#B44FFF' };
    default: return { icon: 'notifications', color: '#FF8C00' };
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date('2026-07-22T12:00:00Z');
  const diff = (now.getTime() - date.getTime()) / 1000;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function Notifications() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { decrementNotifications } = useApp();
  const [notifications, setNotifications] = useState(DUMMY_NOTIFICATIONS);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.orbTL} />
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View>
          <Text style={[styles.title, { color: colors.foreground }]}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={[styles.unreadLabel, { color: colors.mutedForeground }]}>{unreadCount} unread</Text>
          )}
        </View>
        <TouchableOpacity onPress={markAllRead} style={[styles.markAllBtn, { borderColor: colors.border }]}>
          <Text style={[styles.markAllText, { color: colors.primary }]}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: botPad + 24 }]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const iconInfo = getNotificationIcon(item.type);
          return (
            <TouchableOpacity
              onPress={() => markRead(item.id)}
              activeOpacity={0.75}
              style={[
                styles.notifCard,
                {
                  backgroundColor: item.read ? colors.card : `${colors.primary}08`,
                  borderColor: item.read ? colors.border : `${colors.primary}30`,
                },
              ]}
            >
              <View style={[styles.notifIcon, { backgroundColor: `${iconInfo.color}18` }]}>
                <Ionicons name={iconInfo.icon as any} size={20} color={iconInfo.color} />
              </View>
              <View style={styles.notifContent}>
                <View style={styles.notifTitleRow}>
                  <Text style={[styles.notifTitle, { color: colors.foreground }]}>{item.title}</Text>
                  {!item.read && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
                </View>
                <Text style={[styles.notifMessage, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {item.message}
                </Text>
                <Text style={[styles.notifTime, { color: `${colors.mutedForeground}80` }]}>
                  {formatTime(item.createdAt)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-off-outline" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No notifications</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  orbTL: { position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(0,212,255,0.04)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  unreadLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  markAllBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  markAllText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  list: { paddingHorizontal: 20, gap: 10 },
  notifCard: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, borderRadius: 14, borderWidth: 1, gap: 12 },
  notifIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  notifContent: { flex: 1, gap: 4 },
  notifTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  notifTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
  notifMessage: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 },
  notifTime: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
});
