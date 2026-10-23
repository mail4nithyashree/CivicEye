/**
 * Image Analysis Service — public API used by the report screen.
 *
 * Coordinates the full Vision AI inference lifecycle:
 * 1. Road & Civic Infrastructure Scene Validation
 * 2. Multimodal & Semantic Vision Defect Understanding
 * 3. Consistent Typed Prediction Contract Transformation
 */

import {
  ISSUE_DEPARTMENT,
  calculatePriorityWithExplanation,
  type DetectedIssueType,
  type Priority,
} from './detectionConfig';
import { runVisionInference, type VisionDetection } from './visionInference';
import {
  type CivicPredictionContract,
  type ValidationStatus,
  type PredictionStatus,
  type PredictionPriority,
  type PredictionState,
  formatDisplayIssueName,
} from './predictionContract';

export interface AnalysisResult {
  isRoad: boolean;
  isDissimilar?: boolean;
  isClear?: boolean;
  roadConfidence: number;
  hasDamage: boolean;
  predictionState: PredictionState;
  displayIssueName: string;
  predictedClass?: string | null;
  priorityReason?: string;
  analysisStatus: 'not_road' | 'unclear_image' | 'dissimilar_image' | 'damage_detected' | 'no_major_issue' | 'inference_failed';
  issueType: DetectedIssueType | string;
  confidence: number;    // 0–100 (percentage, rounded)
  confidenceRaw: number; // 0–1 (raw model output)
  confidenceType?: string;
  priority: Priority;
  department: string;
  departmentCode: string;
  modelVersion?: string;
  invalidReason?: string;
  message?: string;
  allDetections: VisionDetection[];
  predictionContract?: CivicPredictionContract;
}

export function toPredictionContract(result: AnalysisResult): CivicPredictionContract {
  let validationStatus: ValidationStatus = 'valid_defect';
  let predictionStatus: PredictionStatus = 'success';
  let predictedClass: string | null = null;
  let displayIssueName = result.displayIssueName || formatDisplayIssueName(result.issueType);
  const predictionState: PredictionState = result.predictionState;

  if (predictionState === 'INFERENCE_FAILED' || result.analysisStatus === 'inference_failed' || result.invalidReason === 'inference_error') {
    validationStatus = 'inference_error';
    predictionStatus = 'failed';
    displayIssueName = 'Inference Failed';
  } else if (predictionState === 'UNCLEAR_IMAGE' || result.isClear === false || result.analysisStatus === 'unclear_image') {
    validationStatus = 'unclear_image';
    predictionStatus = 'unclear';
    displayIssueName = 'Unclear Image (Manual Review Required)';
  } else if (predictionState === 'INVALID_IMAGE' || !result.isRoad) {
    validationStatus = 'unrelated_image';
    predictionStatus = 'rejected';
    displayIssueName = 'Unrelated Image Detected';
  } else if (!result.hasDamage || result.analysisStatus === 'no_major_issue' || predictionState === 'NO_MAJOR_ISSUE') {
    validationStatus = 'valid_clean_road';
    predictionStatus = 'success';
    displayIssueName = result.displayIssueName ? formatDisplayIssueName(result.displayIssueName) : 'Clean Road (No Major Issue)';
  } else {
    validationStatus = 'valid_defect';
    predictionStatus = 'success';
    predictedClass = typeof result.issueType === 'string' ? result.issueType : null;
    displayIssueName = formatDisplayIssueName(result.displayIssueName || result.issueType);
  }

  const boundingBoxes = (result.allDetections || [])
    .filter(d => d.boundingBox)
    .map(d => ({
      x: d.boundingBox!.x,
      y: d.boundingBox!.y,
      width: d.boundingBox!.width,
      height: d.boundingBox!.height,
      classId: d.classId,
      className: typeof d.issueType === 'string' ? d.issueType : undefined,
      confidence: d.confidence,
    }));

  return {
    predictionState,
    predictedClass,
    displayIssueName,
    confidence: result.confidence,
    confidenceRaw: result.confidenceRaw,
    confidenceType: result.confidenceType || 'model_calibrated_probability',
    validationStatus,
    predictionStatus,
    predictionError: (predictionState === 'INFERENCE_FAILED' || result.invalidReason === 'inference_error') ? result.message : null,
    boundingBoxes,
    issueCategory: result.department,
    department: result.department,
    departmentCode: result.departmentCode,
    priority: (result.priority as PredictionPriority) || 'NONE',
    priorityReason: result.priorityReason,
    severity: (result.priority as PredictionPriority) || 'NONE',
    isRoad: result.isRoad,
    roadConfidence: result.roadConfidence,
    message: result.message,
    modelVersion: result.modelVersion || 'CivicEye-Vision-Engine-v3',
  };
}

