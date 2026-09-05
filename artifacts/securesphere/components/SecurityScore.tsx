import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withDelay, withTiming, Easing } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface SecurityScoreProps {
  score: number;
  size?: number;
}

function getScoreColor(score: number): string {
  if (score >= 85) return '#00E676';
  if (score >= 70) return '#FF8C00';
  return '#FF3B5C';
}

function getScoreLabel(score: number): string {
  if (score >= 85) return 'Excellent';
  if (score >= 70) return 'Good';
  return 'At Risk';
}

export function SecurityScore({ score, size = 140 }: SecurityScoreProps) {
  const colors = useColors();
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const scoreColor = getScoreColor(score);

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(400, withTiming(score / 100, { duration: 1400, easing: Easing.out(Easing.cubic) }));
  }, [score]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.muted}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={scoreColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            animatedProps={animatedProps}
            strokeLinecap="round"
          />
        </G>
      </Svg>
      <Text style={[styles.score, { color: scoreColor }]}>{score}</Text>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{getScoreLabel(score)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  score: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
    lineHeight: 40,
  },
  label: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },
});
