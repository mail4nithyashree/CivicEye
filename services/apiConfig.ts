import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Returns the active CivicEye backend API base URL.
 * Automatically detects the current host IP from Expo Go / Metro bundler
 * so mobile devices never fail when switching Wi-Fi networks.
 */
export function getApiBaseUrl(): string {
  if (Platform.OS === 'web') {
    return process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
  }

  // Dynamic host detection from Expo Go / Metro bundler
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as any).manifest2?.extra?.expoClient?.hostUri ??
    (Constants as any).manifest?.debuggerHost;

  if (hostUri && typeof hostUri === 'string') {
    const hostIp = hostUri.split(':')[0];
    if (hostIp && hostIp !== 'localhost' && hostIp !== '127.0.0.1') {
      return `http://${hostIp}:3000`;
    }
  }

  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  return 'http://192.168.224.171:3000';
}
