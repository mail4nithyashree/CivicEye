import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { manipulateAsync, SaveFormat, FlipType, type Action } from 'expo-image-manipulator';
import { AppColors } from '@/constants/colors';

interface ImageEditorModalProps {
  visible: boolean;
  imageUri: string | null;
  onDone: (editedUri: string) => void;
  onCancel: () => void;
}

type AspectPreset = 'original' | '1:1' | '4:3' | '16:9';

export default function ImageEditorModal({
  visible,
  imageUri,
  onDone,
  onCancel,
}: ImageEditorModalProps) {
  const [currentUri, setCurrentUri] = useState<string | null>(imageUri);
  const [originalUri, setOriginalUri] = useState<string | null>(imageUri);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState<AspectPreset>('original');
  const [processing, setProcessing] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  const [prevUri, setPrevUri] = useState<string | null>(imageUri);
  if (imageUri !== prevUri) {
    setPrevUri(imageUri);
    setCurrentUri(imageUri);
    setOriginalUri(imageUri);
    setRotation(0);
    setAspect('original');
  }

  useEffect(() => {
    if (imageUri) {
      Image.getSize(
        imageUri,
        (w, h) => setImageDimensions({ width: w, height: h }),
        () => setImageDimensions({ width: 800, height: 600 })
      );
    }
  }, [imageUri]);

  if (!visible || !currentUri) return null;

  const handleRotate = async () => {
    if (!currentUri) return;
    setProcessing(true);
    try {
      const nextRotation = (rotation + 90) % 360;
      setRotation(nextRotation);

      const manipResult = await manipulateAsync(
        currentUri,
        [{ rotate: 90 }],
        { compress: 0.9, format: SaveFormat.JPEG }
      );
      setCurrentUri(manipResult.uri);

      if (imageDimensions) {
        setImageDimensions({
          width: imageDimensions.height,
          height: imageDimensions.width,
        });
      }
    } catch (err) {
      console.warn('[ImageEditor] Rotate error:', err);
    } finally {
      setProcessing(false);
    }
  };

  const handleFlip = async () => {
    if (!currentUri) return;
    setProcessing(true);
    try {
      const manipResult = await manipulateAsync(
        currentUri,
        [{ flip: FlipType.Horizontal }],
        { compress: 0.9, format: SaveFormat.JPEG }
      );
      setCurrentUri(manipResult.uri);
    } catch (err) {
      console.warn('[ImageEditor] Flip error:', err);
    } finally {
      setProcessing(false);
    }
  };

  const applyCropRatio = async (preset: AspectPreset) => {
    if (!originalUri || !imageDimensions) return;
    setAspect(preset);
    if (preset === 'original') {
      setCurrentUri(originalUri);
      return;
    }

    setProcessing(true);
    try {
      const { width, height } = imageDimensions;
      let targetRatio = 1; // width / height
      if (preset === '1:1') targetRatio = 1;
      if (preset === '4:3') targetRatio = 4 / 3;
      if (preset === '16:9') targetRatio = 16 / 9;

      let cropW = width;
      let cropH = height;

      if (width / height > targetRatio) {
        // Image is wider than target ratio
        cropW = Math.round(height * targetRatio);
      } else {
        // Image is taller than target ratio
        cropH = Math.round(width / targetRatio);
      }

      const originX = Math.max(0, Math.floor((width - cropW) / 2));
      const originY = Math.max(0, Math.floor((height - cropH) / 2));

      const actions: Action[] = [
        { crop: { originX, originY, width: cropW, height: cropH } },
      ];

      const manipResult = await manipulateAsync(
        originalUri,
        actions,
        { compress: 0.9, format: SaveFormat.JPEG }
      );
      setCurrentUri(manipResult.uri);
    } catch (err) {
      console.warn('[ImageEditor] Crop ratio error:', err);
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    if (originalUri) {
      setCurrentUri(originalUri);
      setRotation(0);
      setAspect('original');
    }
  };

  const handleDone = () => {
    if (currentUri) {
      onDone(currentUri);
    } else {
      onCancel();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onCancel}>
      <SafeAreaView style={styles.container}>
        {/* Top Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onCancel}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Ionicons name="close" size={24} color={AppColors.textPrimary} />
            <Text style={styles.headerBtnText}>Cancel</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Edit Defect Photo</Text>

          {/* Balanced header spacer (single DONE button at bottom) */}
          <View style={{ width: 64 }} />
        </View>

        {/* Image Preview Canvas */}
        <View style={styles.previewContainer}>
          {processing ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={AppColors.primary} />
              <Text style={styles.loadingText}>Applying edits…</Text>
            </View>
          ) : (
            <Image
              source={{ uri: currentUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}

          {/* Aspect overlay indicator */}
          {aspect !== 'original' && (
            <View style={styles.aspectBadge}>
              <Text style={styles.aspectBadgeText}>Crop Ratio: {aspect}</Text>
            </View>
          )}
        </View>

        {/* Editing Tool Controls */}
        <View style={styles.controlsPanel}>
          {/* Preset Aspect Ratios */}
          <Text style={styles.panelSectionTitle}>CROP RATIO</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.ratioRow}
          >
            <TouchableOpacity
              style={[styles.ratioChip, aspect === 'original' && styles.ratioChipActive]}
              onPress={() => applyCropRatio('original')}
            >
              <Ionicons
                name="image-outline"
                size={14}
                color={aspect === 'original' ? AppColors.white : AppColors.textPrimary}
              />
              <Text style={[styles.ratioText, aspect === 'original' && styles.ratioTextActive]}>
                Original
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ratioChip, aspect === '1:1' && styles.ratioChipActive]}
              onPress={() => applyCropRatio('1:1')}
            >
              <Ionicons
                name="square-outline"
                size={14}
                color={aspect === '1:1' ? AppColors.white : AppColors.textPrimary}
              />
              <Text style={[styles.ratioText, aspect === '1:1' && styles.ratioTextActive]}>
                1:1 (Square)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ratioChip, aspect === '4:3' && styles.ratioChipActive]}
              onPress={() => applyCropRatio('4:3')}
            >
              <Ionicons
                name="tablet-landscape-outline"
                size={14}
                color={aspect === '4:3' ? AppColors.white : AppColors.textPrimary}
              />
              <Text style={[styles.ratioText, aspect === '4:3' && styles.ratioTextActive]}>
                4:3 (Standard)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ratioChip, aspect === '16:9' && styles.ratioChipActive]}
              onPress={() => applyCropRatio('16:9')}
            >
              <Ionicons
                name="tv-outline"
                size={14}
                color={aspect === '16:9' ? AppColors.white : AppColors.textPrimary}
              />
              <Text style={[styles.ratioText, aspect === '16:9' && styles.ratioTextActive]}>
                16:9 (Road View)
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Quick Transformation Actions */}
          <View style={styles.toolsRow}>
            <TouchableOpacity
              style={styles.toolBtn}
              onPress={handleRotate}
              disabled={processing}
            >
              <Ionicons name="reload-outline" size={20} color={AppColors.primary} />
              <Text style={styles.toolBtnText}>Rotate 90°</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolBtn}
              onPress={handleFlip}
              disabled={processing}
            >
              <Ionicons name="swap-horizontal-outline" size={20} color={AppColors.primary} />
              <Text style={styles.toolBtnText}>Flip</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.toolBtn}
              onPress={handleReset}
              disabled={processing}
            >
              <Ionicons name="refresh-outline" size={20} color={AppColors.textSecondary} />
              <Text style={[styles.toolBtnText, { color: AppColors.textSecondary }]}>Reset</Text>
            </TouchableOpacity>
          </View>

          {/* Primary Bottom DONE Button */}
          <TouchableOpacity
            style={[styles.bottomDoneBtn, processing && styles.bottomDoneBtnDisabled]}
            onPress={handleDone}
            disabled={processing}
            accessible
            accessibilityRole="button"
            accessibilityLabel="DONE"
          >
            <Ionicons name="checkmark-circle-outline" size={22} color={AppColors.white} />
            <Text style={styles.bottomDoneText}>DONE</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A', // Sleek dark canvas for photo editing
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 6,
  },
  headerBtnText: {
    color: '#94A3B8',
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerDoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: AppColors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  headerDoneText: {
    color: AppColors.white,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  previewContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    position: 'relative',
    backgroundColor: '#020617',
  },
  previewImage: {
    width: SCREEN_WIDTH - 24,
    height: SCREEN_HEIGHT * 0.48,
    borderRadius: 12,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  aspectBadge: {
    position: 'absolute',
    top: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  aspectBadgeText: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },
  controlsPanel: {
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 24,
  },
  panelSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  ratioRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
  },
  ratioChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  ratioChipActive: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  ratioText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  ratioTextActive: {
    color: AppColors.white,
  },
  toolsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginVertical: 12,
  },
  toolBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  toolBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.primary,
  },
  bottomDoneBtn: {
    backgroundColor: AppColors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    marginTop: 6,
    ...Platform.select({
      web: {
        boxShadow: '0px 4px 6px rgba(15, 118, 110, 0.3)',
      },
      default: {
        shadowColor: AppColors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 4,
      },
    }),
  },
  bottomDoneBtnDisabled: {
    opacity: 0.6,
  },
  bottomDoneText: {
    color: AppColors.white,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});
