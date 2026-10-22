/**
 * YOLO ONNX Inference Service
 *
 * Integrates with the backend ONNX inference pipeline (/api/analyze-road)
 * running YOLOv8 on 640×640 RGB float32 tensors with IoU Non-Maximum Suppression.
 *
 * Provides a resilient client fallback with true NMS postprocessing.
 */

import {
  CLASS_ID_MAP,
  IOU_THRESHOLD,
  calculatePriority,
  type DetectedIssueType,
  type Priority
} from './detectionConfig';
import { uploadImageMultipart } from './multipartUpload';
import type { PredictionState } from './predictionContract';
import { formatDisplayIssueName } from './predictionContract';

export interface BoundingBox {
  x: number; // center x (normalised 0-1)
  y: number; // center y (normalised 0-1)
  width: number;
  height: number;
}

export interface Detection {
  classId: number;
  issueType: DetectedIssueType;
  displayIssueName?: string;
  confidence: number; // 0-1
  priority: Priority;
  priorityReason?: string;
  boundingBox: BoundingBox;
}

export interface YoloInferenceResult {
  isRoad: boolean;
  isDissimilar?: boolean;
  isClear?: boolean;
  roadConfidence?: number;
  predictionState: PredictionState;
  displayIssueName?: string;
  priorityReason?: string;
  analysisStatus: 'not_road' | 'unclear_image' | 'dissimilar_image' | 'damage_detected' | 'no_major_issue';
  invalidReason?: string;
  message?: string;
  detections: Detection[];
  primaryDetection: Detection | null;
}

import { getApiBaseUrl } from './apiConfig';


