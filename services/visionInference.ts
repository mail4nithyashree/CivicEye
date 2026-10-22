/**
 * Vision AI Inference Service
 *
 * Integrates with the backend multimodal Vision AI inference pipeline (/api/analyze-road).
 * Completely replaces legacy YOLO object detection with deep vision understanding.
 */

import {
  CLASS_ID_MAP,
  calculatePriority,
  type DetectedIssueType,
  type Priority,
} from './detectionConfig';
import { uploadImageMultipart } from './multipartUpload';
import type { PredictionState } from './predictionContract';
import { formatDisplayIssueName } from './predictionContract';
import { getApiBaseUrl } from './apiConfig';

export interface BoundingBox {
  x: number; // center x (normalised 0-1)
  y: number; // center y (normalised 0-1)
  width: number;
  height: number;
}

export interface VisionDetection {
  classId: number;
  issueType: DetectedIssueType | string;
  displayIssueName?: string;
  confidence: number; // 0-1
  priority: Priority;
  priorityReason?: string;
  boundingBox?: BoundingBox;
}

export interface VisionInferenceResult {
  isRoad: boolean;
  hasDamage: boolean;
  isDissimilar?: boolean;
  isClear?: boolean;
  roadConfidence?: number;
  predictionState: PredictionState;
  displayIssueName: string;
  issueType: string;
  confidence: number;    // 0-100 percentage
  confidenceRaw: number; // 0-1 raw score
  confidenceType?: string;
  priority: Priority;
  priorityReason?: string;
  analysisStatus: 'not_road' | 'unclear_image' | 'dissimilar_image' | 'damage_detected' | 'no_major_issue' | 'inference_failed';
  department?: string;
  departmentCode?: string;
  invalidReason?: string;
  message?: string;
  detections: VisionDetection[];
  primaryDetection: VisionDetection | null;
  modelVersion?: string;
  agreementStatus?: 'AGREED' | 'DISAGREED' | 'NOT_APPLICABLE';
  validationStatus?: string;
}

/**
 * Main Vision AI inference entry point.
 * Sends image to backend Vision AI endpoint for multimodal and deep surface analysis.
 */
