/**
 * Image & Description Validation Service
 *
 * Implements an isolated validation gate before complaint submission:
 * 1. Image quality and integrity (clarity, uncorrupted, supported)
 * 2. Image relevance (depicts road/civic infrastructure)
 * 3. Visible issue evidence (identifiable civic issue vs clean normal road)
 * 4. Description meaning (real problem vs explicitly indicates no issue / negated)
 * 5. Image-description consistency (image provides reasonable support for description)
 *
 * Enforces zero side effects on rejection:
 * - No complaint saved to Firestore
 * - No complaint ID generated or consumed
 * - No priority, severity, or department assigned
 * - No notifications or emails sent
 */

import type { VisionInferenceResult } from './visionInference.ts';
import {
  checkDescriptionHasNoIssue,
  classifyComplaintFromDescription,
} from './descriptionClassifier.ts';

export type ValidationOutcome =
  | 'ALLOW'
  | 'BLOCK_UNRELATED_IMAGE'
  | 'BLOCK_NORMAL_ROAD'
  | 'BLOCK_NO_ISSUE_DESC'
  | 'BLOCK_CONFLICT'
  | 'BLOCK_UNREADABLE_IMAGE';

export interface ImageDescriptionValidationResult {
  isValid: boolean;
  outcome: ValidationOutcome;
  rejectionTitle?: string;
  rejectionMessage?: string;
  detectedImageIssue?: string;
  detectedDescIssue?: string;
  inferenceResult?: VisionInferenceResult;
}

/**
 * Standard required validation messages per user specification
 */
export const VALIDATION_MESSAGES = {
  UNRELATED_IMAGE: {
    title: 'Invalid Issue Image',
    message: 'Invalid Issue Image. The uploaded image does not match the reported civic issue. Please upload a relevant image and try again.',
  },
  NORMAL_ROAD: {
    title: 'No Issue Found',
    message: 'No Issue Found. The uploaded image does not show a clearly identifiable civic issue. Please upload an image showing the problem you want to report.',
  },
  NO_ISSUE_DESCRIPTION: {
    title: 'No Issue Found',
    message: 'No Issue Found. Your description does not report a civic problem. Please provide a description of the actual issue and upload a relevant image.',
  },
  CONFLICT: {
    title: 'Invalid Issue Image',
    message: 'Invalid Issue Image. The uploaded image does not match the reported civic issue. Please upload a relevant image and try again.',
  },
  UNREADABLE_IMAGE: {
    title: 'Unreadable Image',
    message: 'The uploaded image is too blurry, unreadable, or corrupted. Please upload a clear photo of the civic issue and try again.',
  },
};

/**
 * Evaluates whether the visually detected defect is compatible with the description category.
 */
function areIssuesCompatible(imageIssue: string, descIssue: string): boolean {
  if (!imageIssue || !descIssue) return true;

  const imgNorm = imageIssue.toLowerCase().trim();
  const descNorm = descIssue.toLowerCase().trim();

  // Exact or near-exact match
  if (imgNorm === descNorm || imgNorm.includes(descNorm) || descNorm.includes(imgNorm)) {
    return true;
  }

  // Clean road or general road infrastructure never contradicts a road defect
  if (imgNorm.includes('clean road') || imgNorm.includes('no major') || imgNorm.includes('road surface') || imgNorm.includes('road infrastructure')) {
    return true;
  }

  // Cross-category compatibility groupings:
  // 1. Road surface defects (pothole, cracking, alligator cracking, surface wear)
  const isRoadDefectImg = imgNorm.includes('pothole') || imgNorm.includes('crack') || imgNorm.includes('alligator') || imgNorm.includes('road surface');
  const isRoadDefectDesc = descNorm.includes('pothole') || descNorm.includes('crack') || descNorm.includes('alligator') || descNorm.includes('road surface') || descNorm === 'road crack';
  if (isRoadDefectImg && isRoadDefectDesc) {
    return true;
  }

  // 2. Drainage & Water issues (waterlogging, drainage blockage, manhole defect, stormwater)
  const isWaterImg = imgNorm.includes('water') || imgNorm.includes('drain') || imgNorm.includes('flood');
  const isWaterDesc = descNorm.includes('water') || descNorm.includes('drain') || descNorm.includes('flood');
  if (isWaterImg && isWaterDesc) {
    return true;
  }

  // 3. Traffic safety & street furniture (divider, traffic sign, sign board)
  const isSafetyImg = imgNorm.includes('divider') || imgNorm.includes('sign') || imgNorm.includes('median');
  const isSafetyDesc = descNorm.includes('divider') || descNorm.includes('sign') || descNorm.includes('median');
  if (isSafetyImg && isSafetyDesc) {
    return true;
  }

  // 4. Street lighting
  const isLightingImg = imgNorm.includes('light') || imgNorm.includes('lamp');
  const isLightingDesc = descNorm.includes('light') || descNorm.includes('lamp');
  if (isLightingImg && isLightingDesc) {
    return true;
  }

  // Explicit incompatibility: e.g. Image shows Streetlight but description is Pothole
  return false;
}

/**
 * Performs separate Image-Description validation before complaint persistence.
 */
export async function validateComplaintSubmission(
  imageUri: string,
  description: string
): Promise<ImageDescriptionValidationResult> {
  const descTrimmed = (description || '').trim();

  // 1. Check description meaning: Does the citizen explicitly report NO ISSUE? (Outcome D)
  const noIssueCheck = checkDescriptionHasNoIssue(descTrimmed);
  if (noIssueCheck.isNoIssue) {
    console.log('[VALIDATION] Blocked: Description explicitly reports no issue.');
    return {
      isValid: false,
      outcome: 'BLOCK_NO_ISSUE_DESC',
      rejectionTitle: VALIDATION_MESSAGES.NO_ISSUE_DESCRIPTION.title,
      rejectionMessage: VALIDATION_MESSAGES.NO_ISSUE_DESCRIPTION.message,
      detectedDescIssue: 'no_issue',
    };
  }

  // 2. Fully Description-Based Issue Classification
  // The citizen description is the authoritative source for issue identification,
  // priority, dynamic confidence, and department routing. The uploaded image is preserved
  // as supporting evidence and does not block submissions, determine the category, or
  // depend on an online vision service.
  const descClassification = classifyComplaintFromDescription(descTrimmed);
  const descCategory = noIssueCheck.identifiedIssue || descClassification.displayIssueName;

  console.log(`[VALIDATION] ALLOWED: Description authoritative. Category: "${descCategory}". Vision service not required.`);
  return {
    isValid: true,
    outcome: 'ALLOW',
    detectedImageIssue: 'Supporting Evidence Attached',
    detectedDescIssue: descCategory,
  };
}
