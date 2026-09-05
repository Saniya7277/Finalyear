import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PasswordRequirementRule } from '@/utils/passwordValidation';

interface PasswordRequirementsProps {
  rules: PasswordRequirementRule[];
  confirmStatus?: {
    isValid: boolean;
    message: string;
  };
  showOnlyWhenActive?: boolean;
  hasInput?: boolean;
}

export function PasswordRequirements({
  rules,
  confirmStatus,
  showOnlyWhenActive = false,
  hasInput = true,
}: PasswordRequirementsProps) {
  if (showOnlyWhenActive && !hasInput) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Password Requirements:</Text>
      
      <View style={styles.rulesList}>
        {rules.map((rule) => {
          const isPassed = rule.isValid;
          return (
            <View key={rule.id} style={styles.ruleRow}>
              <Ionicons
                name={isPassed ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={isPassed ? '#00E676' : '#7A9BB5'}
                style={styles.ruleIcon}
              />
              <Text
                style={[
                  styles.ruleText,
                  { color: isPassed ? '#E8F4FD' : '#7A9BB5' },
                ]}
              >
                {rule.label}
              </Text>
            </View>
          );
        })}
      </View>

      {confirmStatus && confirmStatus.message !== '' && (
        <View
          style={[
            styles.confirmBadge,
            {
              backgroundColor: confirmStatus.isValid
                ? 'rgba(0, 230, 118, 0.12)'
                : 'rgba(255, 59, 92, 0.12)',
              borderColor: confirmStatus.isValid
                ? 'rgba(0, 230, 118, 0.3)'
                : 'rgba(255, 59, 92, 0.3)',
            },
          ]}
        >
          <Ionicons
            name={confirmStatus.isValid ? 'checkmark-circle' : 'close-circle'}
            size={16}
            color={confirmStatus.isValid ? '#00E676' : '#FF3B5C'}
          />
          <Text
            style={[
              styles.confirmText,
              { color: confirmStatus.isValid ? '#00E676' : '#FF3B5C' },
            ]}
          >
            {confirmStatus.message}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0D1B2A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1A3050',
    padding: 14,
    gap: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  header: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#A8C4DC',
    letterSpacing: 0.3,
  },
  rulesList: {
    gap: 6,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ruleIcon: {
    width: 18,
  },
  ruleText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  confirmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  confirmText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
});
