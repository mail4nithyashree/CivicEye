import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useAppTheme } from '@/context/ThemeContext';

interface ThemeToggleProps {
  style?: object;
  showLabel?: boolean;
}

export default function ThemeToggle({ style, showLabel = false }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useAppTheme();

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(26, 86, 219, 0.08)',
          borderColor: isDark ? 'rgba(96, 165, 250, 0.3)' : 'rgba(26, 86, 219, 0.18)',
        },
        style,
      ]}
      onPress={toggleTheme}
      activeOpacity={0.7}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      accessibilityHint={`Currently in ${isDark ? 'dark' : 'light'} mode. Tap to toggle.`}
      accessibilityState={{ selected: isDark }}
    >
      <Ionicons
        name={isDark ? 'sunny' : 'moon'}
        size={20}
        color={isDark ? '#FBBF24' : '#1A56DB'}
      />
      {showLabel && (
        <Text
          style={[
            styles.label,
            { color: isDark ? '#F1F5F9' : '#1E293B' },
          ]}
        >
          {isDark ? 'Light' : 'Dark'}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    minWidth: 40,
    minHeight: 40,
  },
  label: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '600',
  },
});
