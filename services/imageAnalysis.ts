/**
 * Image Analysis Service — public API used by the report screen.
 *
 * Coordinates the full AI inference lifecycle:
 * 1. Road Presence Validation
 * 2. YOLOv8 Damage Detection with NMS
 * 3. No Major Issue Resolution
 */

import { ISSUE_DEPARTMENT, type DetectedIssueType, type Priority } from './detectionConfig';
import { runYoloInference, type Detection } from './yoloInference';

export interface AnalysisResult {
  isRoad: boolean;
  isDissimilar?: boolean;
  isClear?: boolean;
  roadConfidence: number;
  hasDamage: boolean;
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
}

/**
 * Analyze a civic road image using the YOLOv8 ONNX inference pipeline.
 *
 * Evaluates road presence and damage detections, returning structured status.
 */
export async function analyzeCivicImage(imageUri: string): Promise<AnalysisResult> {
  const result = await runYoloInference(imageUri);

  if (!result.isRoad) {
    const isUnclear = result.isClear === false || result.analysisStatus === 'unclear_image';
    return {
      isRoad: false,
      isDissimilar: result.isDissimilar ?? !isUnclear,
      isClear: result.isClear,
      roadConfidence: result.roadConfidence ?? 0,
      hasDamage: false,
      analysisStatus: result.analysisStatus || (isUnclear ? 'unclear_image' : 'dissimilar_image'),
      issueType: isUnclear ? 'unclear_image' : 'Invalid Image, give valid Issue Image!',
      confidence: 0,
      confidenceRaw: 0,
      priority: 'NONE',
      department: 'Road Maintenance',
      departmentCode: 'ROAD',
      invalidReason: result.invalidReason || (isUnclear ? 'unclear_image' : 'Invalid Image, give valid Issue Image!'),
      message: result.message || (isUnclear
        ? 'The uploaded image is unclear, blurry, or poorly lit. Please upload a clear photo or submit for manual review.'
        : 'Invalid Image, give valid Issue Image!'),
      allDetections: [],
    };
  }

  if (!result.primaryDetection) {
    return {
      isRoad: true,
      roadConfidence: result.roadConfidence ?? 0.9,
      hasDamage: false,
      analysisStatus: 'no_major_issue',
      issueType: 'no_major_issue',
      confidence: 0,
      confidenceRaw: 0,
      priority: 'NONE',
      department: 'Road Maintenance',
      departmentCode: 'ROAD',
      message: 'No major road issues detected.',
      allDetections: [],
    };
  }

  const primary = result.primaryDetection;
  const dept = ISSUE_DEPARTMENT[primary.issueType] ?? { name: 'Road Maintenance', code: 'ROAD' };

  return {
    isRoad: true,
    roadConfidence: result.roadConfidence ?? 0.9,
    hasDamage: true,
    analysisStatus: 'damage_detected',
    issueType: primary.issueType,
    confidence: Math.round(primary.confidence * 100),
    confidenceRaw: primary.confidence,
    priority: primary.priority,
    department: dept.name,
    departmentCode: dept.code,
    allDetections: result.detections,
  };
}

