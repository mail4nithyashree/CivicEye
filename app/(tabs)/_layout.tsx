import { HapticTab } from '@/components/haptic-tab';
import { useAppTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function TabIcon({
  nameFocused,
  nameUnfocused,
  focused,
  color,
  isDark,
}: {
  nameFocused: keyof typeof Ionicons.glyphMap;
  nameUnfocused: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  color: string;
  isDark: boolean;
}) {
  return (
    <View style={[styles.iconWrap, focused && (isDark ? styles.iconWrapActiveDark : styles.iconWrapActiveLight)]}>
      <Ionicons
        name={focused ? nameFocused : nameUnfocused}
        size={25}
        color={color}
      />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();

  // Ensure bottom clearance above default Android 3-button nav (home, back, recent) or iOS home bar
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 14 : 20);
  const tabHeight = 64 + bottomPadding;

  const activeColor = isDark ? '#B0E0E6' : colors.primary;
  const inactiveColor = isDark ? '#A2B7C4' : '#64748B';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: activeColor,
        tabBarInactiveTintColor: inactiveColor,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1.5,
          height: tabHeight,
          paddingBottom: bottomPadding,
          paddingTop: 8,
          ...Platform.select({
            web: {
              boxShadow: isDark ? '0px -4px 10px rgba(0, 0, 0, 0.4)' : '0px -4px 10px rgba(15, 23, 42, 0.1)',
            },
            default: {
              elevation: 14,
              shadowColor: isDark ? '#000000' : '#0F172A',
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: isDark ? 0.4 : 0.1,
              shadowRadius: 10,
            },
          }),
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
          marginTop: 2,
          letterSpacing: 0.2,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              nameFocused="home"
              nameUnfocused="home-outline"
              focused={focused}
              color={focused ? activeColor : inactiveColor}
              isDark={isDark}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Civic Hub',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              nameFocused="map"
              nameUnfocused="map-outline"
              focused={focused}
              color={focused ? activeColor : inactiveColor}
              isDark={isDark}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              nameFocused="person"
              nameUnfocused="person-outline"
              focused={focused}
              color={focused ? activeColor : inactiveColor}
              isDark={isDark}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    height: 32,
    borderRadius: 16,
  },
  iconWrapActiveLight: {
    backgroundColor: 'rgba(26, 86, 219, 0.12)',
  },
  iconWrapActiveDark: {
    backgroundColor: 'rgba(176, 224, 230, 0.2)',
  },
});
