import 'react-native-reanimated';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { LogBox, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '@/constants/colors';
import { ThemeProvider, useAppTheme } from '@/context/ThemeContext';

// Suppress known upstream React 19 / Expo Router useLinking warning on initial mount
if (__DEV__) {
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes("Can't perform a React state update on a component that hasn't mounted yet")
    ) {
      return;
    }
    originalConsoleError(...args);
  };

  const originalConsoleWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes("Can't perform a React state update on a component that hasn't mounted yet")
    ) {
      return;
    }
    originalConsoleWarn(...args);
  };
}

// Suppress all in-app warning overlays and toasts
LogBox.ignoreLogs([
  "Can't perform a React state update on a component that hasn't mounted yet",
]);
LogBox.ignoreAllLogs(true);

export const unstable_settings = {
  initialRouteName: 'index',
};

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <SafeAreaView style={styles.errorContainer}>
      <Ionicons name="alert-circle-outline" size={54} color={AppColors.error} />
      <Text style={styles.errorTitle}>Application Notice</Text>
      <Text style={styles.errorMsg}>{error?.message || 'A temporary issue occurred. Please retry.'}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={retry} activeOpacity={0.8}>
        <Text style={styles.retryBtnText}>Continue</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function RootNavigation() {
  const { isDark, colors } = useAppTheme();
  return (
    <>
      <Stack
        initialRouteName="index"
        screenOptions={{
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="report" options={{ headerShown: false }} />
        <Stack.Screen name="my-complaints" options={{ headerShown: false }} />
        <Stack.Screen name="complaint-detail" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        {/* Officer screens */}
        <Stack.Screen name="officer/main-dashboard" options={{ headerShown: false, title: 'Main Officer Dashboard' }} />
        <Stack.Screen name="officer/field-dashboard" options={{ headerShown: false, title: 'Field Inspector Dashboard' }} />
        <Stack.Screen name="officer/inspector-dashboard" options={{ headerShown: false, title: 'Field Inspector Dashboard' }} />
        <Stack.Screen name="officer/complaint-management" options={{ headerShown: false, title: 'Complaint Management' }} />
        <Stack.Screen name="officer/complaint-details" options={{ headerShown: false, title: 'Complaint Details' }} />
        <Stack.Screen name="officer/inspection-screen" options={{ headerShown: false, title: 'Inspection' }} />
        <Stack.Screen name="officer/assignment-screen" options={{ headerShown: false, title: 'Assign Inspector' }} />
        <Stack.Screen name="officer/resolution-screen" options={{ headerShown: false, title: 'Mark Resolved' }} />
        <Stack.Screen name="officer/profile" options={{ headerShown: false, title: 'Officer Profile' }} />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootNavigation />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: AppColors.textPrimary,
    marginTop: 16,
  },
  errorMsg: {
    fontSize: 14,
    color: AppColors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 20,
  },
  retryBtn: {
    backgroundColor: AppColors.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
});
