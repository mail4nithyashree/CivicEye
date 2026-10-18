import ComplaintCard from '@/components/ComplaintCard';
import QuickActionCard from '@/components/QuickActionCard';
import { AppColors } from '@/constants/colors';
import { auth, db } from '@/firebaseConfig';
import { subscribeToUserComplaints, type Complaint } from '@/services/complaintService';
import {
  getLocallyReadNotificationIds,
  subscribeToCitizenNotifications,
  type CivicNotification,
} from '@/services/notificationService';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(auth.currentUser);

  const [displayName, setDisplayName] = useState('Citizen');
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loadingComplaints, setLoadingComplaints] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  const performLogout = async () => {
    try {
      setUser(null);
      setComplaints([]);
      await signOut(auth);
      router.replace('/login');
    } catch (err) {
      console.error('Citizen logout error:', err);
      router.replace('/login');
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Are you sure you want to log out of CivicEye?')) {
        performLogout();
      }
      return;
    }

    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to log out of CivicEye?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: performLogout,
        },
      ]
    );
  };

  // Sync auth state — currentUser can be null on first render
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

  // Fetch citizen's display name from Firestore
  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (isMounted && snap.exists()) {
        const data = snap.data();
        setDisplayName(data.fullName || data.fullname || data.name || user.displayName || user.email?.split('@')[0] || 'Citizen');
      }
    }).catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Real-time complaints subscription
  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const unsub = subscribeToUserComplaints(
      user.uid,
      data => {
        if (isMounted) {
          setComplaints(data);
          setLoadingComplaints(false);
          setRefreshing(false);
        }
      },
      () => {
        if (isMounted) {
          setLoadingComplaints(false);
          setRefreshing(false);
        }
      }
    );
    return () => {
      isMounted = false;
      unsub();
    };
  }, [user]);

  // Real-time notifications count subscription
  useEffect(() => {
    if (!user) return;
    let isMounted = true;

    const computeCount = async (notifs: CivicNotification[]) => {
      try {
        const locallyRead = new Set(await getLocallyReadNotificationIds());
        let count = 0;
        notifs.forEach(n => {
          if (!n.isRead && !locallyRead.has(n.id)) count++;
        });
        complaints.forEach(c => {
          if (!locallyRead.has(`synth_${c.id}_registered`)) count++;
          if ((c.status === 'Verified' || c.inspectionStatus === 'VALID') && !locallyRead.has(`synth_${c.id}_verified`)) count++;
          if (c.status === 'In Progress' && !locallyRead.has(`synth_${c.id}_progress`)) count++;
          if ((c.status === 'Resolved' || c.status === 'Closed') && !locallyRead.has(`synth_${c.id}_resolved`)) count++;
          if (c.status === 'Rejected' && !locallyRead.has(`synth_${c.id}_rejected`)) count++;
        });
        if (isMounted) setUnreadNotifCount(count);
      } catch {
        if (isMounted) setUnreadNotifCount(notifs.filter(n => !n.isRead).length);
      }
    };

    const unsub = subscribeToCitizenNotifications(
      user.uid,
      notifs => {
        computeCount(notifs);
      },
      () => {},
      user.email || undefined
    );
    return () => {
      isMounted = false;
      if (typeof unsub === 'function') unsub();
    };
  }, [user, complaints]);

  const total = complaints.length;
  const active = complaints.filter(c => !['Resolved', 'Closed', 'Rejected', 'Dissimilar Image to the Issue'].includes(c.status)).length;
  const resolved = complaints.filter(c => ['Resolved', 'Closed'].includes(c.status)).length;
  const recent = complaints.slice(0, 3);

  const firstName = displayName.split(' ')[0];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => setRefreshing(true)}
            tintColor={AppColors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Ionicons name="eye" size={26} color={AppColors.primary} />
            <Text style={styles.brandName}>CivicEye</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => router.push('/notifications')}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <Ionicons name="notifications-outline" size={22} color={AppColors.textPrimary} />
              {unreadNotifCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.logoutBtn}
              onPress={handleLogout}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Logout"
            >
              <Ionicons name="log-out-outline" size={18} color={AppColors.error} />
              <Text style={styles.logoutBtnText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Greeting */}
        <View style={styles.greetingSection}>
          <Text style={styles.greeting}>Hello, {firstName} 👋</Text>
          <Text style={styles.greetingSub}>Coimbatore Road Management • Maniyakarampalayam, Ganapathy, Gandhipuram, Peelamedu</Text>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard label="Total" value={total} color={AppColors.primary} />
          <StatCard label="Active" value={active} color="#C2410C" />
          <StatCard label="Resolved" value={resolved} color={AppColors.success} />
        </View>

        {/* Primary Report Card */}
        <TouchableOpacity
          style={styles.reportCard}
          onPress={() => router.push('/report')}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Report an Issue"
          accessibilityHint="Tap to report a new civic issue"
        >
          <View style={styles.reportCardLeft}>
            <Text style={styles.reportCardTitle}>Report an Issue</Text>
            <Text style={styles.reportCardSub}>Spot a problem? Report it and help improve your community.</Text>
            <View style={styles.reportCardBtn}>
              <Text style={styles.reportCardBtnText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={16} color={AppColors.white} />
            </View>
          </View>
          <View style={styles.reportCardIcon}>
            <Ionicons name="camera" size={40} color="rgba(255,255,255,0.9)" />
          </View>
        </TouchableOpacity>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          <QuickActionCard
            icon="add-circle-outline"
            label="Report Issue"
            onPress={() => router.push('/report')}
            accessibilityHint="Navigate to report a new issue"
          />
          <QuickActionCard
            icon="document-text-outline"
            label="My Complaints"
            onPress={() => router.push('/my-complaints')}
            accessibilityHint="View all your submitted complaints"
          />
          <QuickActionCard
            icon="map-outline"
            label="Civic Hub"
            onPress={() => router.push('/explore')}
            accessibilityHint="View city-wide road repair transparency and budgets"
          />

          <QuickActionCard
            icon="notifications-outline"
            label="Notifications"
            onPress={() => router.push('/notifications')}
            accessibilityHint="View complaint notifications"
          />
        </View>

        {/* Recent Complaints */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Complaints</Text>
          {complaints.length > 0 && (
            <TouchableOpacity
              onPress={() => router.push('/my-complaints')}
              accessible
              accessibilityRole="button"
              accessibilityLabel="View all complaints"
            >
              <Text style={styles.viewAll}>View All</Text>
            </TouchableOpacity>
          )}
        </View>

        {loadingComplaints ? (
          <ActivityIndicator color={AppColors.primary} style={{ marginVertical: 24 }} />
        ) : recent.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={AppColors.placeholder} />
            <Text style={styles.emptyTitle}>No complaints yet</Text>
            <Text style={styles.emptySubtitle}>Your submitted complaints will appear here.</Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => router.push('/report')}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Report your first issue"
            >
              <Text style={styles.emptyBtnText}>Report Your First Issue</Text>
            </TouchableOpacity>
          </View>
        ) : (
          recent.map(c => (
            <ComplaintCard
              key={c.id}
              complaint={c}
              onPress={() => router.push({ pathname: '/complaint-detail', params: { id: c.id } })}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.background },
  scroll: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 8,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  brandName: { fontSize: 22, fontWeight: '800', color: AppColors.primary, letterSpacing: 0.3 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      },
    }),
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: AppColors.error,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: AppColors.surface,
  },
  notifBadgeText: {
    color: AppColors.white,
    fontSize: 9,
    fontWeight: '800',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    ...Platform.select({
      web: {
        boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      },
    }),
  },
  logoutBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.error,
  },
  greetingSection: { marginBottom: 20 },
  greeting: { fontSize: 24, fontWeight: '800', color: AppColors.textPrimary, marginBottom: 4 },
  greetingSub: { fontSize: 14, color: AppColors.textSecondary, lineHeight: 19 },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  statCard: {
    flex: 1,
    minWidth: 90,
    backgroundColor: AppColors.surface,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      },
    }),
  },
  statValue: { fontSize: 24, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 12, color: AppColors.textSecondary, fontWeight: '500' },
  reportCard: {
    backgroundColor: AppColors.primary,
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    ...Platform.select({
      web: {
        boxShadow: '0px 4px 10px rgba(15, 118, 110, 0.3)',
      },
      default: {
        shadowColor: AppColors.primary,
        shadowOpacity: 0.3,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
      },
    }),
  },
  reportCardLeft: { flex: 1 },
  reportCardTitle: { fontSize: 20, fontWeight: '800', color: AppColors.white, marginBottom: 6 },
  reportCardSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginBottom: 16, lineHeight: 18 },
  reportCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  reportCardBtnText: { color: AppColors.white, fontWeight: '700', fontSize: 13 },
  reportCardIcon: { marginLeft: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: AppColors.textPrimary, marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 },
  viewAll: { fontSize: 13, color: AppColors.primary, fontWeight: '600' },
  quickActionsGrid: { flexDirection: 'row', gap: 10, marginBottom: 24, flexWrap: 'wrap' },
  emptyState: {
    alignItems: 'center',
    backgroundColor: AppColors.surface,
    borderRadius: 16,
    padding: 32,
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: AppColors.textPrimary, marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: AppColors.textSecondary, marginTop: 6, marginBottom: 20, textAlign: 'center' },
  emptyBtn: {
    backgroundColor: AppColors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyBtnText: { color: AppColors.white, fontWeight: '700', fontSize: 14 },
});
