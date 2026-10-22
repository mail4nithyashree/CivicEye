/**
 * CivicEye - Centralized Typed Prediction Contract
 *
 * Provides a single, consistent, typed prediction contract across:
 * - Vision AI inference service (Multimodal Cloud & Semantic Computer Vision)
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
  | 'inference_error'
  | 'pending_review';

export type PredictionState =
  | 'VALID_ISSUE'
  | 'NO_MAJOR_ISSUE'
  | 'INVALID_IMAGE'
  | 'UNCLEAR_IMAGE'
  | 'UNSUPPORTED_ISSUE'
  | 'INFERENCE_FAILED'
  | 'PENDING_REVIEW';

export type PredictionStatus =
  | 'idle'
  | 'analyzing'
  | 'success'
  | 'failed'
  | 'rejected'
  | 'unclear'
  | 'pending_review';

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
  confidenceType?: string; // Type/origin of confidence assessment

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
 * Handles casing, underscores, hyphens, and whitespace consistently.
 * Never defaults to generic "Road Issue" when a specific defect is known.
 */
export function formatDisplayIssueName(issueType?: string | null): string {
  if (!issueType) return 'Pending Verification';
  // Normalize underscores and hyphens to spaces and trim
  const clean = issueType.trim().replace(/[_\-]+/g, ' ');
  const norm = clean.toLowerCase();

  if (norm.includes('clean road') || norm === 'clean road (no major issue)') {
    return 'Clean Road (No Major Issue)';
  }
  if (norm === 'no major issue' || norm === 'no issue' || norm === 'no supported issue detected' || norm === 'normal road surface (no major defect)' || norm === 'normal road') {
    return 'No Major Issue';
  }
  if (norm === 'unclear image' || norm === 'unclear') {
    return 'Unclear Image (Manual Review Required)';
  }
  if (norm.includes('invalid') || norm.includes('dissimilar')) {
    return 'Invalid Issue Image';
  }
  if (norm.includes('alligator')) return 'Alligator Cracking';
  if (norm === 'pothole' || norm.includes('pothole')) return 'Pothole';
  if (norm === 'cracking' || norm.includes('road cracking') || norm.includes('surface cracking') || norm.includes('crack')) return 'Road Cracking';
  if (norm.includes('divider') || norm.includes('median')) return 'Road Divider Damage';
  if (norm.includes('traffic sign') || norm.includes('missing signage') || norm.includes('sign board')) return 'Damaged Traffic Sign';
  if (norm.includes('street light') || norm.includes('streetlight') || norm.includes('lamp post')) return 'Streetlight Fault';
  if (norm.includes('waterlogging') || norm.includes('water logging') || norm.includes('flood')) return 'Waterlogging';
  if (norm.includes('drainage') || norm.includes('drain blockage') || norm.includes('gutter')) return 'Drainage Blockage';
  if (norm.includes('manhole')) return 'Damaged Manhole';
  if (norm.includes('footpath') || norm.includes('sidewalk') || norm.includes('walkway')) return 'Damaged Footpath';
  if (norm.includes('debris') || norm.includes('blockage') || norm.includes('obstruction') || norm.includes('garbage')) return 'Road Debris / Obstruction';
  if (norm === 'road issue' || norm === 'road surface defect') return 'Road Surface Defect';

  // Capitalize words
  return clean
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

