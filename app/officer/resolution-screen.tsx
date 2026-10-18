import { useLocalSearchParams, useRootNavigationState, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppColors } from '@/constants/colors';

export default function ResolutionScreenForwarder() {
  const router = useRouter();
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
    <SafeAreaView style={styles.safe}>
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
