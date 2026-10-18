import { AppColors } from '@/constants/colors';
import { auth } from '@/firebaseConfig';
import { subscribeToOfficerProfile, type Officer } from '@/services/officerService';
import { Ionicons } from '@expo/vector-icons';
import { useRootNavigationState, useRouter } from 'expo-router';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function OfficerProfileScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [officer, setOfficer] = useState<Officer | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth state listener
  useEffect(() => {
    if (!rootNavigationState?.key) return;
    let isMounted = true;
    const unsub = onAuthStateChanged(auth, u => {
      if (!isMounted) return;
      setUser(u);
      if (!u) {
        setTimeout(() => {
          if (isMounted) router.replace('/login');
        }, 0);
      }
    });
    return () => {
      isMounted = false;
      unsub();
    };
  }, [rootNavigationState?.key, router]);

  // Officer profile listener
  useEffect(() => {
    if (!rootNavigationState?.key || !user) return;
    let isMounted = true;
    const unsub = subscribeToOfficerProfile(
      user.uid,
      profile => {
        if (!isMounted) return;
        if (!profile) {
          const email = user.email || '';
          setOfficer({
            id: user.uid,
            email,
            name: email.split('@')[0] || 'Officer',
            role: 'officer',
            department: 'Road Maintenance',
            active: true,
          });
          setLoading(false);
          return;
        }
        if (profile.role === 'citizen') {
          setTimeout(() => {
            if (isMounted) router.replace('/(tabs)');
          }, 0);
          return;
        }
        setOfficer(profile);
        setLoading(false);
      },
      () => {
        if (!isMounted) return;
        const email = user.email || '';
        setOfficer({
          id: user.uid,
          email,
          name: email.split('@')[0] || 'Officer',
          role: 'officer',
          department: 'Road Maintenance',
          active: true,
        });
        setLoading(false);
      }
    );
    return () => {
      isMounted = false;
      unsub();
    };
  }, [user, rootNavigationState?.key, router]);

  const performLogout = async () => {
    try {
      setOfficer(null);
      await signOut(auth);
      router.replace('/login');
    } catch (error) {
      console.error('Error signing out:', error);
      router.replace('/login');
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Are you sure you want to log out of Officer Account?')) {
        performLogout();
      }
      return;
    }

    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to log out of Officer Account?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: performLogout },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={AppColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Officer Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Avatar Card */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={48} color={AppColors.white} />
          </View>
          <Text style={styles.nameText}>{officer?.name || 'Officer'}</Text>
          <View style={styles.roleBadge}>
            <Ionicons name="shield-checkmark" size={13} color={AppColors.primary} />
            <Text style={styles.roleBadgeText}>
              {officer?.role === 'main_officer' ? 'Main Officer' : 'Field Inspector'}
            </Text>
          </View>
          <Text style={styles.deptSubtext}>
            {officer?.department || 'Road Maintenance Department'}
          </Text>
        </View>

        {/* Account Details Card */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Account Details</Text>

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="mail-outline" size={18} color={AppColors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Email Address</Text>
              <Text style={styles.value}>{officer?.email || user?.email}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="business-outline" size={18} color={AppColors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Department</Text>
              <Text style={styles.value}>
                {officer?.department || 'Road Maintenance Department'}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="checkmark-circle-outline" size={18} color={AppColors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Account Status</Text>
              <Text style={[styles.value, { color: AppColors.success, fontWeight: '700' }]}>
                {officer?.active !== false ? 'Active Duty' : 'Inactive'}
              </Text>
            </View>
          </View>

          {officer?.phone ? (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <View style={styles.iconCircle}>
                  <Ionicons name="call-outline" size={18} color={AppColors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Phone</Text>
                  <Text style={styles.value}>{officer.phone}</Text>
                </View>
              </View>
            </>
          ) : null}
        </View>

        {/* Security & System Info */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>CivicEye Officer Portal</Text>
          <Text style={styles.portalDescription}>
            Authorized access strictly for civic infrastructure management. All status transitions, assignments, and verification remarks are logged with officer credentials.
          </Text>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.8}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Sign Out of Officer Account"
        >
          <Ionicons name="log-out-outline" size={20} color={AppColors.error} />
          <Text style={styles.logoutBtnText}>Sign Out of Officer Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.background },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: AppColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: AppColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: AppColors.textPrimary },
  scroll: { padding: 18, paddingBottom: 40 },
  avatarSection: {
    alignItems: 'center',
    backgroundColor: AppColors.surface,
    borderRadius: 18,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: AppColors.border,
    ...Platform.select({
      web: {
        boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.04)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
      },
    }),
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: AppColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  nameText: {
    fontSize: 20,
    fontWeight: '800',
    color: AppColors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
    flexShrink: 1,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: AppColors.primary,
  },
  deptSubtext: {
    fontSize: 12,
    color: AppColors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
    flexShrink: 1,
  },
  card: {
    backgroundColor: AppColors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: AppColors.border,
    ...Platform.select({
      web: {
        boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.03)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      },
    }),
  },
  cardSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: AppColors.textPrimary,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: AppColors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 11, color: AppColors.textSecondary, marginBottom: 2 },
  value: { fontSize: 14, fontWeight: '600', color: AppColors.textPrimary, flexShrink: 1 },
  divider: { height: 1, backgroundColor: AppColors.border, marginVertical: 12 },
  portalDescription: {
    fontSize: 12,
    color: AppColors.textSecondary,
    lineHeight: 18,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AppColors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8,
    borderWidth: 1.5,
    borderColor: '#FECACA',
  },
  logoutBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: AppColors.error,
  },
});

