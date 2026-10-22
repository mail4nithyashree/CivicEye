import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  TextInputProps,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '@/constants/colors';
import { useAppTheme } from '@/context/ThemeContext';

interface AuthInputProps extends TextInputProps {
  label: string;
  error?: string;
  isPassword?: boolean;
  labelStyle?: TextStyle;
  containerStyle?: ViewStyle;
}

export default function AuthInput({
  label,
  error,
  isPassword = false,
  labelStyle,
  containerStyle,
  ...props
}: AuthInputProps) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const { colors, isDark } = useAppTheme();

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <Text style={[styles.label, { color: isDark ? colors.textOnDark : AppColors.textPrimary }, labelStyle]}>
        {label}
      </Text>
      <View
        style={[
          styles.inputRow,
          isDark && {
            backgroundColor: colors.inputBg,
            borderColor: colors.inputBorder,
          },
          focused && (isDark ? { borderColor: colors.borderFocus, borderWidth: 2 } : styles.inputFocused),
          !!error && styles.inputError,
        ]}
      >
        <TextInput
          style={[styles.input, isDark && { color: colors.inputText }]}
          secureTextEntry={isPassword && !visible}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={isDark ? colors.inputPlaceholder : AppColors.placeholder}
          accessibilityLabel={label}
          accessibilityHint={props.accessibilityHint}
          {...props}
        />
        {isPassword && (
          <TouchableOpacity
            onPress={() => setVisible(v => !v)}
            style={styles.eyeBtn}
            accessible
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={visible ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={isDark ? colors.textSecondary : AppColors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
      {!!error && (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: AppColors.textPrimary,
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: AppColors.border,
    borderRadius: 10,
    backgroundColor: AppColors.surface,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  inputFocused: { borderColor: AppColors.borderFocus },
  inputError: { borderColor: AppColors.error, backgroundColor: AppColors.errorBg },
  input: {
    flex: 1,
    fontSize: 16,
    color: AppColors.textPrimary,
    paddingVertical: 12,
  },
  eyeBtn: { padding: 6 },
  errorText: {
    marginTop: 4,
    fontSize: 13,
    color: AppColors.error,
  },
});

