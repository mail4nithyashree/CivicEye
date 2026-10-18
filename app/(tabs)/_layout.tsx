import { HapticTab } from '@/components/haptic-tab';
import { AppColors } from '@/constants/colors';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function TabIcon({
  nameFocused,
  nameUnfocused,
  focused,
}: {
  nameFocused: keyof typeof Ionicons.glyphMap;
  nameUnfocused: keyof typeof Ionicons.glyphMap;
  focused: boolean;
}) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons
        name={focused ? nameFocused : nameUnfocused}
        size={25}
        color={focused ? AppColors.primary : '#64748B'}
      />
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  // Ensure bottom clearance above default Android 3-button nav (home, back, recent) or iOS home bar
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 14 : 20);
  const tabHeight = 64 + bottomPadding;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: AppColors.primary,
        tabBarInactiveTintColor: '#64748B',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E2E8F0',
          borderTopWidth: 1.5,
          height: tabHeight,
          paddingBottom: bottomPadding,
          paddingTop: 8,
          ...Platform.select({
            web: {
              boxShadow: '0px -4px 10px rgba(15, 23, 42, 0.1)',
            },
            default: {
              elevation: 14,
              shadowColor: '#0F172A',
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.1,
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
  iconWrapActive: {
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
  },
});
