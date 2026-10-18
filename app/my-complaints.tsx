import ComplaintCard from '@/components/ComplaintCard';
import { AppColors } from '@/constants/colors';
import { auth } from '@/firebaseConfig';
import { subscribeToUserComplaints, type Complaint } from '@/services/complaintService';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, type User } from 'firebase/auth';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MyComplaintsScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    const unsub = onAuthStateChanged(auth, u => {
      if (isMounted) setUser(u);
    });
    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const unsub = subscribeToUserComplaints(
      user.uid,
      data => {
        if (isMounted) {
          setComplaints(data);
          setLoading(false);
        }
      },
      () => {
        if (isMounted) {
          setError('Unable to load complaints. Please try again.');
          setLoading(false);
        }
      }
    );
    return () => {
      isMounted = false;
      unsub();
    };
  }, [user]);

  const handleCardPress = useCallback((id: string) => {
    router.push({ pathname: '/complaint-detail', params: { id } });
  }, [router]);

  const renderComplaintItem = useCallback(({ item }: { item: Complaint }) => (
    <ComplaintCard
      complaint={item}
      onPress={() => handleCardPress(item.id)}
    />
  ), [handleCardPress]);

  const keyExtractor = useCallback((item: Complaint) => item.id, []);

  const ListHeader = useCallback(() => (
    <Text style={styles.count}>
      {complaints.length} complaint{complaints.length !== 1 ? 's' : ''} submitted
    </Text>
  ), [complaints.length]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={AppColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Complaints</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={AppColors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={48} color={AppColors.placeholder} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : complaints.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="document-text-outline" size={64} color={AppColors.placeholder} />
          <Text style={styles.emptyTitle}>No Complaints Yet</Text>
          <Text style={styles.emptySubtitle}>You haven&apos;t submitted any complaints.</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push('/report')}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Report your first issue"
          >
            <Text style={styles.primaryBtnText}>Report Your First Issue</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={complaints}
          renderItem={renderComplaintItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: AppColors.textPrimary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { fontSize: 15, color: AppColors.error, textAlign: 'center', marginTop: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: AppColors.textPrimary, marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: AppColors.textSecondary, marginTop: 6, marginBottom: 24, textAlign: 'center' },
  primaryBtn: {
    backgroundColor: AppColors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  primaryBtnText: { color: AppColors.white, fontSize: 15, fontWeight: '700' },
  list: { padding: 20, paddingTop: 8 },
  count: { fontSize: 13, color: AppColors.textSecondary, marginBottom: 12 },
});
