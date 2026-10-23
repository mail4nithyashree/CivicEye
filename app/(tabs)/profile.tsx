import AuthInput from '@/components/AuthInput';
import ThemeToggle from '@/components/ThemeToggle';
import { AppColors } from '@/constants/colors';
import { auth, db } from '@/firebaseConfig';
import { useAppTheme } from '@/context/ThemeContext';
import { seedSyntheticCivicData } from '@/services/demoDataService';
import { Ionicons } from '@expo/vector-icons';
import { useRootNavigationState, useRouter } from 'expo-router';
import {
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signOut,
  updatePassword,
  type User,
} from 'firebase/auth';
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CitizenProfileScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const [user, setUser] = useState<User | null>(auth.currentUser);

  // Profile Form States
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredRegion, setPreferredRegion] = useState('Gandhipuram');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  // Password Management States
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const { colors, isDark } = useAppTheme();

  // Synthetic Data Seeding State
  const [seedingData, setSeedingData] = useState(false);

  // Delete Account Confirmation Modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmPassword, setDeleteConfirmPassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Sync auth state
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

  // Fetch citizen data from Firestore
  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const fetchUserData = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!isMounted) return;
        if (snap.exists()) {
          const data = snap.data();
          setFullName(data.fullName || data.fullname || data.name || user.displayName || '');
          setPhone(data.phone || data.phoneNumber || '');
          setPreferredRegion(data.preferredRegion || 'Gandhipuram');
        } else {
          setFullName(user.displayName || user.email?.split('@')[0] || 'Citizen');
        }
      } catch (err) {
        console.error('Error fetching user profile:', err);
      } finally {
        if (isMounted) setLoadingProfile(false);
      }
    };
    fetchUserData();
    return () => {
      isMounted = false;
    };
  }, [user]);

  // Handle Profile Update
  const handleSaveProfile = async () => {
    if (!user) return;
    if (!fullName.trim()) {
      Alert.alert('Validation Error', 'Full name cannot be empty.');
      return;
    }

    setSavingProfile(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        fullName: fullName.trim(),
        phone: phone.trim(),
        preferredRegion,
        updatedAt: serverTimestamp(),
      });
      Alert.alert('Profile Updated', 'Your profile details have been successfully saved.');
    } catch (err: any) {
      console.error('Save profile error:', err);
      Alert.alert('Update Failed', err.message || 'Unable to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  // Handle Change Password
  const handleChangePassword = async () => {
    if (!user || !user.email) return;
    if (!currentPassword) {
      Alert.alert('Error', 'Please enter your current password.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match.');
      return;
    }

    setUpdatingPassword(true);
    try {
      // 1. Re-authenticate user
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // 2. Update password
      await updatePassword(user, newPassword);

      Alert.alert('Success', 'Your password has been changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordSection(false);
    } catch (err: any) {
      console.error('Change password error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        Alert.alert('Authentication Failed', 'Current password is incorrect.');
      } else {
        Alert.alert('Error', err.message || 'Failed to update password.');
      }
    } finally {
      setUpdatingPassword(false);
    }
  };

  // Handle Send Password Reset Email
  const handleSendResetEmail = async () => {
    if (!user || !user.email) return;
    setSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      Alert.alert(
        'Password Reset Sent',
        `A password reset link has been dispatched to ${user.email}. Check your inbox.`
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not send reset email.');
    } finally {
      setSendingReset(false);
    }
  };

  // Handle Seed Synthetic Data
  const handleSeedDemoData = async () => {
    setSeedingData(true);
    try {
      const result = await seedSyntheticCivicData(user?.uid, user?.email || undefined);
      if (result.success) {
        Alert.alert(
          'Synthetic Data Populated',
          `${result.count} road issue complaints across Coimbatore hubs (Dividers, Streetlights, Manholes, Waterlogging, Potholes, Cracks) have been seeded into the Civic Hub.`
        );
      } else {
        Alert.alert('Notice', result.message);
      }
    } catch (err: any) {
      Alert.alert('Seeding Error', err.message || 'Failed to seed synthetic complaints.');
    } finally {
      setSeedingData(false);
    }
  };

  // Handle Sign Out
  const performSignOut = async () => {
    try {
      setUser(null);
      await signOut(auth);
      router.replace('/login');
    } catch (err) {
      console.error('Sign out error:', err);
      router.replace('/login');
    }
  };

  const handleSignOut = () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Are you sure you want to log out of CivicEye?')) {
        performSignOut();
      }
      return;
    }

    Alert.alert(
      'Log Out',
      'Are you sure you want to log out of CivicEye?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: performSignOut,
        },
      ]
    );
  };

  // Handle Permanent Delete Account
  const handleDeleteAccount = async () => {
    if (!user || !user.email) return;
    if (!deleteConfirmPassword) {
      Alert.alert('Password Required', 'Please enter your password to confirm account deletion.');
      return;
    }

    setDeletingAccount(true);
    try {
      // 1. Re-authenticate
      const credential = EmailAuthProvider.credential(user.email, deleteConfirmPassword);
      await reauthenticateWithCredential(user, credential);

      // 2. Delete Firestore record
      await deleteDoc(doc(db, 'users', user.uid)).catch(err => console.warn('Firestore doc delete note:', err));

      // 3. Delete Firebase Auth user
      await deleteUser(user);

      Alert.alert('Account Deleted', 'Your profile and account data have been permanently removed.');
      setShowDeleteModal(false);
      router.replace('/login');
    } catch (err: any) {
      console.error('Delete account error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        Alert.alert('Authentication Failed', 'Incorrect password. Account was not deleted.');
      } else {
        Alert.alert('Delete Failed', err.message || 'Failed to delete account. Please try again.');
      }
    } finally {
      setDeletingAccount(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'C';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: colors.textOnDark }]}>Citizen Profile</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ThemeToggle />
              <TouchableOpacity
                style={styles.signOutHeaderBtn}
                onPress={handleSignOut}
                accessibilityRole="button"
                accessibilityLabel="Log Out"
              >
                <Ionicons name="log-out-outline" size={20} color={AppColors.error} />
                <Text style={styles.signOutHeaderText}>Log Out</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Profile Card / Avatar */}
          <View style={[styles.profileCard, isDark && { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
            <View style={[styles.avatarWrap, isDark && { backgroundColor: colors.surfaceElevated }]}>
              <Text style={[styles.avatarText, isDark && { color: colors.textPrimary }]}>{getInitials(fullName)}</Text>
            </View>
            <View style={styles.profileMeta}>
              <Text style={[styles.profileName, isDark && { color: colors.textPrimary }]}>{fullName || 'Citizen User'}</Text>
              <Text style={[styles.profileEmail, isDark && { color: colors.textSecondary }]}>{user?.email || 'citizen@example.com'}</Text>
              <View style={styles.badgeRow}>
                <View style={[styles.roleBadge, isDark && { backgroundColor: colors.surfaceElevated }]}>
                  <Ionicons name="shield-checkmark" size={12} color={isDark ? colors.buttonPrimary : AppColors.primary} />
                  <Text style={[styles.roleBadgeText, isDark && { color: colors.textPrimary }]}>Verified Citizen</Text>
                </View>
                <View style={[styles.regionBadge, isDark && { backgroundColor: colors.surfaceElevated }]}>
                  <Ionicons name="location" size={12} color={isDark ? colors.buttonPrimary : '#0D9488'} />
                  <Text style={[styles.regionBadgeText, isDark && { color: colors.textPrimary }]}>{preferredRegion}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Edit Profile Form */}
          <View style={[styles.sectionCard, isDark && { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={20} color={isDark ? colors.buttonPrimary : AppColors.primary} />
              <Text style={[styles.sectionTitle, isDark && { color: colors.textPrimary }]}>Personal Information</Text>
            </View>

            {loadingProfile ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
            ) : (
              <View style={styles.formContent}>
                <AuthInput
                  label="Full Name"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChangeText={setFullName}
                  accessibilityHint="Edit your full name"
                  labelStyle={isDark ? { color: colors.textPrimary } : undefined}
                />

                <AuthInput
                  label="Phone Number"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  accessibilityHint="Edit your contact phone number"
                  labelStyle={isDark ? { color: colors.textPrimary } : undefined}
                />

                <View style={styles.inputGroup}>
                  <Text style={[styles.inputLabel, isDark && { color: colors.textPrimary }]}>Primary Coimbatore Zone / Locality</Text>
                  <View style={styles.regionSelectorRow}>
                    {(['Gandhipuram', 'Peelamedu', 'Ganapathy', 'Maniyakarampalayam'] as const).map(reg => (
                      <TouchableOpacity
                        key={reg}
                        style={[
                          styles.regionChip,
                          isDark && { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight },
                          preferredRegion === reg && (isDark ? { backgroundColor: colors.buttonPrimary, borderColor: colors.buttonPrimary } : styles.regionChipActive),
                        ]}
                        onPress={() => setPreferredRegion(reg)}
                        accessibilityRole="button"
                      >
                        <Text
                          style={[
                            styles.regionChipText,
                            isDark && { color: colors.textPrimary },
                            preferredRegion === reg && [styles.regionChipTextActive, isDark && { color: colors.white }],
                          ]}
                        >
                          {reg}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.primaryActionBtn, isDark && { backgroundColor: colors.buttonPrimary }, savingProfile && styles.btnDisabled]}
                  onPress={handleSaveProfile}
                  disabled={savingProfile}
                  accessibilityRole="button"
                  accessibilityLabel="Save Profile Changes"
                >
                  {savingProfile ? (
                    <ActivityIndicator size="small" color={AppColors.white} />
                  ) : (
                    <View style={styles.btnRow}>
                      <Ionicons name="save-outline" size={18} color={AppColors.white} />
                      <Text style={[styles.primaryActionBtnText, isDark && { color: colors.buttonText }]}>Save Profile Details</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Security & Password Management */}
          <View style={[styles.sectionCard, isDark && { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
            <TouchableOpacity
              style={styles.sectionHeaderToggle}
              onPress={() => setShowPasswordSection(!showPasswordSection)}
              accessibilityRole="button"
            >
              <View style={styles.sectionHeader}>
                <Ionicons name="key-outline" size={20} color={isDark ? colors.buttonPrimary : AppColors.primary} />
                <Text style={[styles.sectionTitle, isDark && { color: colors.textPrimary }]}>Security & Password</Text>
              </View>
              <Ionicons
                name={showPasswordSection ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={isDark ? colors.textSecondary : AppColors.textSecondary}
              />
            </TouchableOpacity>

            {showPasswordSection && (
              <View style={styles.passwordForm}>
                <AuthInput
                  label="Current Password"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  isPassword
                  accessibilityHint="Enter your current account password"
                  labelStyle={isDark ? { color: colors.textPrimary } : undefined}
                />

                <AuthInput
                  label="New Password"
                  placeholder="Enter new password (min 6 chars)"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  isPassword
                  accessibilityHint="Enter a new strong password"
                  labelStyle={isDark ? { color: colors.textPrimary } : undefined}
                />

                <AuthInput
                  label="Confirm New Password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  isPassword
                  accessibilityHint="Confirm your new password"
                  labelStyle={isDark ? { color: colors.textPrimary } : undefined}
                />

                <TouchableOpacity
                  style={[styles.primaryActionBtn, isDark && { backgroundColor: colors.buttonPrimary }, updatingPassword && styles.btnDisabled]}
                  onPress={handleChangePassword}
                  disabled={updatingPassword}
                  accessibilityRole="button"
                >
                  {updatingPassword ? (
                    <ActivityIndicator size="small" color={AppColors.white} />
                  ) : (
                    <Text style={[styles.primaryActionBtnText, isDark && { color: colors.buttonText }]}>Update Password</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.resetEmailBtn}
                  onPress={handleSendResetEmail}
                  disabled={sendingReset}
                >
                  {sendingReset ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={[styles.resetEmailText, isDark && { color: colors.buttonPrimary }]}>Forgot password? Send Reset Email Link</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Account Logout Card */}
          <View style={[styles.sectionCard, isDark && { backgroundColor: colors.card, borderColor: colors.borderLight }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="log-out-outline" size={20} color={AppColors.error} />
              <Text style={[styles.sectionTitle, isDark && { color: colors.textPrimary }]}>Account Session</Text>
            </View>
            <Text style={[styles.sessionDesc, isDark && { color: colors.textSecondary }]}>
              Logged in as <Text style={{ fontWeight: '700' }}>{user?.email || 'Citizen'}</Text>. Sign out of your session on this device.
            </Text>
            <TouchableOpacity
              style={[styles.profileLogoutBtn, isDark && { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight }]}
              onPress={handleSignOut}
              accessibilityRole="button"
              accessibilityLabel="Log Out of CivicEye"
            >
              <Ionicons name="log-out-outline" size={18} color={AppColors.error} />
              <Text style={styles.profileLogoutBtnText}>Log Out of CivicEye</Text>
            </TouchableOpacity>
          </View>

          {/* Danger Zone / Delete Account */}
          <View style={[styles.sectionCard, styles.dangerCard, isDark && { backgroundColor: colors.card, borderColor: '#FCA5A5' }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="warning-outline" size={20} color={AppColors.error} />
              <Text style={[styles.sectionTitle, { color: AppColors.error }]}>Danger Zone</Text>
            </View>
            <Text style={[styles.dangerText, isDark && { color: colors.textSecondary }]}>
              Permanently delete your citizen profile, contact details, and account credentials from the CivicEye registry.
            </Text>

            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => setShowDeleteModal(true)}
              accessibilityRole="button"
              accessibilityLabel="Delete Account Permanently"
            >
              <Ionicons name="trash-outline" size={18} color={AppColors.white} />
              <Text style={styles.deleteBtnText}>Delete Profile Permanently</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Delete Account Modal */}
      <Modal
        visible={showDeleteModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { maxHeight: 380 }]}>
            <View style={styles.deleteModalHeader}>
              <Ionicons name="alert-circle" size={40} color={AppColors.error} />
              <Text style={styles.deleteModalTitle}>Confirm Permanent Deletion</Text>
              <Text style={styles.deleteModalSub}>
                This action is irreversible. Your citizen profile and login credentials will be removed.
              </Text>
            </View>

            <View style={{ paddingHorizontal: 20 }}>
              <AuthInput
                label="Enter Password to Confirm"
                placeholder="Your current password"
                value={deleteConfirmPassword}
                onChangeText={setDeleteConfirmPassword}
                isPassword
                accessibilityHint="Confirm password to delete account"
              />
            </View>

            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowDeleteModal(false)}
                disabled={deletingAccount}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmDeleteBtn, deletingAccount && styles.btnDisabled]}
                onPress={handleDeleteAccount}
                disabled={deletingAccount}
              >
                {deletingAccount ? (
                  <ActivityIndicator size="small" color={AppColors.white} />
                ) : (
                  <Text style={styles.confirmDeleteBtnText}>Delete Permanently</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.background },
  flex: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: AppColors.textPrimary },
  signOutHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  signOutHeaderText: { fontSize: 13, fontWeight: '700', color: AppColors.error },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    gap: 16,
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
        elevation: 2,
      },
    }),
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '800', color: AppColors.white },
  profileMeta: { flex: 1 },
  profileName: { fontSize: 18, fontWeight: '800', color: AppColors.textPrimary },
  profileEmail: { fontSize: 13, color: AppColors.textSecondary, marginTop: 2 },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '700', color: AppColors.primary },
  regionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#CCFBF1',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  regionBadgeText: { fontSize: 11, fontWeight: '700', color: '#0D9488' },
  sectionCard: {
    backgroundColor: AppColors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHeaderToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: AppColors.textPrimary },
  sectionDescription: {
    fontSize: 13,
    color: AppColors.textSecondary,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 12,
  },
  formContent: { marginTop: 12 },
  inputGroup: { marginBottom: 14 },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: AppColors.textPrimary,
    marginBottom: 8,
  },
  regionSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  regionChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: AppColors.background,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  regionChipActive: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  regionChipText: { fontSize: 12, fontWeight: '600', color: AppColors.textSecondary },
  regionChipTextActive: { color: AppColors.white, fontWeight: '700' },
  primaryActionBtn: {
    backgroundColor: AppColors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryActionBtnText: { color: AppColors.white, fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  capabilityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F3FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    marginBottom: 10,
  },
  capabilityLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  capabilityTitle: { fontSize: 14, fontWeight: '700', color: '#6D28D9' },
  capabilitySub: { fontSize: 11, color: AppColors.textSecondary, marginTop: 2 },
  seedDataBtn: {
    backgroundColor: '#F0FDFA',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  seedDataBtnText: { color: '#0D9488', fontSize: 13, fontWeight: '700' },
  passwordForm: { marginTop: 14 },
  resetEmailBtn: { alignItems: 'center', marginTop: 12, paddingVertical: 6 },
  resetEmailText: { fontSize: 13, fontWeight: '600', color: AppColors.primary },
  sessionDesc: { fontSize: 13, color: AppColors.textSecondary, lineHeight: 18, marginBottom: 12 },
  profileLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  profileLogoutBtnText: { color: AppColors.error, fontSize: 14, fontWeight: '700' },
  dangerCard: { borderColor: '#FECACA', backgroundColor: '#FFF5F5' },
  dangerText: { fontSize: 12, color: AppColors.textSecondary, lineHeight: 17, marginTop: 6, marginBottom: 12 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AppColors.error,
    borderRadius: 12,
    paddingVertical: 13,
  },
  deleteBtnText: { color: AppColors.white, fontSize: 14, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContainer: {
    backgroundColor: AppColors.surface,
    borderRadius: 20,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: AppColors.border,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: AppColors.textPrimary },
  modalSub: { fontSize: 12, color: AppColors.textSecondary, marginTop: 2 },
  modalList: { padding: 16 },
  issueCard: {
    backgroundColor: AppColors.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  issueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  issueTitle: { fontSize: 15, fontWeight: '700', color: AppColors.textPrimary, flexShrink: 1 },
  priorityPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  priorityPillText: { fontSize: 10, fontWeight: '800' },
  issueCategory: { fontSize: 11, fontWeight: '600', color: AppColors.primary, marginTop: 2 },
  issueDesc: { fontSize: 12, color: AppColors.textSecondary, lineHeight: 16, marginVertical: 6 },
  deptBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: AppColors.surface,
    padding: 8,
    borderRadius: 8,
    marginVertical: 4,
    flexWrap: 'wrap',
  },
  deptBoxText: { fontSize: 11, color: AppColors.textPrimary, flexShrink: 1 },
  featureWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  featureTag: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  featureTagText: { fontSize: 10, color: AppColors.textSecondary },
  modalCloseBtn: {
    backgroundColor: AppColors.primary,
    paddingVertical: 14,
    alignItems: 'center',
    margin: 16,
    borderRadius: 12,
  },
  modalCloseBtnText: { color: AppColors.white, fontSize: 15, fontWeight: '700' },
  deleteModalHeader: { alignItems: 'center', padding: 20, textAlign: 'center' },
  deleteModalTitle: { fontSize: 17, fontWeight: '800', color: AppColors.textPrimary, marginTop: 10 },
  deleteModalSub: { fontSize: 13, color: AppColors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  deleteModalActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    paddingTop: 10,
    flexWrap: 'wrap',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: AppColors.background,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: AppColors.textPrimary },
  confirmDeleteBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: AppColors.error,
    alignItems: 'center',
  },
  confirmDeleteBtnText: { fontSize: 14, fontWeight: '700', color: AppColors.white },
});
