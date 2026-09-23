import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useApp } from '@/context/AppContext';
import { resolvePostAuthRoute } from '@/lib/pendingInvitation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function BouncingDot({ delay }: { delay: number }) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    const t = setTimeout(() => {
      translateY.value = withRepeat(
        withSequence(
          withTiming(-8, { duration: 380 }),
          withTiming(0, { duration: 380 })
        ),
        -1,
        true
      );
    }, delay);
    return () => clearTimeout(t);
  }, []);

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  return <Animated.View style={[styles.dot, style]} />;
}

function StartupVideo({ onComplete }: { onComplete: () => void }) {
  const hasCompleted = useRef(false);
  const player = useVideoPlayer(require('../assets/images/video.mp4'), (videoPlayer) => {
    videoPlayer.loop = false;
    // Muted autoplay keeps the required hands-free startup flow reliable on web.
    videoPlayer.muted = true;
  });

  const finish = useCallback(() => {
    if (hasCompleted.current) return;
    hasCompleted.current = true;
    player.pause();
    onComplete();
  }, [onComplete, player]);

  useEffect(() => {
    const loadTimeout = setTimeout(finish, 8000);
    const onLoad = player.addListener('sourceLoad', () => clearTimeout(loadTimeout));
    const onEnd = player.addListener('playToEnd', finish);
    const onStatusChange = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') finish();
    });

    player.play();

    return () => {
      clearTimeout(loadTimeout);
      onLoad.remove();
      onEnd.remove();
      onStatusChange.remove();
    };
  }, [finish, player]);

  return (
    <View style={styles.videoContainer}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls={false}
        allowsFullscreen={false}
        playsInline
      />
    </View>
  );
}

export default function SplashScreen() {
  const { isAuthenticated, hasCompletedOnboarding, isLoading } = useApp();
  const insets = useSafeAreaInsets();
  const [nextRoute, setNextRoute] = useState<string | null>(null);
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);
  const pulseOpacity = useSharedValue(0.3);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
    transform: [{ scale: 1 + (1 - pulseOpacity.value) * 0.3 }],
  }));

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 800 });
    scale.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.back(1.1)) });
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1200 }),
        withTiming(0.2, { duration: 1200 })
      ),
      -1,
      true
    );
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const t = setTimeout(async () => {
      let destination: string;
      if (!hasCompletedOnboarding) {
        destination = '/onboarding';
      } else if (!isAuthenticated) {
        destination = '/auth/login';
      } else {
        // An invitation opened while signed out waits here; finish it rather
        // than landing on Home with the link silently forgotten.
        destination = await resolvePostAuthRoute();
      }
      setNextRoute(destination);
    }, 2600);
    return () => clearTimeout(t);
  }, [isLoading, isAuthenticated, hasCompletedOnboarding]);

  const continueFromStartupVideo = useCallback(() => {
    if (nextRoute) router.replace(nextRoute as any);
  }, [nextRoute]);

  if (nextRoute) {
    return <StartupVideo onComplete={continueFromStartupVideo} />;
  }

  return (
    <LinearGradient colors={['#050B18', '#0A1628', '#050B18']} style={styles.container}>
      <View style={[styles.orbTopLeft]} />
      <View style={[styles.orbBottomRight]} />

      <Animated.View style={[styles.pulseRing, pulseStyle]} />

      <Animated.View style={[styles.center, logoStyle]}>
        <View style={styles.iconWrapper}>
          <Ionicons name="shield-checkmark" size={64} color="#00D4FF" />
        </View>
        <Text style={styles.title}>SecureSphere</Text>
        <Text style={styles.subtitle}>Privacy-Preserving Collaboration</Text>
      </Animated.View>

      <View style={[styles.dots, { bottom: insets.bottom + 56, ...(Platform.OS === 'web' ? { bottom: 90 } : {}) }]}>
        {[0, 200, 400].map((delay, i) => (
          <BouncingDot key={i} delay={delay} />
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#050B18',
  },
  orbTopLeft: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(0, 212, 255, 0.06)',
  },
  orbBottomRight: {
    position: 'absolute',
    bottom: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(0, 102, 255, 0.07)',
  },
  pulseRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.5)',
  },
  center: {
    alignItems: 'center',
    gap: 16,
  },
  iconWrapper: {
    width: 120,
    height: 120,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 212, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
    color: '#E8F4FD',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#7A9BB5',
    letterSpacing: 0.3,
  },
  dots: {
    position: 'absolute',
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00D4FF',
    opacity: 0.7,
  },
  videoContainer: {
    flex: 1,
    backgroundColor: '#07111F',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