export async function runVisionInference(
  imageUri: string,
  description: string = ''
): Promise<VisionInferenceResult> {
  const apiUrl = `${getApiBaseUrl()}/api/analyze-road`;

  try {
    const uploadRes = await uploadImageMultipart(apiUrl, imageUri, {
      fieldName: 'image',
      fileName: 'vision-analysis.jpg',
      mimeType: 'image/jpeg',
      parameters: description ? { description } : undefined,
      timeoutMs: 15000,
    });

    if (uploadRes.ok && uploadRes.data) {
      const data = uploadRes.data;
      if (data.ok) {
        // 1. Non-road or invalid image handling
        if (!data.isRoad) {
          const isUnclear =
            data.isClear === false ||
            data.predictionState === 'UNCLEAR_IMAGE' ||
            data.analysisStatus === 'unclear_image' ||
            data.invalidReason === 'blurry_image' ||
            data.invalidReason === 'dark_image' ||
            data.invalidReason === 'overexposed_image';

          const predictionState: PredictionState = isUnclear ? 'UNCLEAR_IMAGE' : 'INVALID_IMAGE';
          const defaultMsg = isUnclear
            ? 'The uploaded image is unclear, blurry, or poorly lit. Please upload a clear photo or submit for manual review.'
            : 'Invalid issue image. Please upload a clear image of the reported civic infrastructure issue.';

          return {
            isRoad: false,
            hasDamage: false,
            isDissimilar: data.isDissimilar ?? !isUnclear,
            isClear: data.isClear ?? !isUnclear,
            roadConfidence: data.roadConfidence ?? 0,
            predictionState,
            displayIssueName: data.displayIssueName || (isUnclear ? 'Unclear Image (Manual Review Required)' : 'Invalid Issue Image'),
            issueType: data.issueType || (isUnclear ? 'unclear_image' : 'invalid_image'),
            confidence: isUnclear ? 0 : (data.confidence ?? 0),
            confidenceRaw: isUnclear ? 0 : (data.confidenceRaw ?? 0),
            confidenceType: data.confidenceType || (isUnclear ? 'qualitative_assessment' : 'model_calibrated_probability'),
            priority: 'NONE',
            priorityReason: data.priorityReason || (isUnclear ? 'Image quality insufficient for automated assessment.' : 'Image does not contain valid civic road infrastructure.'),
            analysisStatus: (data.analysisStatus as any) || (isUnclear ? 'unclear_image' : 'dissimilar_image'),
            invalidReason: data.invalidReason || (isUnclear ? 'unclear_image' : 'unrelated_image'),
            message: data.message || defaultMsg,
            department: data.department,
            departmentCode: data.departmentCode,
            detections: [],
            primaryDetection: null,
            modelVersion: data.modelVersion,
            agreementStatus: data.agreementStatus || 'NOT_APPLICABLE',
            validationStatus: data.validationStatus || (isUnclear ? 'unclear_image' : 'unrelated_image'),
          };
        }

        // 2. Road surface analysis
        const rawIssueType = data.issueType || data.detectedIssue || 'no_major_issue';
        const canonicalIssue = formatDisplayIssueName(data.displayIssueName || rawIssueType);
        const hasDamage = !!data.hasDamage && canonicalIssue !== 'No Major Issue' && canonicalIssue !== 'Clean Road (No Major Issue)';
        const predictionState: PredictionState = data.predictionState || (hasDamage ? 'VALID_ISSUE' : 'NO_MAJOR_ISSUE');

        const rawConf = typeof data.confidenceRaw === 'number'
          ? data.confidenceRaw
          : (typeof data.confidence === 'number' && data.confidence > 1 ? data.confidence / 100 : (data.confidence ?? 0));
        const confPercent = typeof data.confidence === 'number'
          ? data.confidence
          : Math.round(rawConf * 100);

        const detections: VisionDetection[] = (data.allDetections || []).map((d: any) => ({
          classId: d.classId ?? 0,
          issueType: d.issueType || canonicalIssue,
          displayIssueName: d.displayIssueName || formatDisplayIssueName(d.issueType),
          confidence: typeof d.confidenceRaw === 'number' ? d.confidenceRaw : (typeof d.confidence === 'number' && data.confidence > 1 ? d.confidence / 100 : (d.confidence ?? 0)),
          priority: d.priority || calculatePriority(d.issueType || canonicalIssue, d.confidence),
          priorityReason: d.priorityReason,
          boundingBox: d.boundingBox,
        }));

        const primaryDetection: VisionDetection | null = hasDamage
          ? (data.primaryDetection || {
              classId: 0,
              issueType: canonicalIssue,
              displayIssueName: canonicalIssue,
              confidence: rawConf,
              priority: data.priority || 'MEDIUM',
              priorityReason: data.priorityReason,
              boundingBox: data.boundingBox,
            })
          : null;

        return {
          isRoad: true,
          hasDamage,
          roadConfidence: data.roadConfidence ?? 0.95,
          predictionState,
          displayIssueName: data.displayIssueName ? formatDisplayIssueName(data.displayIssueName) : (hasDamage ? canonicalIssue : 'Clean Road (No Major Issue)'),
          issueType: hasDamage ? canonicalIssue : 'no_major_issue',
          confidence: confPercent,
          confidenceRaw: rawConf,
          confidenceType: data.confidenceType || 'model_calibrated_probability',
          priority: hasDamage ? (data.priority || 'MEDIUM') : 'NONE',
          priorityReason: data.priorityReason || (hasDamage ? `${data.priority || 'MEDIUM'} priority assessed from defect severity.` : 'Normal road surface verified. No major road defects detected.'),
          analysisStatus: hasDamage ? 'damage_detected' : 'no_major_issue',
          department: data.department || 'Road Maintenance',
          departmentCode: data.departmentCode || 'ROAD',
          message: data.message,
          detections,
          primaryDetection,
          modelVersion: data.modelVersion || 'CivicEye-Vision-Engine-v3',
          agreementStatus: data.agreementStatus || 'AGREED',
          validationStatus: data.validationStatus || (hasDamage ? 'valid_defect' : 'valid_clean_road'),
        };
      } else {
        console.warn('[Vision AI] Backend returned non-ok payload:', data);
        return {
          isRoad: false,
          hasDamage: false,
          isClear: false,
          roadConfidence: 0,
          predictionState: 'INFERENCE_FAILED',
          displayIssueName: 'Inference Failed',
          issueType: 'inference_failed',
          confidence: 0,
          confidenceRaw: 0,
          confidenceType: 'unavailable',
          priority: 'NONE',
          priorityReason: 'Vision inference service returned error state.',
          analysisStatus: 'inference_failed',
          invalidReason: data.invalidReason || 'inference_error',
          message: data.message || 'Defect analysis could not be completed reliably.',
          detections: [],
          primaryDetection: null,
          validationStatus: 'inference_error',
        };
      }
    } else {
      console.warn('[Vision AI] Backend inference request note:', uploadRes.error || uploadRes.status);
    }
  } catch (err: any) {
    console.warn('[Vision AI] Backend inference request exception:', err?.message || err);
  }

  // Explicit failure outcome: NEVER fabricate "no_major_issue" when inference failed or timed out
  return {
    isRoad: false,
    hasDamage: false,
    isClear: false,
    roadConfidence: 0,
    predictionState: 'INFERENCE_FAILED',
    displayIssueName: 'Inference Failed',
    issueType: 'inference_failed',
    confidence: 0,
    confidenceRaw: 0,
    confidenceType: 'unavailable',
    priority: 'NONE',
    priorityReason: 'Unable to connect to vision detection service.',
    analysisStatus: 'inference_failed',
    invalidReason: 'inference_error',
    message: 'Unable to connect to the vision detection service. Please try again or submit for manual review.',
    detections: [],
    primaryDetection: null,
    validationStatus: 'inference_error',
  };
}

export async function releaseVisionSession(): Promise<void> {
  // Session lifecycle managed on backend
}
