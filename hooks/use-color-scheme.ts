import { useAppTheme } from '@/context/ThemeContext';
import { useColorScheme as useRNColorScheme } from 'react-native';

export function useColorScheme(): 'light' | 'dark' {
  try {
    const { theme } = useAppTheme();
    if (theme) return theme;
  } catch {
    // If outside ThemeProvider
  }
  const scheme = useRNColorScheme();
  return scheme === 'dark' ? 'dark' : 'light';
}
