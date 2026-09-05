import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

interface StatCardProps {
  label: string;
  value: string;
  icon: string;
  color: string;
}

export function StatCard({ label, value, icon, color }: StatCardProps) {
  const colors = useColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.iconBox, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <Text style={[styles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  value: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  label: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
});