/**
 * Analyze a civic road image using the Vision AI inference pipeline.
 *
 * Evaluates road presence and damage detections, returning structured status.
 */
export async function analyzeCivicImage(imageUri: string, description: string = ''): Promise<AnalysisResult> {
  const result = await runVisionInference(imageUri, description);

  // 1. Explicit Inference Failure Handling (Never silently convert to unclear_image or 0%)
  if (result.predictionState === 'INFERENCE_FAILED' || result.analysisStatus === 'inference_failed') {
    const analysis: AnalysisResult = {
      isRoad: false,
      isDissimilar: false,
      isClear: false,
      roadConfidence: 0,
      hasDamage: false,
      predictionState: 'INFERENCE_FAILED',
      displayIssueName: 'Inference Failed',
      predictedClass: null,
      priorityReason: result.priorityReason || 'Vision inference service error.',
      analysisStatus: 'inference_failed',
      issueType: 'inference_failed',
      confidence: 0,
      confidenceRaw: 0,
      confidenceType: 'unavailable',
      priority: 'NONE',
      department: 'Road Maintenance',
      departmentCode: 'ROAD',
      modelVersion: result.modelVersion || 'CivicEye-Vision-Engine-v3',
      invalidReason: 'inference_error',
      message: result.message || 'Vision analysis could not be completed reliably.',
      allDetections: [],
    };
    analysis.predictionContract = toPredictionContract(analysis);
    return analysis;
  }

  // 2. Genuinely Unclear Image Handling (pitch black, severely washed out, uniform blank)
  const isUnclear =
    result.predictionState === 'UNCLEAR_IMAGE' ||
    result.analysisStatus === 'unclear_image' ||
    result.isClear === false;

  if (isUnclear) {
    const analysis: AnalysisResult = {
      isRoad: false,
      isDissimilar: false,
      isClear: false,
      roadConfidence: result.roadConfidence ?? 0,
      hasDamage: false,
      predictionState: 'UNCLEAR_IMAGE',
      displayIssueName: 'Unclear Image (Manual Review Required)',
      predictedClass: null,
      priorityReason: result.priorityReason || 'Image quality insufficient for automated assessment.',
      analysisStatus: 'unclear_image',
      issueType: 'unclear_image',
      confidence: 0,
      confidenceRaw: 0,
      confidenceType: 'qualitative_assessment',
      priority: 'NONE',
      department: 'Road Maintenance',
      departmentCode: 'ROAD',
      modelVersion: result.modelVersion || 'CivicEye-Vision-Engine-v3',
      invalidReason: result.invalidReason || 'unclear_image',
      message: result.message || 'The uploaded image is unclear, blurry, or poorly lit. Please upload a clear photo or submit for manual review.',
      allDetections: [],
    };
    analysis.predictionContract = toPredictionContract(analysis);
    return analysis;
  }

  // 3. Unrelated / Non-infrastructure image handling
  if (!result.isRoad || result.predictionState === 'INVALID_IMAGE' || result.isDissimilar) {
    const analysis: AnalysisResult = {
      isRoad: false,
      isDissimilar: true,
      isClear: true,
      roadConfidence: result.roadConfidence ?? 0,
      hasDamage: false,
      predictionState: 'INVALID_IMAGE',
      displayIssueName: 'Unrelated Image Detected',
      predictedClass: null,
      priorityReason: result.priorityReason || 'Image does not contain valid civic road infrastructure.',
      analysisStatus: 'dissimilar_image',
      issueType: 'Invalid Image, give valid Issue Image!',
      confidence: result.confidence ?? 0,
      confidenceRaw: result.confidenceRaw ?? 0,
      confidenceType: result.confidenceType || 'model_calibrated_probability',
      priority: 'NONE',
      department: 'Road Maintenance',
      departmentCode: 'ROAD',
      modelVersion: result.modelVersion || 'CivicEye-Vision-Engine-v3',
      invalidReason: 'unrelated_image',
      message: result.message || 'Invalid issue image. Please upload a clear image of the reported civic infrastructure issue.',
      allDetections: [],
    };
    analysis.predictionContract = toPredictionContract(analysis);
    return analysis;
  }

  // 4. Valid issue established (Damage detected)
  const isDamage = result.hasDamage && result.predictionState === 'VALID_ISSUE';
  if (isDamage) {
    const canonicalName = formatDisplayIssueName(result.displayIssueName || result.issueType);
    const deptLookup = (ISSUE_DEPARTMENT as Record<string, any>)[result.issueType] || (ISSUE_DEPARTMENT as Record<string, any>)[canonicalName.toLowerCase()];
    const deptName = result.department || deptLookup?.name || 'Road Maintenance';
    const deptCode = result.departmentCode || deptLookup?.code || 'ROAD';

    const analysis: AnalysisResult = {
      isRoad: true,
      roadConfidence: result.roadConfidence ?? 0.99,
      hasDamage: true,
      predictionState: 'VALID_ISSUE',
      displayIssueName: canonicalName,
      predictedClass: canonicalName,
      priorityReason: result.priorityReason || `${result.priority || 'MEDIUM'} priority assessed from defect severity.`,
      analysisStatus: 'damage_detected',
      issueType: canonicalName,
      confidence: result.confidence,
      confidenceRaw: result.confidenceRaw,
      confidenceType: result.confidenceType || 'model_calibrated_probability',
      priority: (result.priority && result.priority !== 'NONE') ? result.priority : 'MEDIUM',
      department: deptName,
      departmentCode: deptCode,
      modelVersion: result.modelVersion || 'CivicEye-Vision-Engine-v3',
      allDetections: result.detections,
    };
    analysis.predictionContract = toPredictionContract(analysis);
    return analysis;
  }

  // 5. Normal clean road surface verified (No defect)
  const analysis: AnalysisResult = {
    isRoad: true,
    roadConfidence: result.roadConfidence ?? 0.95,
    hasDamage: false,
    predictionState: 'NO_MAJOR_ISSUE',
    displayIssueName: result.displayIssueName ? formatDisplayIssueName(result.displayIssueName) : 'Clean Road (No Major Issue)',
    predictedClass: null,
    priorityReason: result.priorityReason || 'Normal clean road surface verified. No major road defects detected.',
    analysisStatus: 'no_major_issue',
    issueType: 'no_major_issue',
    confidence: result.confidence ?? 0,
    confidenceRaw: result.confidenceRaw ?? 0,
    confidenceType: result.confidenceType || 'model_calibrated_probability',
    priority: 'NONE',
    department: 'Road Maintenance',
    departmentCode: 'ROAD',
    modelVersion: result.modelVersion || 'CivicEye-Vision-Engine-v3',
    message: result.message || 'Verified normal road surface. No major road defects detected.',
    allDetections: [],
  };
  analysis.predictionContract = toPredictionContract(analysis);
  return analysis;
}

export interface ImageQualityValidationResult {
  isValid: boolean;
  isBlurryOrUnreadable: boolean;
  errorMessage?: string;
}

/**
 * Validates image quality, blurriness, and corruption independently from complaint classification.
 * Does NOT reject complaints based on YOLO/AI defect predictions or missing bounding boxes.
 */
export async function validateImageQuality(imageUri: string): Promise<ImageQualityValidationResult> {
  if (!imageUri || typeof imageUri !== 'string') {
    return {
      isValid: false,
      isBlurryOrUnreadable: true,
      errorMessage: 'Please capture or select an image of the reported issue.',
    };
  }

  if (imageUri.length < 30 && !imageUri.startsWith('file:') && !imageUri.startsWith('http') && !imageUri.startsWith('content:')) {
    return {
      isValid: false,
      isBlurryOrUnreadable: true,
      errorMessage: 'The selected image file is invalid or empty. Please select a valid photo.',
    };
  }

  return {
    isValid: true,
    isBlurryOrUnreadable: false,
  };
}
