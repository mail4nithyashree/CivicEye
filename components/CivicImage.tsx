import React, { useState } from 'react';
import {
  Image,
  View,
  StyleSheet,
  type ImageProps,
  type StyleProp,
  type ImageStyle,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppColors } from '@/constants/colors';

interface CivicImageProps extends Omit<ImageProps, 'source'> {
  uri?: string | null;
  issueType?: string;
  style?: StyleProp<ImageStyle>;
  showBadge?: boolean;
  badgeLabel?: string;
  isInvalid?: boolean;
  invalidMessage?: string;
}

export default function CivicImage({
  uri,
  issueType,
  style,
  showBadge = false,
  badgeLabel,
  isInvalid = false,
  invalidMessage = 'Invalid Image, give valid Issue Image!',
  resizeMode = 'cover',
  ...rest
}: CivicImageProps) {
  const cleanUri = typeof uri === 'string' && uri.trim().length > 0 ? uri.trim() : null;
  const [failedUri, setFailedUri] = useState<string | null>(null);

  const autoInvalid =
    isInvalid ||
    (typeof issueType === 'string' &&
      (issueType.toLowerCase().includes('invalid') ||
       issueType.toLowerCase().includes('dissimilar') ||
       issueType.toLowerCase().includes('non-road')));

  const hasError = !cleanUri || failedUri === cleanUri;

  const handleError = () => {
    if (cleanUri) setFailedUri(cleanUri);
  };

  if (hasError || !cleanUri) {
    return (
      <View style={[styles.placeholderContainer, style]}>
        <Ionicons name="construct-outline" size={32} color={AppColors.primary} />
        <Text style={styles.placeholderTitle}>{issueType || 'Civic Infrastructure'}</Text>
        <Text style={styles.placeholderSub}>CivicEye Coimbatore</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, autoInvalid && styles.invalidContainer, style]}>
      <Image
        source={{ uri: cleanUri }}
        style={[
          StyleSheet.absoluteFill,
          style,
          autoInvalid && styles.invalidImageGreyed,
        ]}
        resizeMode={resizeMode}
        onError={handleError}
        {...rest}
      />
      {autoInvalid && (
        <View style={styles.invalidOverlayContainer}>
          <View style={styles.invalidAlertBadge}>
            <Ionicons name="alert-circle" size={26} color="#EF4444" />
            <Text style={styles.invalidAlertTitle}>{invalidMessage}</Text>
            <Text style={styles.invalidAlertSubtitle}>Unrelated / Non-Issue Image</Text>
          </View>
        </View>
      )}
      {showBadge && !autoInvalid && (
        <View style={styles.badgeOverlay}>
          <Text style={styles.badgeText}>{badgeLabel || 'Defect Evidence'}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
    position: 'relative',
  },
  invalidContainer: {
    backgroundColor: '#0F172A',
  },
  invalidImageGreyed: {
    opacity: 0.30,
  },
  invalidOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    padding: 12,
  },
  invalidAlertBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: '#EF4444',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '92%',
  },
  invalidAlertTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 4,
    letterSpacing: 0.3,
  },
  invalidAlertSubtitle: {
    color: '#FECACA',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
  },
  placeholderContainer: {
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 12,
  },
  placeholderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: AppColors.textPrimary,
    marginTop: 6,
    textTransform: 'capitalize',
    textAlign: 'center',
  },
  placeholderSub: {
    fontSize: 11,
    color: AppColors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  badgeOverlay: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: AppColors.white,
    fontSize: 10,
    fontWeight: '700',
  },
});

