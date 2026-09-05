import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface GlassCardProps {
  children: ReactNode;
  style?: ViewStyle;
  glowColor?: string;
  noPadding?: boolean;
}

export function GlassCard({ children, style, glowColor, noPadding }: GlassCardProps) {
  const colors = useColors();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: glowColor ? `${glowColor}30` : colors.border,
          shadowColor: glowColor ?? colors.primary,
        },
        noPadding ? styles.noPadding : styles.padding,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  padding: {
    padding: 16,
  },
  noPadding: {
    padding: 0,
  },
});
