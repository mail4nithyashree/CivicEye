/**
 * Legacy compatibility alias for vision inference.
 * Re-exports clean Vision AI inference pipeline, completely removing YOLO.
 */

import {
  runVisionInference,
  type VisionDetection,
  type VisionInferenceResult,
  type BoundingBox,
} from './visionInference';
import type { DetectedIssueType, Priority } from './detectionConfig';

export type { BoundingBox };
export type Detection = VisionDetection;
export type YoloInferenceResult = VisionInferenceResult;

export async function runYoloInference(
  imageUri: string,
  description: string = ''
): Promise<VisionInferenceResult> {
  return runVisionInference(imageUri, description);
}

export async function releaseYoloSession(): Promise<void> {
  // Deprecated - no active YOLO session
}
