/**
 * CivicEye - Centralized Typed Prediction Contract
 *
 * Provides a single, consistent, typed prediction contract across:
 * - AI inference service (YOLOv8 & MobileNetV2)
 * - Frontend report screen & Issue Summary UI
 * - Backend API routes
 * - Firestore database persistence
 */

export type ValidationStatus =
  | 'valid_defect'
  | 'valid_clean_road'
  | 'unrelated_image'
  | 'unclear_image'
  | 'inference_error';

export type PredictionStatus =
  | 'idle'
  | 'analyzing'
  | 'success'
  | 'failed'
  | 'rejected'
  | 'unclear';

export type PredictionPriority = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface PredictionBoundingBox {
  x: number;      // 0-1 normalized center x
  y: number;      // 0-1 normalized center y
  width: number;  // 0-1 normalized width
  height: number; // 0-1 normalized height
  classId?: number;
  className?: string;
  confidence?: number;
}

export interface CivicPredictionContract {
  // Model Classification & Detection
  predictedClass: string | null;
  displayIssueName: string;
  confidence: number;      // 0-100 percentage
  confidenceRaw: number;   // 0-1 raw probability/score

  // Validation & Lifecycle State
  validationStatus: ValidationStatus;
  predictionStatus: PredictionStatus;
  predictionError?: string | null;

  // Visual Localization
  boundingBoxes: PredictionBoundingBox[];

  // Routing & Municipal Governance
  issueCategory: string;
  department: string;
  departmentCode: string;
  priority: PredictionPriority;
  severity: PredictionPriority;

  // Scene Context
  isRoad: boolean;
  roadConfidence: number;  // 0-1 score
  message?: string;
}

/**
 * Normalizes any detected issue string into a clean, human-readable display name.
 */
export function formatDisplayIssueName(issueType?: string | null): string {
  if (!issueType) return 'Pending Analysis';
  const norm = issueType.trim().toLowerCase();
  if (norm === 'no_major_issue' || norm === 'no supported issue detected') {
    return 'Normal Road Surface (No Major Defect)';
  }
  if (norm === 'unclear_image' || norm === 'unclear') {
    return 'Unclear Image (Manual Review Required)';
  }
  if (norm.includes('invalid') || norm.includes('dissimilar')) {
    return 'Invalid Issue Image';
  }
  if (norm === 'alligator cracking') return 'Alligator Cracking';
  if (norm === 'cracking') return 'Road Surface Cracking';
  if (norm === 'pothole') return 'Pothole';
  if (norm === 'road divider damage') return 'Road Divider Damage';
  if (norm === 'street light fault') return 'Street Light Fault';
  if (norm === 'manhole defect') return 'Manhole Defect';
  if (norm === 'waterlogging') return 'Waterlogging / Drainage Block';
  if (norm === 'debris / road blockage') return 'Debris / Road Blockage';
  if (norm === 'damaged traffic sign') return 'Damaged Traffic Sign';
  if (norm === 'damaged footpath') return 'Damaged Footpath';

  // Capitalize words
  return issueType
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
