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

import { validateImageQuality } from './imageAnalysis';
import { runVisionInference, type VisionInferenceResult } from './visionInference';
import {
  checkDescriptionHasNoIssue,
  classifyComplaintFromDescription,
} from './descriptionClassifier';

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

  // 2. Check Image Quality and Integrity (Outcome F)
  const quality = await validateImageQuality(imageUri);
  if (!quality.isValid || quality.isBlurryOrUnreadable) {
    console.log('[VALIDATION] Blocked: Image unreadable or blurry.');
    return {
      isValid: false,
      outcome: 'BLOCK_UNREADABLE_IMAGE',
      rejectionTitle: VALIDATION_MESSAGES.UNREADABLE_IMAGE.title,
      rejectionMessage: quality.errorMessage || VALIDATION_MESSAGES.UNREADABLE_IMAGE.message,
    };
  }

  // 3. Run Visual Inference Model for Scene Relevance & Defect Evidence
  let visionResult: VisionInferenceResult;
  try {
    visionResult = await runVisionInference(imageUri, descTrimmed);
  } catch (err: any) {
    console.warn('[VALIDATION] Vision inference error, rejecting safely:', err?.message || err);
    return {
      isValid: false,
      outcome: 'BLOCK_UNREADABLE_IMAGE',
      rejectionTitle: VALIDATION_MESSAGES.UNREADABLE_IMAGE.title,
      rejectionMessage: 'Unable to evaluate the image. Please upload a clear photo of the civic issue and try again.',
    };
  }

  // 4. Evaluate Image Physical Clarity (Outcome F)
  if (visionResult.isClear === false || visionResult.predictionState === 'UNCLEAR_IMAGE') {
    console.log('[VALIDATION] Blocked: Image evaluated as physically unclear or corrupted.');
    return {
      isValid: false,
      outcome: 'BLOCK_UNREADABLE_IMAGE',
      rejectionTitle: VALIDATION_MESSAGES.UNREADABLE_IMAGE.title,
      rejectionMessage: visionResult.message || VALIDATION_MESSAGES.UNREADABLE_IMAGE.message,
      inferenceResult: visionResult,
    };
  }

  // 5. Evaluate Visual Relevance: Is it unrelated to road/civic infrastructure? (Outcome B)
  // e.g. Flower, pet, person, indoor object, peacock
  if (!visionResult.isRoad || visionResult.predictionState === 'INVALID_IMAGE' || visionResult.isDissimilar) {
    console.log('[VALIDATION] Blocked: Image is unrelated or not civic infrastructure.');
    return {
      isValid: false,
      outcome: 'BLOCK_UNRELATED_IMAGE',
      rejectionTitle: VALIDATION_MESSAGES.UNRELATED_IMAGE.title,
      rejectionMessage: VALIDATION_MESSAGES.UNRELATED_IMAGE.message,
      detectedImageIssue: 'unrelated_image',
      inferenceResult: visionResult,
    };
  }

  // 6. Evaluate Visible Issue Evidence: Does it show a normal intact road with no defect? (Outcome C)
  // e.g. Clean road without any visible defect
  if (visionResult.predictionState === 'NO_MAJOR_ISSUE' || !visionResult.hasDamage || visionResult.issueType === 'no_major_issue') {
    console.log('[VALIDATION] Blocked: Image shows normal road with no identifiable issue.');
    return {
      isValid: false,
      outcome: 'BLOCK_NORMAL_ROAD',
      rejectionTitle: VALIDATION_MESSAGES.NORMAL_ROAD.title,
      rejectionMessage: VALIDATION_MESSAGES.NORMAL_ROAD.message,
      detectedImageIssue: 'Clean Road (No Major Issue)',
      inferenceResult: visionResult,
    };
  }

  // 7. Evaluate Image-Description Consistency (Outcome E)
  // Extract canonical category from description
  const descClassification = classifyComplaintFromDescription(descTrimmed);
  const descCategory = noIssueCheck.identifiedIssue || descClassification.displayIssueName;
  const imageCategory = visionResult.displayIssueName || visionResult.issueType;

  if (!areIssuesCompatible(imageCategory, descCategory)) {
    console.log(`[VALIDATION] Blocked: Image (${imageCategory}) and description (${descCategory}) conflict.`);
    return {
      isValid: false,
      outcome: 'BLOCK_CONFLICT',
      rejectionTitle: VALIDATION_MESSAGES.CONFLICT.title,
      rejectionMessage: VALIDATION_MESSAGES.CONFLICT.message,
      detectedImageIssue: imageCategory,
      detectedDescIssue: descCategory,
      inferenceResult: visionResult,
    };
  }

  // 8. Passed all gates: ALLOW (Outcome A)
  console.log(`[VALIDATION] ALLOWED: Relevant image (${imageCategory}) matches description (${descCategory}).`);
  return {
    isValid: true,
    outcome: 'ALLOW',
    detectedImageIssue: imageCategory,
    detectedDescIssue: descCategory,
    inferenceResult: visionResult,
  };
}
