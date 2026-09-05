import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/context/AppContext';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    icon: 'shield-checkmark' as const,
    iconColor: '#00D4FF',
    title: 'Military-Grade\nEncryption',
    subtitle: 'Every file is protected with AES-256 encryption before leaving your device. Your data stays yours.',
    bg: 'rgba(0, 212, 255, 0.08)',
  },
  {
    id: '2',
    icon: 'people' as const,
    iconColor: '#0066FF',
    title: 'Secure\nCollaboration',
    subtitle: 'Share files with trusted collaborators, manage permissions, and track access — all end-to-end encrypted.',
    bg: 'rgba(0, 102, 255, 0.08)',
  },
  {
    id: '3',
    icon: 'sparkles' as const,
    iconColor: '#B44FFF',
    title: 'AI-Powered\nProtection',
    subtitle: 'Your privacy-preserving AI assistant monitors threats, scores your security, and keeps you safe.',
    bg: 'rgba(180, 79, 255, 0.08)',
  },
];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const { completeOnboarding } = useApp();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const next = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      setCurrentIndex(prev => prev + 1);
    } else {
      handleGetStarted();
    }
  };

  const handleGetStarted = async () => {
    await completeOnboarding();
    router.replace('/auth/login');
  };

  const handleSkip = async () => {
    await completeOnboarding();
    router.replace('/auth/login');
  };

  return (
    <LinearGradient colors={['#050B18', '#0A1628', '#050B18']} style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <View style={styles.logo}>
          <Ionicons name="shield-checkmark" size={22} color="#00D4FF" />
          <Text style={styles.logoText}>SecureSphere</Text>
        </View>
        <TouchableOpacity onPress={handleSkip}>
          <Text style={styles.skip}>Skip</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={[styles.iconContainer, { backgroundColor: item.bg }]}>
              <Ionicons name={item.icon} size={80} color={item.iconColor} />
            </View>
            <Text style={styles.slideTitle}>{item.title}</Text>
            <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingBottom: botPad + 24 }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === currentIndex
                  ? styles.dotActive
                  : { backgroundColor: 'rgba(122, 155, 181, 0.4)' },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity onPress={next} activeOpacity={0.8} style={styles.btn}>
          <LinearGradient colors={['#00D4FF', '#0066FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.btnGrad}>
            <Text style={styles.btnText}>
              {currentIndex === SLIDES.length - 1 ? 'Get Started' : 'Next'}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#050B18" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050B18' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 12 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#E8F4FD' },
  skip: { fontSize: 15, fontFamily: 'Inter_500Medium', color: '#7A9BB5' },
  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 24 },
  iconContainer: { width: 160, height: 160, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  slideTitle: { fontSize: 34, fontFamily: 'Inter_700Bold', color: '#E8F4FD', textAlign: 'center', lineHeight: 42 },
  slideSubtitle: { fontSize: 16, fontFamily: 'Inter_400Regular', color: '#7A9BB5', textAlign: 'center', lineHeight: 24 },
  footer: { paddingHorizontal: 24, gap: 28 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  dot: { height: 4, borderRadius: 2, width: 20 },
  dotActive: { width: 32, backgroundColor: '#00D4FF' },
  btn: { borderRadius: 16, overflow: 'hidden' },
  btnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 8 },
  btnText: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#050B18' },
});
