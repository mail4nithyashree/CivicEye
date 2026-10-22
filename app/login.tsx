import AuthInput from '@/components/AuthInput';
import ThemeToggle from '@/components/ThemeToggle';
import { AppColors } from '@/constants/colors';
import { useAppTheme } from '@/context/ThemeContext';
import { auth, db } from '@/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type UserPersona = 'citizen' | 'officer';

function validate(email: string, password: string) {
  const errors: { email?: string; password?: string } = {};
  if (!email.trim()) {
    errors.email = 'Email is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = 'Please enter a valid email address.';
  }
  if (!password) {
    errors.password = 'Password is required.';
  } else if (password.length < 6) {
    errors.password = 'Password must be at least 6 characters.';
  }
  return errors;
}

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [persona, setPersona] = useState<UserPersona>('citizen');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);

  const handlePersonaChange = (newPersona: UserPersona) => {
    setPersona(newPersona);
    setErrors({});
  };

  const handleLogin = async () => {
    const errs = validate(email, password);
    setErrors(errs);

    if (Object.keys(errs).length > 0) return;

    setLoading(true);

    try {
      // 1. Authenticate with Firebase Auth
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      const user = userCredential.user;

      // 2. Fetch fresh user profile from Firestore users/{uid} — SINGLE SOURCE OF TRUTH
      const userDocSnap = await getDoc(doc(db, 'users', user.uid));
      const userData = userDocSnap.exists() ? userDocSnap.data() : null;
      
      console.log('AUTH EMAIL:', auth.currentUser?.email || user.email);
      console.log('AUTH UID:', auth.currentUser?.uid || user.uid);
      console.log('FIRESTORE DOCUMENT PATH:', `users/${user.uid}`);
      console.log('FIRESTORE EXISTS:', userDocSnap.exists());
      if (userDocSnap.exists()) {
        console.log('FIRESTORE DATA:', userData);
        console.log('FIRESTORE EMAIL:', userData?.email);
      }

      if (!userDocSnap.exists()) {
        if (persona === 'officer') {
          console.error('Officer document does not exist in Firestore for UID:', user.uid);
          await signOut(auth);
          Alert.alert(
            'Officer Profile Not Found',
            'Officer profile not found. Please contact the administrator.'
          );
          setLoading(false);
          return;
        } else {
          // Initialize default citizen profile in Firestore for seamless citizen access
          const defaultCitizenData = {
            uid: user.uid,
            email: user.email || '',
            fullName: user.displayName || user.email?.split('@')[0] || 'Citizen',
            role: 'citizen',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          await setDoc(doc(db, 'users', user.uid), defaultCitizenData, { merge: true });
        }
      }

      const rawRole = userData?.role;
      const userRole = typeof rawRole === 'string' ? rawRole.trim() : 'citizen';
      const isOfficerRole = ['main_officer', 'field_inspector', 'admin', 'authority'].includes(userRole);
      
      const userName =
        (typeof userData?.fullName === 'string' && userData.fullName.trim()) ||
        (typeof userData?.fullname === 'string' && userData.fullname.trim()) ||
        (typeof userData?.name === 'string' && userData.name.trim()) ||
        (typeof userData?.displayName === 'string' && userData.displayName.trim()) ||
        (typeof user.email === 'string' && user.email.split('@')[0]) ||
        (isOfficerRole ? 'Main Officer' : 'Citizen');

      const isActive =
        userData?.active !== false &&
        userData?.active !== 'false' &&
        userData?.active !== 0 &&
        userData?.active !== '0';

      // 3. Update last login timestamp in background
      updateDoc(doc(db, 'users', user.uid), {
        lastLoginAt: serverTimestamp(),
      }).catch(() => {});

      // 4. Validate active status for officers
      if (isOfficerRole && !isActive) {
        await signOut(auth);
        Alert.alert(
          'Account Inactive',
          'This officer account has been deactivated. Please contact your department administrator.'
        );
        setLoading(false);
        return;
      }

      // 5. Enforce persona restriction if selected as officer
      if (persona === 'officer' && !isOfficerRole) {
        console.warn('Access Denied: Persona is officer but userRole is:', userRole);
        await signOut(auth);
        Alert.alert(
          'Access Denied',
          'This account is not registered as an Officer or Field Inspector.'
        );
        setLoading(false);
        return;
      }

      // 6. Determine canonical target route based on Firestore role
      let targetRoute: string;
      if (isOfficerRole) {
        targetRoute = '/officer/main-dashboard';
      } else {
        targetRoute = '/(tabs)';
      }

      // 7. Role-specific debugging console logs
      console.log('FIRESTORE ROLE:', userRole);
      if (isOfficerRole) {
        console.log('OFFICER NAME:', userName);
      } else {
        console.log('CITIZEN NAME:', userName);
      }
      console.log('TARGET ROUTE:', targetRoute);

      // 8. Execute clean replacement navigation
      router.replace(targetRoute as any);
    } catch (error: any) {
      console.log('Login error:', error);

      if (
        error.code === 'auth/invalid-credential' ||
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/user-not-found'
      ) {
        setErrors({
          email: 'Invalid email or password.',
          password: 'Invalid email or password.',
        });
      } else if (error.code === 'auth/invalid-email') {
        setErrors({
          email: 'Please enter a valid email address.',
        });
      } else {
        Alert.alert('Login Failed', error.message || 'Unable to log in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <ThemeToggle showLabel />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo / Brand Header */}
          <View style={styles.brandRow} accessible accessibilityRole="header">
            <View style={[styles.iconCircle, { backgroundColor: colors.buttonPrimary }]}>
              <Ionicons name="eye" size={28} color="#FFFFFF" />
            </View>
            <View>
              <Text style={[styles.appName, { color: colors.textOnDark }]}>CivicEye</Text>
              <Text style={[styles.deptBadge, { color: colors.borderLight }]}>Road Maintenance Portal</Text>
            </View>
          </View>

          {/* Persona Selection */}
          <View style={[styles.personaContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.personaHeading, { color: colors.textSecondary }]}>Who are you?</Text>
            <View style={[styles.toggleRow, { backgroundColor: colors.surfaceElevated }]}>
              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  persona === 'citizen' && [styles.toggleBtnActive, { backgroundColor: colors.buttonPrimary }],
                ]}
                onPress={() => handlePersonaChange('citizen')}
                accessible
                accessibilityRole="tab"
                accessibilityLabel="Citizen Login Option"
                accessibilityState={{ selected: persona === 'citizen' }}
              >
                <Ionicons
                  name="person"
                  size={18}
                  color={persona === 'citizen' ? '#FFFFFF' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.toggleBtnText,
                    { color: colors.textSecondary },
                    persona === 'citizen' && [styles.toggleBtnTextActive, { color: '#FFFFFF' }],
                  ]}
                >
                  Citizen
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  persona === 'officer' && [styles.toggleBtnActive, { backgroundColor: colors.buttonPrimary }],
                ]}
                onPress={() => handlePersonaChange('officer')}
                accessible
                accessibilityRole="tab"
                accessibilityLabel="Officer Login Option"
                accessibilityState={{ selected: persona === 'officer' }}
              >
                <Ionicons
                  name="shield-checkmark"
                  size={18}
                  color={persona === 'officer' ? '#FFFFFF' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.toggleBtnText,
                    { color: colors.textSecondary },
                    persona === 'officer' && [styles.toggleBtnTextActive, { color: '#FFFFFF' }],
                  ]}
                >
                  Officer
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Screen Title */}
          <View style={styles.titleSection}>
            <Text style={[styles.heading, { color: colors.textOnDark }]}>
              {persona === 'citizen' ? 'Citizen Sign In' : 'Officer Sign In'}
            </Text>
            <Text style={[styles.subheading, { color: colors.textOnDarkSecondary }]}>
              {persona === 'citizen'
                ? 'Report potholes, road damage, and track repair status.'
                : 'Road Maintenance Department — Main Officers & Field Inspectors.'}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <AuthInput
              label="Email"
              placeholder={persona === 'citizen' ? 'citizen@example.com' : 'officer@civiceye.gov'}
              value={email}
              onChangeText={t => {
                setEmail(t);
                setErrors(e => ({ ...e, email: undefined }));
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              error={errors.email}
              accessibilityHint="Enter your registered email address"
            />

            <AuthInput
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={t => {
                setPassword(t);
                setErrors(e => ({ ...e, password: undefined }));
              }}
              isPassword
              autoComplete="password"
              textContentType="password"
              error={errors.password}
              accessibilityHint="Enter your password"
            />

            {/* Login Button */}
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: colors.buttonPrimary },
                loading && styles.primaryBtnDisabled,
              ]}
              onPress={handleLogin}
              disabled={loading}
              accessible
              accessibilityRole="button"
              accessibilityLabel={`${persona === 'citizen' ? 'Citizen' : 'Officer'} Login`}
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              {loading ? (
                <ActivityIndicator
                  color="#FFFFFF"
                  accessibilityLabel="Signing in, please wait"
                />
              ) : (
                <View style={styles.btnContent}>
                  <Text style={[styles.primaryBtnText, { color: colors.buttonText }]}>
                    {persona === 'citizen' ? 'Sign In as Citizen' : 'Sign In as Officer'}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Navigate to Sign Up (Citizen Only) */}
          {persona === 'citizen' ? (
            <View style={styles.switchRow}>
              <Text style={[styles.switchText, { color: colors.textOnDarkSecondary }]}>Don&apos;t have an account? </Text>
              <TouchableOpacity
                onPress={() => router.push('/signup')}
                accessible
                accessibilityRole="link"
                accessibilityLabel="Sign Up"
                accessibilityHint="Go to Sign Up screen to create a new citizen account"
              >
                <Text style={[styles.switchLink, { color: colors.buttonPrimary }]}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.officerNotice}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textOnDarkSecondary} />
              <Text style={[styles.officerNoticeText, { color: colors.textOnDarkSecondary }]}>
                Officer credentials and roles are provisioned by the Road Maintenance Administration.
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.background },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0px 4px 8px rgba(15, 118, 110, 0.25)',
      },
      default: {
        shadowColor: AppColors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  },
  appName: {
    fontSize: 26,
    fontWeight: '800',
    color: AppColors.textPrimary,
    letterSpacing: 0.5,
  },
  deptBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: AppColors.primary,
    marginTop: -2,
  },
  personaContainer: {
    backgroundColor: AppColors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: AppColors.border,
    ...Platform.select({
      web: {
        boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.04)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
      },
    }),
  },
  personaHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
    textAlign: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: AppColors.background,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  toggleBtnActive: {
    backgroundColor: AppColors.primary,
    ...Platform.select({
      web: {
        boxShadow: '0px 2px 4px rgba(15, 118, 110, 0.2)',
      },
      default: {
        shadowColor: AppColors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },
  toggleBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: AppColors.textSecondary,
  },
  toggleBtnTextActive: {
    color: AppColors.white,
    fontWeight: '700',
  },
  titleSection: {
    marginBottom: 24,
    alignItems: 'center',
  },
  heading: {
    fontSize: 22,
    fontWeight: '800',
    color: AppColors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  subheading: {
    fontSize: 13,
    color: AppColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  form: { width: '100%' },
  primaryBtn: {
    backgroundColor: AppColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: 8,
    ...Platform.select({
      web: {
        boxShadow: '0px 4px 8px rgba(15, 118, 110, 0.25)',
      },
      default: {
        shadowColor: AppColors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 3,
      },
    }),
  },
  primaryBtnDisabled: { backgroundColor: AppColors.disabled, ...Platform.select({ web: { boxShadow: 'none' }, default: { shadowOpacity: 0 } }) },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  switchText: { fontSize: 14, color: AppColors.textSecondary },
  switchLink: {
    fontSize: 14,
    color: AppColors.primary,
    fontWeight: '700',
  },
  officerNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
    paddingHorizontal: 16,
  },
  officerNoticeText: {
    fontSize: 12,
    color: AppColors.textSecondary,
    textAlign: 'center',
    flex: 1,
    lineHeight: 16,
  },
});

