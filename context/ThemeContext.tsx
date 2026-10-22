import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

export type ThemeMode = 'light' | 'dark';

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  background: string;
  surface: string;              // Primary container / card (#B0E0E6 in dark)
  surfaceElevated: string;      // Secondary container (#C7E9ED in dark)
  card: string;                 // Primary container / card (#B0E0E6 in dark)
  cardSecondary: string;        // Secondary container (#C7E9ED in dark)
  textPrimary: string;          // Primary text inside containers/cards (#172B35 in dark)
  textSecondary: string;        // Secondary text inside containers/cards (#354F5A in dark)
  textOnDark: string;           // Text on page background (#F0F4F8 in dark)
  textOnDarkSecondary: string;  // Subtitle/label on page background (#A2B7C4 in dark)
  textMuted: string;
  placeholder: string;
  border: string;               // Divider/border (#49636C in dark)
  borderLight: string;
  borderFocus: string;
  error: string;
  errorBg: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  disabled: string;
  inputBg: string;              // Input background (#D9F0F2 in dark)
  inputBorder: string;          // Input border (#6BABB5 in dark)
  inputText: string;            // Input text (#172B35 in dark)
  inputPlaceholder: string;     // Input placeholder (#5C7C88 in dark)
  buttonPrimary: string;        // Primary button (#287D91 in dark)
  buttonText: string;           // Button text (#FFFFFF in dark)
  divider: string;              // Divider (#49636C in dark)
  tabBar: string;               // Tab bar background (#101820 in dark)
  tabBarBorder: string;         // Tab bar top border (#49636C in dark)
  white: string;
  black: string;
}

export const LightTheme: ThemeColors = {
  primary: '#1A56DB',
  primaryDark: '#1240A8',
  primaryLight: '#EFF6FF',
  background: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  card: '#FFFFFF',
  cardSecondary: '#F8FAFC',
  textPrimary: '#111827',
  textSecondary: '#4B5563',
  textOnDark: '#111827',
  textOnDarkSecondary: '#4B5563',
  textMuted: '#64748B',
  placeholder: '#9CA3AF',
  border: '#D1D5DB',
  borderLight: '#E2E8F0',
  borderFocus: '#1A56DB',
  error: '#B91C1C',
  errorBg: '#FEF2F2',
  success: '#166534',
  successBg: '#F0FDF4',
  warning: '#D97706',
  warningBg: '#FEF3C7',
  disabled: '#9CA3AF',
  inputBg: '#FFFFFF',
  inputBorder: '#D1D5DB',
  inputText: '#111827',
  inputPlaceholder: '#9CA3AF',
  buttonPrimary: '#1A56DB',
  buttonText: '#FFFFFF',
  divider: '#E2E8F0',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  white: '#FFFFFF',
  black: '#000000',
};

export const DarkTheme: ThemeColors = {
  primary: '#287D91',
  primaryDark: '#1F6170',
  primaryLight: '#C7E9ED',
  background: '#000000',         // solid black page background in dark mode
  surface: '#B0E0E6',            // powder blue
  surfaceElevated: '#C7E9ED',    // secondary container
  card: '#B0E0E6',               // powder blue
  cardSecondary: '#C7E9ED',      // secondary container
  textPrimary: '#17202A',        // near-black text for powder-blue gradient cards
  textSecondary: '#17202A',      // secondary text inside containers/cards
  textOnDark: '#FFFFFF',         // white text for page headers/titles against black
  textOnDarkSecondary: '#E2E8F0',// light secondary text against black page background
  textMuted: '#94A3B8',
  placeholder: '#64748B',
  border: '#334155',             // subtle dark divider/border
  borderLight: '#475569',
  borderFocus: '#287D91',
  error: '#EF4444',              // accessible red with high contrast
  errorBg: '#FEE2E2',
  success: '#10B981',            // accessible green
  successBg: '#D1FAE5',
  warning: '#F59E0B',            // accessible amber
  warningBg: '#FEF3C7',
  disabled: '#64748B',
  inputBg: '#FFFFFF',            // white input background for maximum readability
  inputBorder: '#CBD5E1',        // input border
  inputText: '#17202A',          // dark input text
  inputPlaceholder: '#64748B',   // input placeholder
  buttonPrimary: '#287D91',      // primary button
  buttonText: '#FFFFFF',         // button text
  divider: '#334155',            // divider
  tabBar: '#000000',             // solid black tab bar in dark mode
  tabBarBorder: '#262626',       // tab bar border
  white: '#FFFFFF',
  black: '#000000',
};

interface ThemeContextType {
  theme: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  isDark: false,
  colors: LightTheme,
  toggleTheme: () => {},
  setTheme: () => {},
});

const THEME_STORAGE_KEY = '@civiceye_theme_mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useRNColorScheme();
  const [theme, setThemeState] = useState<ThemeMode>('light');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (isMounted) {
          if (saved === 'dark' || saved === 'light') {
            setThemeState(saved);
          } else if (systemScheme === 'dark') {
            setThemeState('dark');
          } else {
            setThemeState('light');
          }
        }
      } catch {
        if (isMounted) {
          setThemeState(systemScheme === 'dark' ? 'dark' : 'light');
        }
      } finally {
        if (isMounted) setIsLoaded(true);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [systemScheme]);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
  };

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
  };

  const colors = theme === 'dark' ? DarkTheme : LightTheme;
  const isDark = theme === 'dark';

  return (
    <ThemeContext.Provider value={{ theme, isDark, colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme(): ThemeContextType {
  return useContext(ThemeContext);
}
