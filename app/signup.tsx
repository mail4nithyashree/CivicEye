import AuthInput from '@/components/AuthInput';
import ThemeToggle from '@/components/ThemeToggle';
import { AppColors } from '@/constants/colors';
import { useAppTheme } from '@/context/ThemeContext';
import { auth, db } from '@/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

function validate(name: string, email: string, password: string, confirmPassword: string): FormErrors {
  const errors: FormErrors = {};
  if (!name.trim()) {
    errors.name = 'Full name is required.';
  } else if (name.trim().length < 2) {
    errors.name = 'Please enter your full name.';
  }
  if (!email.trim()) {
    errors.email = 'Email is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Please enter a valid email address.';
  }
  if (!password) {
    errors.password = 'Password is required.';
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }
  if (!confirmPassword) {
    errors.confirmPassword = 'Please confirm your password.';
  } else if (password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  return errors;
}

export default function SignUpScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  const clearError = (field: keyof FormErrors) =>
    setErrors(e => ({ ...e, [field]: undefined }));

  const handleSignUp = async () => {
  const errs = validate(name, email, password, confirmPassword);
  setErrors(errs);

  if (Object.keys(errs).length > 0) return;

  setLoading(true);

  try {
    // 1. Create account in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );

    // 2. Get the Firebase UID
    const user = userCredential.user;

    // 3. Store citizen information in Firestore
    await setDoc(doc(db, 'users', user.uid), {
      fullName: name.trim(),
      email: email.trim(),
      role: 'citizen',
      createdAt: serverTimestamp(),
    });

    alert('Account created successfully!');

    // Go back to Login
    router.back();

  } catch (error: any) {
    console.log('Signup error:', error);

    if (error.code === 'auth/email-already-in-use') {
      setErrors({
        email: 'This email is already registered.',
      });
    } else if (error.code === 'auth/invalid-email') {
      setErrors({
        email: 'Please enter a valid email address.',
      });
    } else if (error.code === 'auth/weak-password') {
      setErrors({
        password: 'Password is too weak.',
      });
    } else {
      alert('Unable to create account. Please try again.');
    }
  } finally {
    setLoading(false);
  }
};
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.textOnDark} />
        </TouchableOpacity>
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
          {/* Logo / Brand */}
          <View style={styles.brandRow} accessible accessibilityRole="header">
            <Ionicons name="eye-outline" size={36} color={colors.buttonPrimary} />
            <Text style={[styles.appName, { color: colors.textOnDark }]}>CivicEye</Text>
          </View>

          <Text style={[styles.heading, { color: colors.textOnDark }]}>Create Your CivicEye Account</Text>
          <Text style={[styles.subheading, { color: colors.textOnDarkSecondary }]}>Fill in the details below to get started</Text>

          {/* Form */}
          <View style={styles.form}>
            <AuthInput
              label="Full Name"
              placeholder="e.g. Jane Smith"
              value={name}
              onChangeText={t => { setName(t); clearError('name'); }}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              error={errors.name}
              accessibilityHint="Enter your first and last name"
            />

            <AuthInput
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={t => { setEmail(t); clearError('email'); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              error={errors.email}
              accessibilityHint="Enter a valid email address"
            />

            <AuthInput
              label="Password"
              placeholder="At least 8 characters"
              value={password}
              onChangeText={t => { setPassword(t); clearError('password'); }}
              isPassword
              autoComplete="new-password"
              textContentType="newPassword"
              error={errors.password}
              accessibilityHint="Choose a password with at least 8 characters"
            />

            {/* Password hint */}
            {!errors.password && (
              <Text style={[styles.hint, { color: colors.textOnDarkSecondary }]}>Use at least 8 characters.</Text>
            )}

            <AuthInput
              label="Confirm Password"
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChangeText={t => { setConfirmPassword(t); clearError('confirmPassword'); }}
              isPassword
              autoComplete="new-password"
              textContentType="newPassword"
              error={errors.confirmPassword}
              accessibilityHint="Re-enter your password to confirm it matches"
            />

            {/* Sign Up Button */}
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: colors.buttonPrimary },
                loading && styles.primaryBtnDisabled,
              ]}
              onPress={handleSignUp}
              disabled={loading}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Create Account"
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" accessibilityLabel="Creating account, please wait" />
              ) : (
                <Text style={[styles.primaryBtnText, { color: colors.buttonText }]}>Create Account</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Navigate to Login */}
          <View style={styles.switchRow}>
            <Text style={[styles.switchText, { color: colors.textOnDarkSecondary }]}>Already have an account? </Text>
            <TouchableOpacity
              onPress={() => router.back()}
              accessible
              accessibilityRole="link"
              accessibilityLabel="Login"
              accessibilityHint="Go back to the Login screen"
            >
              <Text style={[styles.switchLink, { color: colors.buttonPrimary }]}>Login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.background },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  backButton: {
    padding: 6,
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 10,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: AppColors.primary,
    letterSpacing: 0.5,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: AppColors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  subheading: {
    fontSize: 15,
    color: AppColors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  form: { width: '100%' },
  hint: {
    fontSize: 12,
    color: AppColors.textSecondary,
    marginTop: -10,
    marginBottom: 16,
    marginLeft: 2,
  },
  primaryBtn: {
    backgroundColor: AppColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryBtnDisabled: { backgroundColor: AppColors.disabled },
  primaryBtnText: {
    color: AppColors.white,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
  },
  switchText: { fontSize: 15, color: AppColors.textSecondary },
  switchLink: {
    fontSize: 15,
    color: AppColors.primary,
    fontWeight: '700',
  },
});