function iou(box1: [number, number, number, number], box2: [number, number, number, number]): number {
  const x1 = Math.max(box1[0], box2[0]);
  const y1 = Math.max(box1[1], box2[1]);
  const x2 = Math.min(box1[2], box2[2]);
  const y2 = Math.min(box1[3], box2[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area1 = (box1[2] - box1[0]) * (box1[3] - box1[1]);
  const area2 = (box2[2] - box2[0]) * (box2[3] - box2[1]);
  const union = area1 + area2 - inter;
  return union > 0 ? inter / union : 0;
}

export function applyNms(
  candidates: { classId: number; issueType: DetectedIssueType; displayIssueName?: string; confidence: number; priority: Priority; priorityReason?: string; box: [number, number, number, number]; boundingBox: BoundingBox }[],
  iouThreshold = IOU_THRESHOLD
): Detection[] {
  candidates.sort((a, b) => b.confidence - a.confidence);
  const keep: Detection[] = [];
  while (candidates.length > 0) {
    const current = candidates.shift()!;
    keep.push({
      classId: current.classId,
      issueType: current.issueType,
      displayIssueName: current.displayIssueName || formatDisplayIssueName(current.issueType),
      confidence: current.confidence,
      priority: current.priority,
      priorityReason: current.priorityReason,
      boundingBox: current.boundingBox,
    });
    candidates = candidates.filter(item => {
      if (item.classId !== current.classId) return true;
      return iou(current.box, item.box) < iouThreshold;
    });
  }
  return keep;
}

/**
 * Main inference entry point.
 * Sends image to backend AI inference API for high-precision ONNX YOLOv8 inference.
 */
export async function runYoloInference(imageUri: string, description: string = ''): Promise<YoloInferenceResult> {
  const apiUrl = `${getApiBaseUrl()}/api/analyze-road`;

  try {
    const uploadRes = await uploadImageMultipart(apiUrl, imageUri, {
      fieldName: 'image',
      fileName: 'damage-analysis.jpg',
      mimeType: 'image/jpeg',
      parameters: description ? { description } : undefined,
      timeoutMs: 8000,
    });

    if (uploadRes.ok && uploadRes.data) {
      const data = uploadRes.data;
      if (data.ok) {
        if (!data.isRoad) {
          const isUnclear = data.isClear === false || data.predictionState === 'UNCLEAR_IMAGE' || data.analysisStatus === 'unclear_image' || data.invalidReason === 'blurry_image' || data.invalidReason === 'dark_image' || data.invalidReason === 'overexposed_image';
          const predictionState: PredictionState = isUnclear ? 'UNCLEAR_IMAGE' : 'INVALID_IMAGE';
          const defaultMsg = isUnclear
            ? 'The uploaded image is unclear, blurry, or poorly lit. Please upload a clear photo or submit for manual review.'
            : 'Invalid issue image. Please upload a clear image of the reported civic infrastructure issue.';

          return {
            isRoad: false,
            isDissimilar: data.isDissimilar ?? !isUnclear,
            isClear: data.isClear ?? !isUnclear,
            roadConfidence: data.roadConfidence ?? 0,
            predictionState,
            displayIssueName: data.displayIssueName || (isUnclear ? 'Unclear Image (Manual Review Required)' : 'Invalid Issue Image'),
            priorityReason: data.priorityReason,
            analysisStatus: (data.analysisStatus as any) || (isUnclear ? 'unclear_image' : 'dissimilar_image'),
            invalidReason: data.invalidReason || (isUnclear ? 'unclear_image' : 'unrelated_image'),
            message: data.message || defaultMsg,
            detections: [],
            primaryDetection: null,
          };
        }

        const detections: Detection[] = (data.allDetections || []).map((d: any) => ({
          classId: d.classId ?? (d.issueType ? Object.values(CLASS_ID_MAP).indexOf(d.issueType) : 0),
          issueType: d.issueType,
          displayIssueName: d.displayIssueName || formatDisplayIssueName(d.issueType),
          confidence: typeof d.confidenceRaw === 'number' ? d.confidenceRaw : (typeof d.confidence === 'number' && d.confidence > 1 ? d.confidence / 100 : (d.confidence ?? 0)),
          priority: d.priority ?? calculatePriority(d.issueType, d.confidence),
          priorityReason: d.priorityReason,
          boundingBox: d.boundingBox ?? { x: 0.5, y: 0.5, width: 0.3, height: 0.3 },
        }));

        const primaryDetection: Detection | null = data.hasDamage && detections.length > 0
          ? (data.primaryDetection || detections[0])
          : null;

        const predictionState: PredictionState = primaryDetection ? 'VALID_ISSUE' : 'NO_MAJOR_ISSUE';

        return {
          isRoad: true,
          roadConfidence: data.roadConfidence ?? 0.95,
          predictionState: data.predictionState || predictionState,
          displayIssueName: data.displayIssueName || (primaryDetection ? formatDisplayIssueName(primaryDetection.issueType) : 'No Major Issue'),
          priorityReason: data.priorityReason || (primaryDetection ? primaryDetection.priorityReason : 'Normal road surface verified. No major road defects detected.'),
          analysisStatus: primaryDetection ? 'damage_detected' : 'no_major_issue',
          detections,
          primaryDetection,
        };
      } else {
        console.warn('[YOLO] Backend returned non-ok payload:', data);
        return {
          isRoad: false,
          isClear: false,
          roadConfidence: 0,
          predictionState: 'INFERENCE_FAILED',
          displayIssueName: 'Inference Failed',
          priorityReason: 'Inference service returned error state.',
          analysisStatus: 'unclear_image',
          invalidReason: data.invalidReason || 'inference_error',
          message: data.message || 'Defect detection could not be completed reliably.',
          detections: [],
          primaryDetection: null,
        };
      }
    } else {
      console.warn('[YOLO] Backend inference request note:', uploadRes.error || uploadRes.status);
    }
  } catch (err: any) {
    console.warn('[YOLO] Backend inference request exception:', err?.message || err);
  }

  // Explicit failure outcome: NEVER fabricate "no_major_issue" when inference failed or timed out
  return {
    isRoad: false,
    isClear: false,
    roadConfidence: 0,
    predictionState: 'INFERENCE_FAILED',
    displayIssueName: 'Inference Failed',
    priorityReason: 'Unable to connect to defect detection service.',
    analysisStatus: 'unclear_image',
    invalidReason: 'inference_error',
    message: 'Unable to connect to the defect detection service. Please try again or submit for manual review.',
    detections: [],
    primaryDetection: null,
  };
}

export async function releaseYoloSession(): Promise<void> {
  // Session managed by server backend
}

