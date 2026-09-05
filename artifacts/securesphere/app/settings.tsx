import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { GlassCard } from '@/components/GlassCard';
import { useApp } from '@/context/AppContext';

interface ToggleRowProps {
  label: string;
  subtitle?: string;
  value: boolean;
  onToggle: () => void;
  icon: string;
  iconColor: string;
}

function ToggleRow({ label, subtitle, value, onToggle, icon, iconColor }: ToggleRowProps) {
  const colors = useColors();
  return (
    <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.settingIcon, { backgroundColor: `${iconColor}18` }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.settingLabel, { color: colors.foreground }]}>{label}</Text>
        {subtitle && <Text style={[styles.settingSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>}
      </View>
      <TouchableOpacity onPress={onToggle} style={[styles.toggle, { backgroundColor: value ? colors.success : colors.muted }]}>
        <View style={[styles.toggleThumb, { transform: [{ translateX: value ? 18 : 2 }] }]} />
      </TouchableOpacity>
    </View>
  );
}

export default function Settings() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { darkMode, toggleDarkMode } = useApp();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const [settings, setSettings] = useState({
    biometrics: true,
    twoFactor: false,
    autoEncrypt: true,
    secureSearch: true,
    notifications: true,
    shareAnalytics: false,
    autoLock: true,
    vpnMode: false,
  });

  const toggle = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const SECURITY_SETTINGS = [
    { key: 'biometrics', label: 'Biometric Authentication', subtitle: 'Use Face ID or fingerprint', icon: 'finger-print', color: '#00D4FF' },
    { key: 'twoFactor', label: 'Two-Factor Authentication', subtitle: 'Recommended — adds 8 pts to score', icon: 'shield-checkmark', color: '#00E676' },
    { key: 'autoEncrypt', label: 'Auto-Encrypt Uploads', subtitle: 'AES-256 applied on upload', icon: 'lock-closed', color: '#0066FF' },
    { key: 'autoLock', label: 'Auto-Lock Vault', subtitle: 'Locks after 5 minutes idle', icon: 'lock-open', color: '#FF8C00' },
    { key: 'vpnMode', label: 'VPN Mode', subtitle: 'Route traffic through secure proxy', icon: 'globe', color: '#B44FFF' },
  ] as const;

  const PRIVACY_SETTINGS = [
    { key: 'secureSearch', label: 'Encrypted Search', subtitle: 'Searches never leave your device', icon: 'search', color: '#00D4FF' },
    { key: 'notifications', label: 'Security Notifications', subtitle: 'Alerts for threats and access', icon: 'notifications', color: '#FF8C00' },
    { key: 'shareAnalytics', label: 'Share Analytics', subtitle: 'Help improve SecureSphere', icon: 'analytics', color: '#7A9BB5' },
  ] as const;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.orbTL} />
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 24 }]} showsVerticalScrollIndicator={false}>
        {/* Appearance */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>Appearance</Text>
        <GlassCard noPadding style={{ overflow: 'hidden' }}>
          <ToggleRow label="Dark Mode" subtitle="Cybersecurity aesthetic" value={darkMode} onToggle={toggleDarkMode} icon="moon" iconColor="#B44FFF" />
        </GlassCard>

        {/* Security */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>Security</Text>
        <GlassCard noPadding style={{ overflow: 'hidden' }}>
          {SECURITY_SETTINGS.map(s => (
            <ToggleRow key={s.key} label={s.label} subtitle={s.subtitle} value={settings[s.key]} onToggle={() => toggle(s.key)} icon={s.icon} iconColor={s.color} />
          ))}
        </GlassCard>

        {/* Privacy */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>Privacy</Text>
        <GlassCard noPadding style={{ overflow: 'hidden' }}>
          {PRIVACY_SETTINGS.map(s => (
            <ToggleRow key={s.key} label={s.label} subtitle={s.subtitle} value={settings[s.key]} onToggle={() => toggle(s.key)} icon={s.icon} iconColor={s.color} />
          ))}
        </GlassCard>

        {/* About */}
        <Text style={[styles.sectionHeader, { color: colors.mutedForeground }]}>About</Text>
        <GlassCard noPadding style={{ overflow: 'hidden' }}>
          {[
            { label: 'Privacy Policy', icon: 'document-text', color: '#7A9BB5' },
            { label: 'Terms of Service', icon: 'newspaper', color: '#7A9BB5' },
            { label: 'Open Source Licenses', icon: 'code-slash', color: '#7A9BB5' },
            { label: 'Version 1.0.0', icon: 'information-circle', color: '#7A9BB5' },
          ].map(item => (
            <TouchableOpacity key={item.label} style={[styles.settingRow, styles.linkRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.settingIcon, { backgroundColor: `${item.color}18` }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <Text style={[styles.settingLabel, { color: colors.foreground, flex: 1 }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </GlassCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  orbTL: { position: 'absolute', top: -60, left: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(0,212,255,0.04)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  scroll: { paddingHorizontal: 20, gap: 12 },
  sectionHeader: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 8, marginBottom: 4 },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  linkRow: {},
  settingIcon: { width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  settingSubtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  toggle: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center' },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' },
});
