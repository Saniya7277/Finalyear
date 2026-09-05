import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { User } from '@/data/mockData';

interface UserCardProps {
  user: User;
  onPress?: () => void;
  showRole?: boolean;
  rightElement?: React.ReactNode;
}

export function UserAvatar({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return (
    <View style={[
      avatarStyles.avatar,
      { width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}20`, borderColor: `${color}50` }
    ]}>
      <Text style={[avatarStyles.initials, { color, fontSize: size * 0.36 }]}>{initials}</Text>
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  initials: {
    fontFamily: 'Inter_700Bold',
  },
});

export function UserCard({ user, onPress, showRole = true, rightElement }: UserCardProps) {
  const colors = useColors();

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={styles.avatarContainer}>
        <UserAvatar name={user.name} color={user.avatarColor} />
        <View style={[
          styles.onlineDot,
          { backgroundColor: user.online ? colors.success : colors.mutedForeground }
        ]} />
      </View>

      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground }]}>{user.name}</Text>
        <Text style={[styles.email, { color: colors.mutedForeground }]} numberOfLines={1}>
          {user.email}
        </Text>
        {showRole && (
          <Text style={[styles.role, { color: colors.primary }]}>
            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
          </Text>
        )}
      </View>

      {rightElement ?? (
        <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
  },
  avatarContainer: {
    position: 'relative',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#0D1B2A',
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  email: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  role: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },
});
