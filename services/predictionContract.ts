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
  | 'unsupported_issue'
  | 'inference_error';

export type PredictionState =
  | 'VALID_ISSUE'
  | 'NO_MAJOR_ISSUE'
  | 'INVALID_IMAGE'
  | 'UNCLEAR_IMAGE'
  | 'UNSUPPORTED_ISSUE'
  | 'INFERENCE_FAILED';

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
  predictionState: PredictionState;
  predictionError?: string | null;

  // Visual Localization
  boundingBoxes: PredictionBoundingBox[];

  // Routing & Municipal Governance
  issueCategory: string;
  department: string;
  departmentCode: string;
  priority: PredictionPriority;
  severity: PredictionPriority;
  priorityReason?: string;

  // Scene Context
  isRoad: boolean;
  roadConfidence: number;  // 0-1 score
  message?: string;

  // Provenance & Multimodal Fusion
  modelVersion?: string;
  agreementStatus?: 'AGREED' | 'DISAGREED' | 'NOT_APPLICABLE';
}

/**
 * Normalizes any detected issue string into a clean, human-readable specific display name.
 * Never defaults to generic "Road Issue" when a specific defect is known.
 */
export function formatDisplayIssueName(issueType?: string | null): string {
  if (!issueType) return 'Pending Verification';
  const norm = issueType.trim().toLowerCase();
  if (norm === 'no_major_issue' || norm === 'no supported issue detected' || norm === 'normal road surface (no major defect)') {
    return 'Normal Road Surface (No Major Defect)';
  }
  if (norm === 'unclear_image' || norm === 'unclear') {
    return 'Unclear Image (Manual Review Required)';
  }
  if (norm.includes('invalid') || norm.includes('dissimilar')) {
    return 'Invalid Issue Image';
  }
  if (norm === 'pothole') return 'Pothole';
  if (norm === 'alligator cracking') return 'Alligator Cracking';
  if (norm === 'cracking' || norm === 'road surface cracking') return 'Road Cracking';
  if (norm === 'road divider damage' || norm === 'broken divider') return 'Road Divider Damage';
  if (norm === 'damaged traffic sign' || norm === 'missing signage') return 'Damaged Traffic Sign';
  if (norm === 'street light fault' || norm === 'streetlight fault') return 'Streetlight Fault';
  if (norm === 'waterlogging') return 'Waterlogging';
  if (norm === 'drainage blockage' || norm === 'drainage problem') return 'Drainage Blockage';
  if (norm === 'manhole defect' || norm === 'damaged manhole') return 'Damaged Manhole';
  if (norm === 'damaged footpath' || norm === 'broken footpath') return 'Damaged Footpath';
  if (norm === 'debris / road blockage' || norm === 'road debris / obstruction') return 'Road Debris / Obstruction';
  if (norm === 'road issue' || norm === 'road surface defect') return 'Road Surface Defect';

  // Capitalize words
  return issueType
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
