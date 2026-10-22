import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '@/context/ThemeContext';

export interface GradientCardProps extends ViewProps {
  style?: StyleProp<ViewStyle>;
  gradientColors?: [string, string, ...string[]];
  children?: React.ReactNode;
}

export default function GradientCard({
  style,
  gradientColors = ['#B0E0E6', '#FFFFFF'],
  children,
  ...props
}: GradientCardProps) {
  const { isDark, colors } = useAppTheme();

  if (isDark) {
    return (
      <View style={[styles.card, { borderColor: colors.border }, style, styles.overflowHidden]} {...props}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]} {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  overflowHidden: {
    overflow: 'hidden',
  },
});
