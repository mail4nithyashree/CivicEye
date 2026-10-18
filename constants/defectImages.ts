/**
 * CivicEye Defect Image Helper
 * Ensures the authentic citizen uploaded complaint image is preserved across all screens.
 */

export const DEFECT_FALLBACK_IMAGES: Record<string, string> = {};

/**
 * Returns empty string or neutral placeholder - does not substitute unrelated stock photos.
 */
export function getDefectFallbackImage(_issueType?: string): string {
  return '';
}

/**
 * Resolves the primary image URI directly without stock photo replacement.
 */
export function resolveComplaintImage(imageUri?: string | null, _issueType?: string): string {
  if (imageUri && typeof imageUri === 'string' && imageUri.trim().length > 0) {
    return imageUri.trim();
  }
  return '';
}

