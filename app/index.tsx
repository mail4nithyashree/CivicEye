import { AppColors } from '@/constants/colors';
import { auth, db } from '@/firebaseConfig';
import { useRootNavigationState, useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Index() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (!rootNavigationState?.key) return;
    if (navigatedRef.current) return;

    let isMounted = true;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!isMounted || navigatedRef.current) return;

      if (!user) {
        navigatedRef.current = true;
        setTimeout(() => {
          if (isMounted) router.replace('/login');
        }, 50);
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!isMounted || navigatedRef.current) return;

        const role = userDoc.exists() ? userDoc.data()?.role : 'citizen';
        navigatedRef.current = true;

        setTimeout(() => {
          if (!isMounted) return;
          if (['main_officer', 'field_inspector', 'admin', 'authority'].includes(role)) {
            router.replace('/officer/main-dashboard' as any);
          } else {
            router.replace('/(tabs)');
          }
        }, 50);
      } catch {
        if (isMounted && !navigatedRef.current) {
          navigatedRef.current = true;
          const email = user.email || '';
          setTimeout(() => {
            if (!isMounted) return;
            if (email.includes('inspector') || email.includes('field') || email.includes('main') || email.includes('officer') || email.includes('pwd')) {
              router.replace('/officer/main-dashboard' as any);
            } else {
              router.replace('/(tabs)');
            }
          }, 50);
        }
      }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [rootNavigationState?.key, router]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppColors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
