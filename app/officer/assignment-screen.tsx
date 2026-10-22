import { useLocalSearchParams, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/context/ThemeContext';

export default function AssignmentScreenForwarder() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const rootNavigationState = useRootNavigationState();
  const { id } = useLocalSearchParams<{ id?: string }>();

  useEffect(() => {
    if (!rootNavigationState?.key) return;

    let isMounted = true;
    const timer = setTimeout(() => {
      if (!isMounted) return;
      if (id) {
        router.replace({
          pathname: '/officer/complaint-details',
          params: { id },
        });
      } else {
        router.back();
      }
    }, 0);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [id, rootNavigationState?.key, router]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.buttonPrimary} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
