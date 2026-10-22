/**
 * Image Analysis Service — public API used by the report screen.
 *
 * Coordinates the full AI inference lifecycle:
 * 1. Road Presence Validation
 * 2. YOLOv8 Damage Detection with NMS
 * 3. Consistent Typed Prediction Contract Transformation
 */

import { ISSUE_DEPARTMENT, calculatePriorityWithExplanation, type DetectedIssueType, type Priority } from './detectionConfig';
import { runYoloInference, type Detection } from './yoloInference';
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
  priorityReason?: string;
  analysisStatus: 'not_road' | 'unclear_image' | 'dissimilar_image' | 'damage_detected' | 'no_major_issue';
  issueType: DetectedIssueType | string;
  confidence: number;    // 0–100 (percentage, rounded)
  confidenceRaw: number; // 0–1 (raw model output)
  priority: Priority;
  department: string;
  departmentCode: string;
  invalidReason?: string;
  message?: string;
  allDetections: Detection[];
  predictionContract?: CivicPredictionContract;
}

export function toPredictionContract(result: AnalysisResult): CivicPredictionContract {
  let validationStatus: ValidationStatus = 'valid_defect';
  let predictionStatus: PredictionStatus = 'success';
  let predictedClass: string | null = null;
  let displayIssueName = result.displayIssueName || formatDisplayIssueName(result.issueType);
  const predictionState: PredictionState = result.predictionState;

  if (predictionState === 'INVALID_IMAGE' || !result.isRoad) {
    if (result.isClear === false || result.analysisStatus === 'unclear_image' || result.invalidReason === 'inference_error') {
      validationStatus = result.invalidReason === 'inference_error' ? 'inference_error' : 'unclear_image';
      predictionStatus = 'unclear';
      displayIssueName = 'Unclear Image (Manual Review Required)';
    } else {
      validationStatus = 'unrelated_image';
      predictionStatus = 'rejected';
      displayIssueName = 'Invalid Issue Image';
    }
  } else if (!result.hasDamage || result.analysisStatus === 'no_major_issue') {
    validationStatus = 'valid_clean_road';
    predictionStatus = 'success';
    displayIssueName = 'Normal Road Surface (No Major Defect)';
  } else {
    validationStatus = 'valid_defect';
    predictionStatus = 'success';
    predictedClass = typeof result.issueType === 'string' ? result.issueType : null;
    displayIssueName = formatDisplayIssueName(result.issueType);
  }

  const boundingBoxes = (result.allDetections || []).map(d => ({
    x: d.boundingBox.x,
    y: d.boundingBox.y,
    width: d.boundingBox.width,
    height: d.boundingBox.height,
    classId: d.classId,
    className: d.issueType,
    confidence: d.confidence,
  }));

  return {
    predictionState,
    predictedClass,
    displayIssueName,
    confidence: result.confidence,
    confidenceRaw: result.confidenceRaw,
    validationStatus,
    predictionStatus,
    predictionError: result.invalidReason === 'inference_error' ? result.message : null,
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
  };
}

/**
 * Analyze a civic road image using the YOLOv8 ONNX inference pipeline.
 *
 * Evaluates road presence and damage detections, returning structured status.
 */
export async function analyzeCivicImage(imageUri: string, description: string = ''): Promise<AnalysisResult> {
  const result = await runYoloInference(imageUri, description);

  if (!result.isRoad) {
    const isUnclear = result.isClear === false || result.predictionState === 'UNCLEAR_IMAGE' || result.analysisStatus === 'unclear_image' || result.invalidReason === 'inference_error';
    const predictionState: PredictionState = isUnclear ? 'UNCLEAR_IMAGE' : 'INVALID_IMAGE';
    const displayIssueName = isUnclear ? 'Unclear Image (Manual Review Required)' : 'Invalid Issue Image';
    const defaultMsg = isUnclear
      ? 'The uploaded image is unclear, blurry, or poorly lit. Please upload a clear photo or submit for manual review.'
      : 'Invalid issue image. Please upload a clear image of the reported civic infrastructure issue.';

    const analysis: AnalysisResult = {
      isRoad: false,
      isDissimilar: result.isDissimilar ?? !isUnclear,
      isClear: result.isClear,
      roadConfidence: result.roadConfidence ?? 0,
      hasDamage: false,
      predictionState,
      displayIssueName,
      priorityReason: result.priorityReason || (isUnclear ? 'Image quality insufficient for automated assessment.' : 'Image does not contain valid civic road infrastructure.'),
      analysisStatus: result.analysisStatus || (isUnclear ? 'unclear_image' : 'dissimilar_image'),
      issueType: isUnclear ? 'unclear_image' : 'Invalid Image, give valid Issue Image!',
      confidence: 0,
      confidenceRaw: 0,
      priority: 'NONE',
      department: 'Road Maintenance',
      departmentCode: 'ROAD',
      invalidReason: result.invalidReason || (isUnclear ? 'unclear_image' : 'unrelated_image'),
      message: result.message || defaultMsg,
      allDetections: [],
    };
    analysis.predictionContract = toPredictionContract(analysis);
    return analysis;
  }

  if (!result.primaryDetection) {
    const analysis: AnalysisResult = {
      isRoad: true,
      roadConfidence: result.roadConfidence ?? 0.95,
      hasDamage: false,
      predictionState: 'NO_MAJOR_ISSUE',
      displayIssueName: 'No Major Issue',
      priorityReason: result.priorityReason || 'Normal road surface verified. No major road defects detected.',
      analysisStatus: 'no_major_issue',
      issueType: 'no_major_issue',
      confidence: 0,
      confidenceRaw: 0,
      priority: 'NONE',
      department: 'Road Maintenance',
      departmentCode: 'ROAD',
      message: 'Verified normal road surface. No major road defects detected.',
      allDetections: [],
    };
    analysis.predictionContract = toPredictionContract(analysis);
    return analysis;
  }

  const primary = result.primaryDetection;
  const dept = ISSUE_DEPARTMENT[primary.issueType] ?? { name: 'Road Maintenance', code: 'ROAD' };
  const canonicalName = primary.displayIssueName || formatDisplayIssueName(primary.issueType);

  const analysis: AnalysisResult = {
    isRoad: true,
    roadConfidence: result.roadConfidence ?? 0.95,
    hasDamage: true,
    predictionState: 'VALID_ISSUE',
    displayIssueName: canonicalName,
    priorityReason: primary.priorityReason || result.priorityReason,
    analysisStatus: 'damage_detected',
    issueType: primary.issueType,
    confidence: Math.round(primary.confidence * 100),
    confidenceRaw: primary.confidence,
    priority: primary.priority,
    department: dept.name,
    departmentCode: dept.code,
    allDetections: result.detections,
  };
  analysis.predictionContract = toPredictionContract(analysis);
  return analysis;
}
