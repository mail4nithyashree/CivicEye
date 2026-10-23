import { db } from '@/firebaseConfig';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import type { CoimbatoreRegion, PracticalBudgetDetails } from '@/constants/coimbatoreRoads';
import { calculatePracticalBudget } from '@/constants/coimbatoreRoads';
import { getApiBaseUrl } from './apiConfig';
import type { DetectedIssueType } from './detectionConfig';
import {
  getDefaultIssueTypeForDepartment,
  getDepartmentCode,
  getRoutingMessage,
  getRoutingStatus,
  isRoadDepartment,
  type DepartmentSource,
  type RoutingStatus,
} from './departmentMapping';
import {
  getEstimatedResolutionDuration,
  calculateExpectedResolutionDate,
  formatResolutionDate,
  type EstimatedDurationResult,
} from './resolutionDuration';
import {
  type CivicPredictionContract,
  type ValidationStatus,
  type PredictionStatus,
  type PredictionState,
  formatDisplayIssueName,
} from './predictionContract';
import * as Location from 'expo-location';
import { createNotification } from './notificationService';
import { checkDescriptionHasNoIssue } from './descriptionClassifier';

export type ComplaintStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Pending Field Verification'
  | 'Verified'
  | 'Assigned'
  | 'Accepted'
  | 'In Progress'
  | 'Resolved'
  | 'Citizen Verification'
  | 'Closed'
  | 'Rejected'
  | 'Needs Clarification'
  | 'Dissimilar Image to the Issue'
  | 'Invalid Issue image, raise the complaint with the appropriate image!'
  | 'Invalid Image, give valid Issue Image!'
  | 'Failed'
  | 'Reopened';

export function isInvalidImageComplaint(statusOrComplaint?: any): boolean {
  if (!statusOrComplaint) return false;
  if (typeof statusOrComplaint === 'string') {
    return statusOrComplaint === 'Invalid Image, give valid Issue Image!' ||
           statusOrComplaint === 'Invalid Issue image, raise the complaint with the appropriate image!' ||
           statusOrComplaint === 'Dissimilar Image to the Issue' ||
           statusOrComplaint === 'Rejected';
  }
  const s = statusOrComplaint.status;
  const insp = statusOrComplaint.inspectionStatus;
  const rejType = statusOrComplaint.rejectionType;
  const issue = statusOrComplaint.issueType;
  const predState = statusOrComplaint.predictionState;
  const valStatus = statusOrComplaint.validationStatus;
  return s === 'Invalid Image, give valid Issue Image!' ||
         s === 'Invalid Issue image, raise the complaint with the appropriate image!' ||
         s === 'Dissimilar Image to the Issue' ||
         s === 'Rejected' ||
         insp === 'INVALID' ||
         rejType === 'IMAGE_MISMATCH' ||
         rejType === 'INVALID_IMAGE' ||
         predState === 'INVALID_IMAGE' ||
         valStatus === 'unrelated_image' ||
         (typeof issue === 'string' && issue.includes('Invalid'));
}

export type InspectionStatus =
  | 'PENDING'
  | 'VALID'
  | 'INVALID';

export type FieldVerificationStatus =
  | 'pending'
  | 'verified'
  | 'transferred'
  | 'department_confirmed'
  | 'rejected';

export interface StatusHistoryItem {
  id: string;
  previousStatus: string;
  newStatus: string;
  updatedBy: string;
  updatedByName: string;
  remarks?: string;
  timestamp: Date;
}

export interface FieldInspectionDetails {
  isIssuePresent: boolean;
  verifiedIssue: DetectedIssueType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  estimatedResolutionDays: number; // 1 to 7 days
  estimatedBudget: number;         // INR e.g. 25000
  estimatedBudgetDesc?: string;
  budgetBreakdown?: PracticalBudgetDetails;
  roadId?: string;
  roadName: string;
  roadType: string;
  region: CoimbatoreRegion;
  maintenanceAuthority: string;
  departmentName: string;
  officerName?: string;
  officerContact?: string;
  isOtherDeptInvolved: boolean;
  involvedDepartments?: string[];
  otherDeptReason?: string;
  inspectorRemarks: string;
  inspectedAt: Date;
  inspectedBy: string;
  inspectedByName: string;
}

export interface CitizenVerificationDetails {
  verifiedByCitizen: boolean;
  isResolvedSatisfied: boolean;
  citizenFeedback?: string;
  verifiedAt: Date;
}

export interface AuthorityResolutionDetails {
  resolvedAt: Date;
  resolvedBy: string;
  resolvedByName: string;
  contractorName?: string;
  resolutionRemarks: string;
  afterRepairImageUri?: string;
}

export interface Complaint {
  id: string;
  complaintId: string;
  citizenId: string;
  citizenEmail: string;
  imageUri: string;
  imageUrl?: string;
  description: string;
  latitude: number;
  longitude: number;
  region?: CoimbatoreRegion;
  locationSource?: 'current' | 'map';
  locationAddress?: string;

  // AI Model Prediction Fields
  issueType: string;           // 'alligator cracking' | 'cracking' | 'pothole' | 'no_major_issue'
  confidence: number;          // 0–100 percentage
  confidenceRaw?: number;      // 0-1 raw probability/score
  confidenceType?: string;     // Type of confidence assessment
  predictedClass?: string | null;
  priority: string;            // 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  severity: string;            // Initial severity from AI priority
  estimatedBudget?: number;    // Estimated budget in INR
  estimatedBudgetDesc?: string;// Scope of practical budget
  budgetBreakdown?: PracticalBudgetDetails; // Itemized Bill of Quantities & Labor/Machinery Breakdown

  // Department & Routing fields
  department: string;
  responsibleDepartment: string;
  departmentCode: string;
  departmentSource?: DepartmentSource;
  routingStatus?: RoutingStatus;
  routingMessage?: string;
  originalDepartment?: string;
  matchedKeyword?: string;
  departmentExplanation?: string;
  departmentChangedAt?: Date;
  departmentChangedBy?: string;
  departmentChangedByName?: string;
  departmentRemarks?: string;

  // Expected Resolution Duration fields
  estimatedResolutionDuration?: string; // e.g. "2 Days", "3 Days"
  estimatedResolutionDays?: number;     // e.g. 2, 3
  expectedResolutionDate?: Date;        // Expected resolution timestamp

  // Officer Assignment fields
  assignedOfficerId?: string;
  assignedOfficerName?: string;
  assignedOfficer?: string;

  // Field Verification status & transfer fields
  fieldVerificationStatus?: FieldVerificationStatus;
  fieldVerificationRemarks?: string;
  verifiedDepartment?: string;
  previousDepartment?: string;
  fieldVerifiedAt?: Date;
  fieldVerifiedBy?: string;
  fieldVerifiedById?: string;

  // Road AI verification fields
  roadValidationResult?: 'road' | 'not_road' | 'unclear' | 'dissimilar_image';
  roadValidationConfidence?: number;
  analysisStatus?: 'not_road' | 'unclear_image' | 'dissimilar_image' | 'damage_detected' | 'no_major_issue';
  AI_prediction?: string;
  AI_confidence?: number;
  AI_validation?: string;
  AI_timestamp?: Date;
  predictionState?: PredictionState;
  priorityReason?: string;
  displayIssueName?: string;
  trainingCandidateStatus?: 'unverified_candidate' | 'inspector_verified' | 'rejected_candidate';
  agreementStatus?: 'AGREED' | 'DISAGREED' | 'NOT_APPLICABLE';
  modelVersion?: string;
  originalPrediction?: string | null;
  originalScore?: number;
  imageValidationOutcome?: string;
  feedbackTimestamp?: Date;

  // Lifecycle Status
  status: ComplaintStatus;
  inspectionStatus?: InspectionStatus;

  // Field Inspector Assignment & Verification
  assignedInspectorId?: string;
  assignedInspectorName?: string;
  assignedAt?: Date;
  assignedBy?: string;
  assignedByName?: string;
  inspectionDetails?: FieldInspectionDetails;
  inspectionResult?: 'genuine' | 'fake';
  inspectorRemarks?: string;
  inspectionEvidenceUrl?: string;
  inspectedAt?: Date;
  inspectedBy?: string;
  inspectedByName?: string;

  // Road & Maintenance Authority (Verified by Field Inspector)
  roadId?: string;
  roadName?: string;
  roadType?: string;
  maintenanceAuthority?: string;
  departmentId?: string;
  assignedAuthority?: string;

  // Multi-Department Involvement
  isOtherDeptInvolved?: boolean;
  involvedDepartments?: string[];
  otherDeptReason?: string;

  // Authority Acceptance & Work Progress
  authorityAcceptedAt?: Date;
  workStartedAt?: Date;
  officerRemarks?: string;
  inProgressByName?: string;

  // Resolution Details
  resolutionDetails?: AuthorityResolutionDetails;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolvedByName?: string;
  resolutionRemarks?: string;

  // Rejection Details
  rejectionReason?: string;
  rejectionType?: string;
  rejectedAt?: Date;

  // Citizen Final Verification
  citizenVerification?: CitizenVerificationDetails;

  // Clarification Workflow
  clarificationRequest?: string;
  clarificationRequestedAt?: Date;
  clarificationRequestedBy?: string;
  clarificationRequestedById?: string;
  citizenClarificationResponse?: string;
  citizenClarificationRespondedAt?: Date;

  // Closure Workflow
  closureReason?: string;
  closureOutcome?: string;
  closedAt?: Date;
  closedBy?: string;
  closedById?: string;
  closedByRole?: string;

  // Audit & Deletion History
  statusHistory?: StatusHistoryItem[];
  isDeleted?: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  deletedByRole?: 'citizen' | 'officer' | 'authority' | 'admin';
  deletionReason?: string;

  createdAt: Date;
  updatedAt: Date;
}

export interface NewComplaintData {
  complaintId?: string;
  clientSubmissionId?: string;
  predictionContract?: CivicPredictionContract;
  citizenId: string;
  citizenEmail: string;
  imageUri: string;
  description: string;
  latitude: number;
  longitude: number;
  region?: CoimbatoreRegion;
  locationSource?: 'current' | 'map';
  locationAddress?: string;
  issueType: string;
  displayIssueName?: string;
  predictedClass?: string | null;
  confidence: number;
  confidenceRaw?: number;
  confidenceType?: string;
  priority: string;
  severity: string;
  priorityReason?: string;
  predictionState?: PredictionState;
  modelVersion?: string;
  department?: string;
  responsibleDepartment?: string;
  departmentCode?: string;
  departmentSource?: DepartmentSource;
  routingStatus?: RoutingStatus;
  routingMessage?: string;
  originalDepartment?: string;
  matchedKeyword?: string;
  departmentExplanation?: string;
  roadValidationResult?: 'road' | 'not_road' | 'unclear' | 'dissimilar_image';
  roadValidationConfidence?: number;
  analysisStatus?: 'not_road' | 'unclear_image' | 'dissimilar_image' | 'damage_detected' | 'no_major_issue';
  detectedIssue?: string;
  detectionConfidence?: number;
  suggestedRoadName?: string;
  suggestedAuthority?: string;
  estimatedBudget?: number;
  estimatedBudgetDesc?: string;
  budgetBreakdown?: PracticalBudgetDetails;
  assignedOfficer?: string;
  assignedOfficerId?: string;
  assignedOfficerName?: string;
  officerName?: string;
  estimatedResolutionDuration?: string;
  estimatedResolutionDays?: number;
  expectedResolutionDate?: Date;
  fieldVerificationStatus?: FieldVerificationStatus;
  status?: ComplaintStatus;
  inspectionStatus?: InspectionStatus;

  // Clarification & Closure fields
  clarificationRequest?: string;
  clarificationRequestedAt?: Date;
  clarificationRequestedBy?: string;
  clarificationRequestedById?: string;
  citizenClarificationResponse?: string;
  citizenClarificationRespondedAt?: Date;
  closureReason?: string;
  closureOutcome?: string;
  closedAt?: Date;
  closedBy?: string;
  closedById?: string;
  closedByRole?: string;
  rejectionReason?: string;
  rejectionType?: string;
  rejectedAt?: Date;
}

export interface AnalysisLogData {
  citizenId?: string;
  citizenEmail?: string;
  imageReference?: string;
  roadValidationResult: 'road' | 'not_road' | 'unclear' | 'dissimilar_image';
  roadValidationConfidence: number;
  analysisStatus: 'not_road' | 'unclear_image' | 'dissimilar_image' | 'damage_detected' | 'no_major_issue';
  detectedIssue: string;
  detectionConfidence: number;
  latitude?: number;
  longitude?: number;
  region?: CoimbatoreRegion;
  locationSource?: 'current' | 'map';
  locationAddress?: string;
}

/**
 * Reverse geocodes coordinates to a human-readable address.
 * Falls back gracefully to coordinates string if geocoding fails.
 */
export async function reverseGeocodeLocation(latitude: number, longitude: number): Promise<string> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results && results.length > 0) {
      const item = results[0];
      const parts = [
        item.name,
        item.street,
        item.district || item.subregion,
        item.city,
        item.region,
      ].filter(Boolean) as string[];

      // Filter consecutive duplicates
      const uniqueParts = parts.filter((part, idx, arr) => arr.indexOf(part) === idx);
      if (uniqueParts.length > 0) {
        return uniqueParts.join(', ');
      }
    }
  } catch (error) {
    console.warn('[complaintService] Reverse geocode error:', error);
  }
  return `Lat: ${latitude.toFixed(5)}, Lng: ${longitude.toFixed(5)}`;
}

function parseComplaintDoc(d: QueryDocumentSnapshot<DocumentData> | DocumentData, docId?: string): Complaint {
  const data = typeof d.data === 'function' ? d.data() : d;
  const id = docId || d.id || '';

  const parseDate = (val: any): Date | undefined => {
    if (!val) return undefined;
    if (val.toDate && typeof val.toDate === 'function') return val.toDate();
    if (val instanceof Date) return val;
    const dObj = new Date(val);
    return isNaN(dObj.getTime()) ? undefined : dObj;
  };

  const statusHistory: StatusHistoryItem[] = Array.isArray(data.statusHistory)
    ? data.statusHistory.map((item: any) => ({
        id: item.id || `hist-${Math.random().toString(36).substring(2, 9)}`,
        previousStatus: item.previousStatus || '',
        newStatus: item.newStatus || '',
        updatedBy: item.updatedBy || '',
        updatedByName: item.updatedByName || 'Officer',
        remarks: item.remarks || '',
        timestamp: parseDate(item.timestamp) || new Date(),
      }))
    : [];

  const inspectionDetails: FieldInspectionDetails | undefined = data.inspectionDetails
    ? {
        isIssuePresent: data.inspectionDetails.isIssuePresent ?? true,
        verifiedIssue: data.inspectionDetails.verifiedIssue || data.issueType || 'pothole',
        severity: data.inspectionDetails.severity || 'MEDIUM',
        estimatedResolutionDays: data.inspectionDetails.estimatedResolutionDays || 3,
        estimatedBudget: data.inspectionDetails.estimatedBudget || 0,
        estimatedBudgetDesc: data.inspectionDetails.estimatedBudgetDesc || data.estimatedBudgetDesc,
        budgetBreakdown: data.inspectionDetails.budgetBreakdown || data.budgetBreakdown,
        roadId: data.inspectionDetails.roadId,
        roadName: data.inspectionDetails.roadName || data.roadName || 'Coimbatore Sector Road',
        roadType: data.inspectionDetails.roadType || 'Major Arterial',
        region: (data.inspectionDetails.region || data.region || 'Gandhipuram') as CoimbatoreRegion,
        maintenanceAuthority: data.inspectionDetails.maintenanceAuthority || 'Coimbatore City Municipal Corporation (CCMC)',
        departmentName: data.inspectionDetails.departmentName || 'Road Maintenance Division',
        officerName: data.inspectionDetails.officerName,
        officerContact: data.inspectionDetails.officerContact,
        isOtherDeptInvolved: !!data.inspectionDetails.isOtherDeptInvolved,
        involvedDepartments: data.inspectionDetails.involvedDepartments || [],
        otherDeptReason: data.inspectionDetails.otherDeptReason,
        inspectorRemarks: data.inspectionDetails.inspectorRemarks || '',
        inspectedAt: parseDate(data.inspectionDetails.inspectedAt) || new Date(),
        inspectedBy: data.inspectionDetails.inspectedBy || '',
        inspectedByName: data.inspectionDetails.inspectedByName || 'Field Inspector',
      }
    : undefined;

  const resolutionDetails: AuthorityResolutionDetails | undefined = data.resolutionDetails
    ? {
        resolvedAt: parseDate(data.resolutionDetails.resolvedAt) || new Date(),
        resolvedBy: data.resolutionDetails.resolvedBy || '',
        resolvedByName: data.resolutionDetails.resolvedByName || 'Maintenance Division',
        contractorName: data.resolutionDetails.contractorName,
        resolutionRemarks: data.resolutionDetails.resolutionRemarks || '',
        afterRepairImageUri: data.resolutionDetails.afterRepairImageUri,
      }
    : undefined;

  const citizenVerification: CitizenVerificationDetails | undefined = data.citizenVerification
    ? {
        verifiedByCitizen: !!data.citizenVerification.verifiedByCitizen,
        isResolvedSatisfied: !!data.citizenVerification.isResolvedSatisfied,
        citizenFeedback: data.citizenVerification.citizenFeedback,
        verifiedAt: parseDate(data.citizenVerification.verifiedAt) || new Date(),
      }
    : undefined;

  const activeDepartment = data.department || data.responsibleDepartment || 'Road Maintenance';
  const isRoad = isRoadDepartment({
    department: activeDepartment,
    departmentCode: data.departmentCode,
    routingStatus: data.routingStatus,
  });
  const isNonRoad = !isRoad;
  const deptCode = data.departmentCode || getDepartmentCode(activeDepartment);
  const defaultIssue = isNonRoad ? getDefaultIssueTypeForDepartment(deptCode) : 'pothole';

  const canonicalName = data.displayIssueName
    ? formatDisplayIssueName(data.displayIssueName)
    : formatDisplayIssueName(data.issueType || data.detectedIssue || data.AI_prediction || defaultIssue);

  const canonicalPriority = (data.priority || data.severity || 'LOW').toUpperCase();

  const rawConf = typeof data.confidence === 'number'
    ? data.confidence
    : (typeof data.AI_confidence === 'number'
      ? data.AI_confidence
      : (typeof data.detectionConfidence === 'number' ? data.detectionConfidence : 0));
  const normalizedConfidence = rawConf > 0 && rawConf <= 1 ? Math.round(rawConf * 100) : Math.round(rawConf);
  const normalizedConfidenceRaw = typeof data.confidenceRaw === 'number'
    ? data.confidenceRaw
    : (normalizedConfidence > 0 ? normalizedConfidence / 100 : 0);

  const createdAtDate = parseDate(data.createdAt) || new Date();
  const calculatedDuration = getEstimatedResolutionDuration(
    canonicalPriority,
    canonicalName,
    activeDepartment,
    createdAtDate
  );

  const estimatedResolutionDays = typeof data.estimatedResolutionDays === 'number'
    ? data.estimatedResolutionDays
    : (data.inspectionDetails?.estimatedResolutionDays || calculatedDuration.durationDays);

  const estimatedResolutionDuration = data.estimatedResolutionDuration || `${estimatedResolutionDays} Days`;

  const expectedResolutionDate = parseDate(data.expectedResolutionDate) ||
    calculateExpectedResolutionDate(createdAtDate, estimatedResolutionDays);

  const rawOfficer = data.assignedOfficerName || data.assignedOfficer || data.officerName;
  const assignedOfficerName = typeof rawOfficer === 'string' && rawOfficer.trim() && !rawOfficer.includes('will be assigned') && !rawOfficer.includes('Awaiting Assignment')
    ? rawOfficer.trim()
    : undefined;
  const assignedOfficerId = data.assignedOfficerId || undefined;

  const fieldVerificationStatus: FieldVerificationStatus = (data.fieldVerificationStatus as FieldVerificationStatus) ||
    (data.status === 'Verified' ? 'department_confirmed' :
     data.status === 'Rejected' || data.status === 'Dissimilar Image to the Issue' ? 'rejected' :
     data.routingStatus?.startsWith('Moved') ? 'transferred' : 'pending');

    return {
      id,
      complaintId: data.complaintId || 'CE0000',
      citizenId: data.citizenId || '',
      citizenEmail: data.citizenEmail || data.email || '',
      imageUri: (data.imageUri || data.imageUrl || data.image || data.photoUrl || data.cloudinaryUrl || '').trim(),
      imageUrl: (data.imageUrl || data.imageUri || data.image || data.photoUrl || data.cloudinaryUrl || '').trim(),
      description: data.description || '',
      latitude: typeof data.latitude === 'number' ? data.latitude : (typeof data.lat === 'number' ? data.lat : 0),
      longitude: typeof data.longitude === 'number' ? data.longitude : (typeof data.long === 'number' ? data.long : 0),
      region: (data.region || 'Gandhipuram') as CoimbatoreRegion,
      locationSource: data.locationSource || 'current',
      locationAddress: data.locationAddress || '',

      issueType: canonicalName,
      confidence: normalizedConfidence,
      confidenceRaw: normalizedConfidenceRaw,
      confidenceType: data.confidenceType || 'vision_assessment',
      predictedClass: data.predictedClass ?? (data.displayIssueName || data.issueType || canonicalName),
      priority: canonicalPriority,
      severity: canonicalPriority,
      priorityReason: data.priorityReason,
      displayIssueName: canonicalName,
      predictionState: data.predictionState,
      modelVersion: data.modelVersion || 'CivicEye-Vision-Engine-v3',
      estimatedBudget: typeof data.estimatedBudget === 'number' ? data.estimatedBudget : data.inspectionDetails?.estimatedBudget,
      estimatedBudgetDesc: data.estimatedBudgetDesc || data.inspectionDetails?.estimatedBudgetDesc,
      budgetBreakdown: data.budgetBreakdown || data.inspectionDetails?.budgetBreakdown,

    department: activeDepartment,
    responsibleDepartment: isNonRoad ? activeDepartment : (data.responsibleDepartment || activeDepartment),
    departmentCode: deptCode,
    departmentSource: data.departmentSource || (isNonRoad ? 'description' : 'ai'),
    routingStatus: data.routingStatus || (isNonRoad ? getRoutingStatus(activeDepartment) : 'Direct'),
    routingMessage: data.routingMessage || (isNonRoad ? getRoutingMessage(activeDepartment) : undefined),
    originalDepartment: data.originalDepartment || (isNonRoad ? activeDepartment : 'Road Maintenance'),
    matchedKeyword: data.matchedKeyword || undefined,
    departmentExplanation: data.departmentExplanation || '',
    departmentChangedAt: parseDate(data.departmentChangedAt),
    departmentChangedBy: data.departmentChangedBy,
    departmentChangedByName: data.departmentChangedByName,
    departmentRemarks: data.departmentRemarks,

    // Resolution Duration
    estimatedResolutionDuration,
    estimatedResolutionDays,
    expectedResolutionDate,

    // Officer Assignment
    assignedOfficerId,
    assignedOfficerName,
    assignedOfficer: assignedOfficerName,

    // Field Verification
    fieldVerificationStatus,
    fieldVerificationRemarks: data.fieldVerificationRemarks || data.inspectorRemarks || data.departmentRemarks || undefined,
    verifiedDepartment: data.verifiedDepartment || (data.status === 'Verified' ? activeDepartment : undefined),
    previousDepartment: data.previousDepartment || data.originalDepartment || undefined,
    fieldVerifiedAt: parseDate(data.fieldVerifiedAt) || parseDate(data.inspectedAt),
    fieldVerifiedBy: data.fieldVerifiedBy || data.inspectedByName || undefined,
    fieldVerifiedById: data.fieldVerifiedById || data.inspectedBy || undefined,

    roadValidationResult: data.roadValidationResult,
    roadValidationConfidence: data.roadValidationConfidence,
    analysisStatus: data.analysisStatus,
    AI_prediction: data.AI_prediction || data.issueType,
    AI_confidence: data.AI_confidence ?? data.confidence,
    AI_validation: data.AI_validation ?? data.roadValidationResult,
    AI_timestamp: parseDate(data.AI_timestamp),
    trainingCandidateStatus: data.trainingCandidateStatus,
    agreementStatus: data.agreementStatus,
    originalPrediction: data.originalPrediction,
    originalScore: data.originalScore,
    imageValidationOutcome: data.imageValidationOutcome,
    feedbackTimestamp: parseDate(data.feedbackTimestamp),

    status: (data.status as ComplaintStatus) || 'Pending Field Verification',
    inspectionStatus: data.inspectionStatus,

    assignedInspectorId: data.assignedInspectorId,
    assignedInspectorName: data.assignedInspectorName,
    assignedAt: parseDate(data.assignedAt),
    assignedBy: data.assignedBy,
    assignedByName: data.assignedByName,

    inspectionDetails,
    inspectionResult: data.inspectionResult,
    inspectorRemarks: data.inspectorRemarks || data.inspectionDetails?.inspectorRemarks,
    inspectionEvidenceUrl: data.inspectionEvidenceUrl,
    inspectedAt: parseDate(data.inspectedAt) || parseDate(data.inspectionDetails?.inspectedAt),
    inspectedBy: data.inspectedBy || data.inspectionDetails?.inspectedBy,
    inspectedByName: data.inspectedByName || data.inspectionDetails?.inspectedByName,

    roadId: data.roadId,
    roadName: data.roadName,
    roadType: data.roadType,
    maintenanceAuthority: data.maintenanceAuthority,
    departmentId: data.departmentId,
    assignedAuthority: data.assignedAuthority,

    isOtherDeptInvolved: !!data.isOtherDeptInvolved,
    involvedDepartments: data.involvedDepartments || [],
    otherDeptReason: data.otherDeptReason,

    authorityAcceptedAt: parseDate(data.authorityAcceptedAt),
    workStartedAt: parseDate(data.workStartedAt),
    officerRemarks: data.officerRemarks,
    inProgressByName: data.inProgressByName,

    resolutionDetails,
    resolvedAt: parseDate(data.resolvedAt) || parseDate(data.resolutionDetails?.resolvedAt),
    resolvedBy: data.resolvedBy || data.resolutionDetails?.resolvedBy,
    resolvedByName: data.resolvedByName || data.resolutionDetails?.resolvedByName,
    resolutionRemarks: data.resolutionRemarks || data.resolutionDetails?.resolutionRemarks,

    rejectionReason: data.rejectionReason,
    rejectionType: data.rejectionType,
    rejectedAt: parseDate(data.rejectedAt),

    citizenVerification,
    clarificationRequest: data.clarificationRequest,
    clarificationRequestedAt: parseDate(data.clarificationRequestedAt),
    clarificationRequestedBy: data.clarificationRequestedBy,
    clarificationRequestedById: data.clarificationRequestedById,
    citizenClarificationResponse: data.citizenClarificationResponse,
    citizenClarificationRespondedAt: parseDate(data.citizenClarificationRespondedAt),

    closureReason: data.closureReason,
    closureOutcome: data.closureOutcome,
    closedAt: parseDate(data.closedAt),
    closedBy: data.closedBy,
    closedById: data.closedById,
    closedByRole: data.closedByRole,

    statusHistory,

    isDeleted: !!data.isDeleted,
    deletedAt: parseDate(data.deletedAt),
    deletedBy: data.deletedBy,
    deletedByRole: data.deletedByRole,
    deletionReason: data.deletionReason,

    createdAt: createdAtDate,
    updatedAt: parseDate(data.updatedAt) || new Date(),
  };
}

/**
 * Format system date dynamically in Asia/Kolkata timezone (YYYYMMDD)
 */
export function getKolkataDateKey(customDate: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(customDate).replace(/-/g, '');
}

/**
 * Concurrency-safe human-readable Complaint ID generator: CE-YYYYMMDD-000001
 * Uses Firestore transaction atomic counter per calendar date in Asia/Kolkata timezone.
 * Guarantees zero collisions, uniqueness under concurrent submissions,
 * and stable readable IDs.
 */
export async function generateMeaningfulComplaintId(customDate: Date = new Date()): Promise<string> {
  const dateKey = getKolkataDateKey(customDate);

  let attempts = 0;
  const maxAttempts = 6;
  while (attempts < maxAttempts) {
    try {
      const counterRef = doc(db, 'counters', `complaints_${dateKey}`);
      const nextSeq = await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(counterRef);
        let current = 0;
        if (snap.exists() && typeof snap.data().lastSequence === 'number') {
          current = snap.data().lastSequence;
        }
        const next = current + 1;
        transaction.set(counterRef, {
          dateKey,
          lastSequence: next,
          updatedAt: serverTimestamp(),
        }, { merge: true });
        return next;
      });

      const complaintId = `CE-${dateKey}-${String(nextSeq).padStart(6, '0')}`;
      console.log(`[complaintService] Concurrency-safe ID allocated: ${complaintId}`);
      return complaintId;
    } catch (err) {
      attempts++;
      if (attempts >= maxAttempts) {
        console.warn('[complaintService] Firestore transaction failed after retries, trying backend endpoint:', err);
        break;
      }
      await new Promise(r => setTimeout(r, 40 * attempts + Math.random() * 80));
    }
  }

  try {
    const res = await fetch(`${getApiBaseUrl()}/api/next-complaint-id?dateKey=${dateKey}`);
    if (res.ok) {
      const data = await res.json();
      if (data.complaintId) return data.complaintId;
    }
  } catch (apiErr) {
    console.warn('[complaintService] Backend endpoint fallback note:', apiErr);
  }
  // Fail-hard policy: NEVER fall back to random/timestamp/fake ID. Throw an explicit error to prevent corrupted submissions.
  throw new Error(`Failed to allocate a valid sequential complaint ID for date ${dateKey}. Please check your connection and retry.`);
}

// Backward-compatibility alias
export const generateComplaintId = generateMeaningfulComplaintId;

/**
 * Dispatch submission confirmation email to citizen via backend endpoint.
 * Handles failure gracefully so complaint storage is never blocked.
 */
export async function sendComplaintSubmissionEmail(params: {
  complaintId: string;
  issueType: string;
  description: string;
  citizenEmail: string;
  priority?: string;
  department?: string;
  status?: string;
}): Promise<boolean> {
  if (!params.citizenEmail || !params.citizenEmail.includes('@')) {
    return false;
  }
  try {
    const apiUrl = `${getApiBaseUrl()}/api/send-email`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'submission',
        complaintId: params.complaintId,
        issueType: params.issueType,
        description: params.description,
        citizenEmail: params.citizenEmail,
        priority: params.priority || 'Standard',
        department: params.department || 'Road Maintenance',
        newStatus: params.status || 'Submitted',
        timestamp: new Date().toISOString(),
      }),
    });
    if (response.ok) {
      console.log(`[complaintService] Submission email successfully triggered for ${params.citizenEmail}`);
      return true;
    }
    return false;
  } catch (error) {
    console.warn('[complaintService] Submission email error (handled safely):', error);
    return false;
  }
}

/**
 * Dispatch status update email to citizen via backend endpoint.
 * Handles failure gracefully so complaint storage is never blocked.
 */
export async function sendStatusUpdateEmail(params: {
  complaintId: string;
  issueType: string;
  citizenEmail: string;
  previousStatus: string;
  newStatus: string;
  statusRemarks?: string;
  department?: string;
  updatedByName?: string;
}): Promise<boolean> {
  if (!params.citizenEmail || !params.citizenEmail.includes('@')) {
    return false;
  }
  try {
    const apiUrl = `${getApiBaseUrl()}/api/send-email`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'status_update',
        complaintId: params.complaintId,
        issueType: params.issueType,
        citizenEmail: params.citizenEmail,
        previousStatus: params.previousStatus,
        newStatus: params.newStatus,
        statusRemarks: params.statusRemarks,
        department: params.department || 'Road Maintenance',
        updatedByName: params.updatedByName || 'Municipal Officer',
        timestamp: new Date().toISOString(),
      }),
    });
    if (response.ok) {
      console.log(`[complaintService] Status update email successfully triggered for ${params.citizenEmail}`);
      return true;
    }
    return false;
  } catch (error) {
    console.warn('[complaintService] Status update email error (handled safely):', error);
    return false;
  }
}

/**
 * Dispatch complaint deletion email to citizen via backend endpoint.
 * Handles failure gracefully so complaint deletion is never rolled back.
 */
export async function sendComplaintDeletionEmail(params: {
  complaintId: string;
  issueType?: string;
  citizenEmail: string;
  initiatedBy: 'citizen' | 'authority';
  deletionReason?: string;
  deletedByName?: string;
}): Promise<boolean> {
  if (!params.citizenEmail || !params.citizenEmail.includes('@')) {
    return false;
  }
  try {
    const apiUrl = `${getApiBaseUrl()}/api/send-email`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'deletion',
        complaintId: params.complaintId,
        issueType: params.issueType || 'Civic Infrastructure Defect',
        citizenEmail: params.citizenEmail,
        initiatedBy: params.initiatedBy,
        deletionReason: params.deletionReason,
        deletedByName: params.deletedByName,
        timestamp: new Date().toISOString(),
      }),
    });
    if (response.ok) {
      console.log(`[complaintService] Deletion email successfully triggered for ${params.citizenEmail}`);
      return true;
    }
    return false;
  } catch (error) {
    console.warn('[complaintService] Deletion email error (handled safely):', error);
    return false;
  }
}

/**
 * Dispatch clarification email to citizen via backend endpoint.
 * Handles failure gracefully so complaint storage is never blocked.
 */
export async function sendClarificationEmail(params: {
  complaintId: string;
  issueType: string;
  citizenEmail: string;
  inspectorName?: string;
  clarificationQuestion: string;
  department?: string;
}): Promise<boolean> {
  if (!params.citizenEmail || !params.citizenEmail.includes('@')) {
    return false;
  }
  try {
    const apiUrl = `${getApiBaseUrl()}/api/send-email`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clarification',
        complaintId: params.complaintId,
        issueType: params.issueType,
        citizenEmail: params.citizenEmail,
        inspectorName: params.inspectorName || 'Field Inspector',
        clarificationQuestion: params.clarificationQuestion,
        department: params.department || 'Road Maintenance',
        newStatus: 'Needs Clarification',
        timestamp: new Date().toISOString(),
      }),
    });
    if (response.ok) {
      console.log(`[complaintService] Clarification email successfully triggered for ${params.citizenEmail}`);
      return true;
    }
    return false;
  } catch (error) {
    console.warn('[complaintService] Clarification email error (handled safely):', error);
    return false;
  }
}

/**
 * Dispatch closure email to citizen via backend endpoint.
 * Handles failure gracefully so complaint storage is never blocked.
 */
export async function sendClosureEmail(params: {
  complaintId: string;
  issueType: string;
  citizenEmail: string;
  inspectorName?: string;
  closureReason: string;
  closureOutcome?: string;
  inspectorRemarks?: string;
  department?: string;
}): Promise<boolean> {
  if (!params.citizenEmail || !params.citizenEmail.includes('@')) {
    return false;
  }
  try {
    const apiUrl = `${getApiBaseUrl()}/api/send-email`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'closure',
        complaintId: params.complaintId,
        issueType: params.issueType,
        citizenEmail: params.citizenEmail,
        inspectorName: params.inspectorName || 'Field Inspector',
        closureReason: params.closureReason,
        closureOutcome: params.closureOutcome || 'No Major Repair Required',
        statusRemarks: params.inspectorRemarks || params.closureReason,
        department: params.department || 'Road Maintenance',
        newStatus: 'Closed',
        timestamp: new Date().toISOString(),
      }),
    });
    if (response.ok) {
      console.log(`[complaintService] Closure email successfully triggered for ${params.citizenEmail}`);
      return true;
    }
    return false;
  } catch (error) {
    console.warn('[complaintService] Closure email error (handled safely):', error);
    return false;
  }
}

/**
 * Helper to trigger both in-app notification and email on status change.
 */
export async function notifyCitizenStatusChange(params: {
  complaintId: string;
  docId: string;
  citizenId?: string;
  citizenEmail?: string;
  issueType: string;
  previousStatus: string;
  newStatus: string;
  remarks?: string;
  department?: string;
  updatedByName?: string;
}): Promise<void> {
  // 1. In-app notification
  if (params.citizenId) {
    try {
      await createNotification({
        userId: params.citizenId,
        recipientId: params.citizenId,
        recipientRole: 'citizen',
        complaintId: params.docId,
        title: `Complaint Status: ${params.newStatus}`,
        message: `Your complaint ${params.complaintId} (${params.issueType}) is now "${params.newStatus}". ${params.remarks ? `Remarks: ${params.remarks}` : ''}`,
        type: params.newStatus === 'Resolved' ? 'work_resolved' : params.newStatus === 'Verified' ? 'field_verified' : 'work_in_progress',
      });
    } catch (notifErr) {
      console.warn('[complaintService] In-app notification error (handled safely):', notifErr);
    }
  }

  // 2. Email notification
  if (params.citizenEmail) {
    sendStatusUpdateEmail({
      complaintId: params.complaintId,
      issueType: params.issueType,
      citizenEmail: params.citizenEmail,
      previousStatus: params.previousStatus,
      newStatus: params.newStatus,
      statusRemarks: params.remarks,
      department: params.department,
      updatedByName: params.updatedByName,
    }).catch(err => {
      console.warn('[complaintService] Status update email error (handled safely):', err);
    });
  }
}

/**
 * Dispatch email notification to citizen via backend endpoint.
 * Handles failure gracefully so complaint storage is never blocked.
 */
export async function sendSWMNotificationEmail(params: {
  complaintId: string;
  issueType: string;
  description: string;
  citizenEmail: string;
  department?: string;
  routingStatus?: string;
}): Promise<boolean> {
  return sendComplaintSubmissionEmail({
    complaintId: params.complaintId,
    issueType: params.issueType,
    description: params.description,
    citizenEmail: params.citizenEmail,
    department: params.department || 'Solid Waste Management',
  });
}

// Backward-compatibility alias
export const sendDrainageNotificationEmail = sendSWMNotificationEmail;

import { uploadImageMultipart } from './multipartUpload';

export async function uploadComplaintImage(imageUri: string): Promise<string> {
  if (!imageUri) {
    throw new Error('No image selected. Please choose a valid complaint image.');
  }

  // If already a remote URL (e.g. Cloudinary), return directly
  if (imageUri.startsWith('http://') || imageUri.startsWith('https://')) {
    return imageUri;
  }

  try {
    const apiUrl = `${getApiBaseUrl()}/api/upload-image`;
    const uploadRes = await uploadImageMultipart(apiUrl, imageUri, {
      fieldName: 'image',
      fileName: `complaint-${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      timeoutMs: 15000,
    });

    if (uploadRes.ok && uploadRes.data) {
      const payload = uploadRes.data;
      const secureUrl = payload?.secureUrl ?? payload?.url;
      if (secureUrl && typeof secureUrl === 'string') {
        console.log('[complaintService] Image successfully uploaded to Cloudinary:', secureUrl);
        return secureUrl;
      }
    } else {
      console.log('[complaintService] Image remote upload fallback:', uploadRes.error || uploadRes.status);
    }
  } catch (err) {
    console.log('[complaintService] Image remote upload fallback to local URI:', err);
  }

  // Graceful fallback to local image uri
  return imageUri;
}

export async function logAnalysisRecord(data: AnalysisLogData): Promise<string> {
  try {
    const ref = await addDoc(collection(db, 'analysis_logs'), {
      ...data,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    console.log('[complaintService] Failed to log analysis record to Firestore:', error);
    return '';
  }
}

export interface SubmitComplaintResult {
  id: string;
  complaintId: string;
}

/**
 * Citizen raises a new complaint.
 * Automatically handles multi-department routing, notifications, and field inspector assignment queue.
 */
export async function submitComplaint(data: NewComplaintData): Promise<SubmitComplaintResult> {
  // Idempotency / duplicate submission protection:
  // 1. If clientSubmissionId provided, check for existing complaint
  if (data.clientSubmissionId) {
    try {
      const q = query(collection(db, 'complaints'), where('clientSubmissionId', '==', data.clientSubmissionId));
      const existingSnap = await getDocs(q);
      if (!existingSnap.empty) {
        const docSnap = existingSnap.docs[0];
        console.log(`[complaintService] Duplicate prevented via clientSubmissionId (${data.clientSubmissionId}). Reusing: ${docSnap.data().complaintId}`);
        return { id: docSnap.id, complaintId: docSnap.data().complaintId };
      }
    } catch (dedupErr) {
      console.warn('[complaintService] Dedup check note:', dedupErr);
    }
  }

  // 2. If complaintId already allocated, prevent duplicate creation
  if (data.complaintId) {
    try {
      const q = query(collection(db, 'complaints'), where('complaintId', '==', data.complaintId));
      const existingSnap = await getDocs(q);
      if (!existingSnap.empty) {
        const docSnap = existingSnap.docs[0];
        console.log(`[complaintService] Duplicate prevented via complaintId (${data.complaintId}). Reusing: ${docSnap.id}`);
        return { id: docSnap.id, complaintId: data.complaintId };
      }
    } catch (dedupErr) {
      console.warn('[complaintService] Dedup check note:', dedupErr);
    }
  }

  // Pre-persistence validation gate: Block invalid submissions before generating complaint ID or creating records
  const noIssueCheck = checkDescriptionHasNoIssue(data.description || '');
  if (noIssueCheck.isNoIssue) {
    throw new Error('Validation Failed: Your description does not report a civic problem. Please provide a description of the actual issue and upload a relevant image.');
  }

  if (data.predictionState === 'INVALID_IMAGE' || data.status === 'Dissimilar Image to the Issue') {
    throw new Error('Validation Failed: Invalid Issue Image. The uploaded image does not match the reported civic issue. Please upload a relevant image and try again.');
  }

  if ((data.predictionState === 'NO_MAJOR_ISSUE' || data.issueType === 'no_major_issue') && data.issueType !== 'Road Surface (Inspection Requested)') {
    throw new Error('Validation Failed: No Issue Found. The uploaded image does not show a clearly identifiable civic issue. Please upload an image showing the problem you want to report.');
  }

  const complaintId = data.complaintId || await generateMeaningfulComplaintId();
  const isDissimilar = (data.status as string) === 'Dissimilar Image to the Issue' || data.analysisStatus === 'dissimilar_image' || (data.roadValidationResult === 'not_road' && (data as any).rejectionType === 'IMAGE_MISMATCH') || (data.predictionState as string) === 'INVALID_IMAGE';
  const isCleanRoadRequested = data.issueType === 'Road Surface (Inspection Requested)' || data.displayIssueName === 'Road Surface (Inspection Requested)';
  const isNoMajorIssue = data.analysisStatus === 'no_major_issue' || data.issueType === 'no_major_issue' || data.predictionState === 'NO_MAJOR_ISSUE' || data.displayIssueName === 'Clean Road (No Major Issue)' || data.displayIssueName === 'No Major Issue';
  const activeDept = data.department || data.responsibleDepartment || 'Road Maintenance';
  const isRoad = isRoadDepartment({
    department: activeDept,
    departmentCode: data.departmentCode,
    routingStatus: data.routingStatus,
  });
  const isNonRoad = !isRoad;

  const deptCode = data.departmentCode || getDepartmentCode(activeDept);
  const routingStatus = data.routingStatus || (isNonRoad ? getRoutingStatus(activeDept) : 'Direct');
  const routingMessage = data.routingMessage || (isNonRoad ? getRoutingMessage(activeDept) : undefined);
  const initialStatus: ComplaintStatus = isDissimilar ? 'Dissimilar Image to the Issue' : (data.status || 'Submitted');

  console.log('[ROUTING] Department:', activeDept, 'Code:', deptCode, 'Status:', routingStatus, 'ComplaintStatus:', initialStatus);
  console.log('[FIRESTORE] Saving complaint:', complaintId);

  const initialHistoryItem = {
    id: `hist-${Date.now()}`,
    previousStatus: 'None',
    newStatus: initialStatus,
    updatedBy: data.citizenId,
    updatedByName: data.citizenEmail.split('@')[0] || 'Citizen',
    remarks: isDissimilar
      ? 'Complaint rejected by AI validation: Dissimilar Image to the Issue. The uploaded image does not match the reported civic issue.'
      : isNonRoad
      ? `Complaint raised by citizen. Routed to ${activeDept} Department.`
      : 'Complaint raised by citizen with AI analysis. Forwarded for Field Inspector on-site verification.',
    timestamp: new Date().toISOString(),
  };

  // Preserve the exact canonical display issue reviewed by citizen on Issue Summary
  const canonicalDisplayIssue = isDissimilar
    ? 'Invalid Issue Image'
    : isCleanRoadRequested
    ? 'Road Surface (Inspection Requested)'
    : (data.displayIssueName
      ? formatDisplayIssueName(data.displayIssueName)
      : (data.issueType
        ? formatDisplayIssueName(data.issueType)
        : (isNonRoad ? getDefaultIssueTypeForDepartment(deptCode) : 'Pothole')));

  const canonicalConfidence = isDissimilar
    ? (typeof data.confidence === 'number' && data.confidence > 0 ? (data.confidence <= 1 ? Math.round(data.confidence * 100) : Math.round(data.confidence)) : 0)
    : (typeof data.confidence === 'number'
      ? (data.confidence > 0 && data.confidence <= 1 ? Math.round(data.confidence * 100) : Math.round(data.confidence))
      : 0);

  const canonicalConfidenceRaw = typeof data.confidenceRaw === 'number'
    ? data.confidenceRaw
    : (data.predictionContract?.confidenceRaw ?? (canonicalConfidence > 0 ? canonicalConfidence / 100 : 0));

  const canonicalConfidenceType = data.confidenceType || data.predictionContract?.confidenceType || 'model_calibrated_probability';

  const canonicalPriority = (isDissimilar || isCleanRoadRequested || isNoMajorIssue || data.priority === 'NONE')
    ? 'NONE'
    : ((data.priority || data.severity || 'MEDIUM').toUpperCase());

  const canonicalPriorityReason = isDissimilar
    ? 'None: Invalid or unrelated image.'
    : (isCleanRoadRequested || isNoMajorIssue)
    ? 'Normal clean road surface verified. No major road defects detected.'
    : (data.priorityReason || data.predictionContract?.priorityReason || `${canonicalPriority} priority assessed for ${canonicalDisplayIssue}.`);

  const canonicalPredictionState: PredictionState = isDissimilar
    ? 'INVALID_IMAGE'
    : (isCleanRoadRequested || isNoMajorIssue)
    ? 'NO_MAJOR_ISSUE'
    : (data.predictionState || data.predictionContract?.predictionState || 'VALID_ISSUE');

  const canonicalPredictedClass = (isDissimilar || isCleanRoadRequested || isNoMajorIssue)
    ? null
    : (data.predictedClass ?? data.predictionContract?.predictedClass ?? canonicalDisplayIssue);

  const canonicalModelVersion = data.modelVersion || data.predictionContract?.modelVersion || 'CivicEye-Vision-Engine-v3';

  const complaintDocData: Record<string, any> = {
    complaintId,
    clientSubmissionId: data.clientSubmissionId || null,

    // Typed AI Prediction Contract Fields
    predictedClass: canonicalPredictedClass,
    displayIssueName: canonicalDisplayIssue,
    predictionState: canonicalPredictionState,
    priorityReason: canonicalPriorityReason,
    confidence: canonicalConfidence,
    confidenceRaw: canonicalConfidenceRaw,
    confidenceType: canonicalConfidenceType,
    validationStatus: data.predictionContract?.validationStatus ?? (isDissimilar ? 'unrelated_image' : isNoMajorIssue ? 'valid_clean_road' : 'valid_defect'),
    predictionStatus: data.predictionContract?.predictionStatus ?? (isDissimilar ? 'rejected' : 'success'),
    predictionError: data.predictionContract?.predictionError ?? null,
    boundingBoxes: data.predictionContract?.boundingBoxes ?? [],
    issueCategory: activeDept,

    // Feedback & Continuous Learning Candidate Provenance
    trainingCandidateStatus: 'unverified_candidate',
    modelVersion: canonicalModelVersion,
    originalPrediction: canonicalPredictedClass,
    originalScore: canonicalConfidence,
    imageValidationOutcome: data.predictionContract?.validationStatus || (isDissimilar ? 'unrelated_image' : isNoMajorIssue ? 'valid_clean_road' : 'valid_defect'),
    agreementStatus: data.predictionContract?.agreementStatus || 'AGREED',
    feedbackTimestamp: serverTimestamp(),

    citizenId: data.citizenId,
    email: data.citizenEmail,
    citizenEmail: data.citizenEmail,
    imageUri: data.imageUri,
    imageUrl: data.imageUri,
    description: data.description,
    lat: data.latitude,
    latitude: data.latitude,
    long: data.longitude,
    longitude: data.longitude,
    region: data.region || 'Gandhipuram',
    locationSource: data.locationSource ?? 'current',
    locationAddress: data.locationAddress ?? '',
    issueType: canonicalDisplayIssue,
    priority: canonicalPriority,
    severity: canonicalPriority,
    department: activeDept,
    responsibleDepartment: isNonRoad ? activeDept : (data.responsibleDepartment || activeDept),
    departmentCode: deptCode,
    departmentSource: data.departmentSource || (isNonRoad ? 'description' : 'ai'),
    routingStatus,
    ...(routingMessage ? { routingMessage } : {}),
    originalDepartment: data.originalDepartment || (isNonRoad ? activeDept : 'Road Maintenance'),
    ...(data.matchedKeyword ? { matchedKeyword: data.matchedKeyword } : {}),
    ...(data.departmentExplanation ? { departmentExplanation: data.departmentExplanation } : {}),
    roadValidationResult: data.roadValidationResult ?? (isDissimilar ? 'not_road' : (isNonRoad ? 'not_road' : 'road')),
    roadValidationConfidence: data.roadValidationConfidence ?? (isDissimilar ? 0 : 1.0),
    analysisStatus: data.analysisStatus ?? (isDissimilar ? 'dissimilar_image' : (isNonRoad ? 'not_road' : 'damage_detected')),
    AI_prediction: canonicalDisplayIssue,
    AI_confidence: canonicalConfidence,
    AI_validation: data.roadValidationResult || (isDissimilar ? 'not_road' : (isNonRoad ? 'not_road' : 'road')),
    AI_timestamp: serverTimestamp(),
    detectedIssue: canonicalDisplayIssue,
    detectionConfidence: canonicalConfidence,
    ...(data.suggestedRoadName ? { roadName: data.suggestedRoadName } : {}),
    ...(data.suggestedAuthority ? { maintenanceAuthority: data.suggestedAuthority } : {}),
    ...(typeof data.estimatedBudget === 'number' ? { estimatedBudget: data.estimatedBudget } : {}),
    ...(data.estimatedBudgetDesc ? { estimatedBudgetDesc: data.estimatedBudgetDesc } : {}),
    ...(data.budgetBreakdown ? { budgetBreakdown: data.budgetBreakdown } : {}),
    // Resolution duration calculation
    estimatedResolutionDays: (() => {
      if (isDissimilar) return 0;
      const dur = getEstimatedResolutionDuration(canonicalPriority, canonicalDisplayIssue, activeDept);
      return typeof data.estimatedResolutionDays === 'number' ? data.estimatedResolutionDays : dur.durationDays;
    })(),
    estimatedResolutionDuration: (() => {
      if (isDissimilar) return 'Inactive';
      const dur = getEstimatedResolutionDuration(canonicalPriority, canonicalDisplayIssue, activeDept);
      return data.estimatedResolutionDuration || dur.durationText;
    })(),
    expectedResolutionDate: (() => {
      if (isDissimilar) return null;
      const dur = getEstimatedResolutionDuration(canonicalPriority, canonicalDisplayIssue, activeDept);
      return data.expectedResolutionDate || dur.expectedResolutionDate;
    })(),
    assignedOfficer: isDissimilar ? null : (data.assignedOfficerName || data.assignedOfficer || data.officerName || null),
    assignedOfficerName: isDissimilar ? null : (data.assignedOfficerName || data.assignedOfficer || data.officerName || null),
    assignedOfficerId: isDissimilar ? null : (data.assignedOfficerId || null),
    officerName: isDissimilar ? null : (data.assignedOfficerName || data.assignedOfficer || data.officerName || null),
    fieldVerificationStatus: isDissimilar ? 'rejected' : ((data.fieldVerificationStatus || 'pending') as FieldVerificationStatus),
    status: initialStatus,
    inspectionStatus: (isDissimilar ? 'INVALID' : 'PENDING') as InspectionStatus,
    ...(isDissimilar ? {
      rejectionType: data.rejectionType || 'IMAGE_MISMATCH',
      rejectionReason: data.rejectionReason || 'Dissimilar Image to the Issue',
      rejectedAt: serverTimestamp(),
    } : {}),
    statusHistory: [initialHistoryItem],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, 'complaints'), complaintDocData);
  console.log('[FIRESTORE] Complaint saved with ID:', ref.id);

  // Send submission confirmation email to authenticated citizen account
  if (!isDissimilar && data.citizenEmail) {
    sendComplaintSubmissionEmail({
      complaintId,
      issueType: canonicalDisplayIssue,
      description: data.description,
      citizenEmail: data.citizenEmail,
      priority: canonicalPriority,
      department: activeDept,
      status: initialStatus,
    }).catch(err => {
      console.warn('[complaintService] Submission email dispatch error:', err);
    });
  }

  return { id: ref.id, complaintId };
}

/**
 * Unified Field Verification Workflow for Officers & Field Inspectors:
 * A. Confirm Existing Department:
 *    - Confirms that the issue belongs to the currently assigned department.
 *    - Marks complaint as verified (status: 'Verified', fieldVerificationStatus: 'department_confirmed').
 *    - Stores verification timestamp, officer/inspector name, remarks.
 * B. Another Department Involved:
 *    - Re-routes complaint to newly selected department.
 *    - Stores previous department, verified department, reason, updates routing status & message.
 *    - Updates estimated resolution duration for new department.
 */
export async function verifyComplaintWorkflow(
  complaintId: string,
  params: {
    action: 'confirm_existing' | 'transfer_department';
    inspectorId: string;
    inspectorName: string;
    remarks?: string;
    // When action === 'transfer_department'
    newDepartmentName?: string;
    newDepartmentCode?: string;
    // Optional additional details
    verifiedIssue?: string;
    severity?: 'LOW' | 'MEDIUM' | 'HIGH';
    resolutionDays?: number;
    estimatedBudget?: number;
    evidenceUrl?: string;
  }
): Promise<void> {
  try {
    const docRef = doc(db, 'complaints', complaintId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      throw new Error('Complaint not found');
    }
    const currentData = snap.data();
    if (isInvalidImageComplaint(currentData)) {
      throw new Error('Action blocked: Complaint was rejected due to Invalid Issue image, raise the complaint with the appropriate image! and cannot be modified.');
    }
    const existingHistory = Array.isArray(currentData.statusHistory) ? currentData.statusHistory : [];
    const currentDept = currentData.department || currentData.responsibleDepartment || 'Road Maintenance';

    if (params.action === 'confirm_existing') {
      const verifiedIssue = params.verifiedIssue || currentData.issueType || 'pothole';
      const severity = params.severity || currentData.priority || 'MEDIUM';
      const durationInfo = getEstimatedResolutionDuration(severity, verifiedIssue, currentDept);
      const resolutionDays = params.resolutionDays || durationInfo.durationDays;
      const durationText = `${resolutionDays} Days`;
      const expectedDate = calculateExpectedResolutionDate(new Date(), resolutionDays);

      const historyItem = {
        id: `hist-${Date.now()}`,
        previousStatus: currentData.status || 'Submitted',
        newStatus: 'Verified',
        updatedBy: params.inspectorId,
        updatedByName: params.inspectorName,
        remarks: `Field verification confirmed existing department (${currentDept}). ${params.remarks ? `Remarks: ${params.remarks}` : ''}`,
        timestamp: new Date().toISOString(),
      };

      const updatePayload: Record<string, any> = {
        status: 'Verified' as ComplaintStatus,
        inspectionStatus: 'VALID' as InspectionStatus,
        fieldVerificationStatus: 'department_confirmed' as FieldVerificationStatus,
        verifiedDepartment: currentDept,
        fieldVerificationRemarks: params.remarks?.trim() || 'Existing department confirmed by field verification.',
        fieldVerifiedAt: serverTimestamp(),
        fieldVerifiedBy: params.inspectorName,
        fieldVerifiedById: params.inspectorId,
        estimatedResolutionDays: resolutionDays,
        estimatedResolutionDuration: durationText,
        expectedResolutionDate: expectedDate,
        statusHistory: [...existingHistory, historyItem],
        updatedAt: serverTimestamp(),
      };

      if (params.evidenceUrl) {
        updatePayload.inspectionEvidenceUrl = params.evidenceUrl;
      }

      await updateDoc(docRef, updatePayload);

      // Notify citizen of verified status
      notifyCitizenStatusChange({
        complaintId: currentData.complaintId || complaintId,
        docId: complaintId,
        citizenId: currentData.citizenId,
        citizenEmail: currentData.citizenEmail,
        issueType: verifiedIssue,
        previousStatus: currentData.status || 'Submitted',
        newStatus: 'Verified',
        remarks: params.remarks || 'Existing department confirmed by field verification.',
        department: currentDept,
        updatedByName: params.inspectorName,
      });
    } else if (params.action === 'transfer_department') {
      const newDeptName = params.newDepartmentName || 'Solid Waste Management';
      const newDeptCode = params.newDepartmentCode || getDepartmentCode(newDeptName);
      const isNewRoad = newDeptCode === 'ROAD';
      const newIssueType = isNewRoad ? (params.verifiedIssue || currentData.issueType || 'pothole') : getDefaultIssueTypeForDepartment(newDeptCode);
      const severity = params.severity || currentData.priority || 'MEDIUM';
      const durationInfo = getEstimatedResolutionDuration(severity, newIssueType, newDeptName);

      const isSWM = newDeptCode === 'SWM';
      const routingStatus: RoutingStatus = isSWM ? 'Moved to Solid Waste Management' : `Moved to ${newDeptName}`;
      const routingMessage = getRoutingMessage(newDeptName);

      const historyItem = {
        id: `hist-${Date.now()}`,
        previousStatus: currentData.status || 'Submitted',
        newStatus: 'Under Review',
        updatedBy: params.inspectorId,
        updatedByName: params.inspectorName,
        remarks: `Field verification transferred complaint from ${currentDept} to ${newDeptName}. Reason: ${params.remarks || 'Another department involved.'}`,
        timestamp: new Date().toISOString(),
      };

      const updatePayload: Record<string, any> = {
        department: newDeptName,
        responsibleDepartment: newDeptName,
        departmentCode: newDeptCode,
        previousDepartment: currentDept,
        verifiedDepartment: newDeptName,
        departmentSource: 'field_inspector' as DepartmentSource,
        routingStatus,
        routingMessage,
        fieldVerificationStatus: 'transferred' as FieldVerificationStatus,
        fieldVerificationRemarks: params.remarks?.trim() || `Transferred to ${newDeptName} during field inspection.`,
        departmentRemarks: params.remarks?.trim(),
        fieldVerifiedAt: serverTimestamp(),
        fieldVerifiedBy: params.inspectorName,
        fieldVerifiedById: params.inspectorId,
        departmentChangedAt: serverTimestamp(),
        departmentChangedBy: params.inspectorId,
        departmentChangedByName: params.inspectorName,
        issueType: newIssueType,
        estimatedResolutionDays: durationInfo.durationDays,
        estimatedResolutionDuration: durationInfo.durationText,
        expectedResolutionDate: durationInfo.expectedResolutionDate,
        status: 'Under Review' as ComplaintStatus,
        statusHistory: [...existingHistory, historyItem],
        updatedAt: serverTimestamp(),
      };

      if (params.evidenceUrl) {
        updatePayload.inspectionEvidenceUrl = params.evidenceUrl;
      }

      await updateDoc(docRef, updatePayload);

      // Notify citizen of department transfer
      notifyCitizenStatusChange({
        complaintId: currentData.complaintId || complaintId,
        docId: complaintId,
        citizenId: currentData.citizenId,
        citizenEmail: currentData.citizenEmail,
        issueType: newIssueType,
        previousStatus: currentData.status || 'Submitted',
        newStatus: 'Under Review',
        remarks: `Transferred to ${newDeptName}. Reason: ${params.remarks || 'Another department involved.'}`,
        department: newDeptName,
        updatedByName: params.inspectorName,
      });
    }
  } catch (clientErr: any) {
    console.log('[complaintService] Direct Firestore verify workflow failed, using backend proxy /api/verify-workflow...', clientErr?.message || clientErr);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/verify-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complaintId, params }),
      });
      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Server returned HTTP ${response.status}: ${errText}`);
      }
    } catch (proxyErr) {
      console.error('[complaintService] Both direct Firestore and server proxy failed for verifyComplaintWorkflow:', proxyErr);
      throw clientErr || proxyErr;
    }
  }
}

/**
 * Field Inspector completes physical on-site verification:
 * - Confirms/corrects issue type
 * - Sets severity
 * - Sets resolution time estimation (1–7 days)
 * - Sets practical budget estimation (INR with itemized breakdown)
 * - Identifies road, region, and maintenance authority
 * - Notes any secondary department involvement (e.g. TWAD, TANGEDCO)
 */
export async function submitFieldVerification(
  complaintId: string,
  verification: {
    inspectorId: string;
    inspectorName: string;
    verifiedIssue: DetectedIssueType;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    estimatedResolutionDays: number;
    estimatedBudget: number;
    estimatedBudgetDesc?: string;
    budgetBreakdown?: PracticalBudgetDetails;
    roadId?: string;
    roadName: string;
    roadType: string;
    region: CoimbatoreRegion;
    maintenanceAuthority: string;
    departmentName: string;
    officerName?: string;
    officerContact?: string;
    isOtherDeptInvolved: boolean;
    involvedDepartments?: string[];
    otherDeptReason?: string;
    inspectorRemarks: string;
    evidenceUrl?: string;
  }
): Promise<void> {
  const docRef = doc(db, 'complaints', complaintId);
  const snap = await getDoc(docRef);
  if (snap.exists() && isInvalidImageComplaint(snap.data())) {
    throw new Error('Action blocked: Complaint was rejected due to Invalid Issue image, raise the complaint with the appropriate image! and cannot be verified.');
  }
  const existingHistory = snap.exists() && Array.isArray(snap.data().statusHistory)
    ? snap.data().statusHistory
    : [];

  const practicalBudget = verification.budgetBreakdown || calculatePracticalBudget(verification.verifiedIssue, verification.severity);
  const budgetNum = verification.estimatedBudget || practicalBudget.budget;
  const budgetDesc = verification.estimatedBudgetDesc || practicalBudget.description;

  const historyItem = {
    id: `hist-${Date.now()}`,
    previousStatus: snap.exists() ? snap.data().status : 'Submitted',
    newStatus: 'In Progress',
    updatedBy: verification.inspectorId,
    updatedByName: verification.inspectorName,
    remarks: `Field inspection approved: Verified as ${verification.verifiedIssue.toUpperCase()} (${verification.severity} Severity), Est. Resolution: ${verification.estimatedResolutionDays} days, Manual Budget: ₹${budgetNum.toLocaleString('en-IN')}. Routed to ${verification.maintenanceAuthority} for repair execution.${verification.isOtherDeptInvolved ? ` Secondary Involved: ${verification.involvedDepartments?.join(', ')}` : ''}`,
    timestamp: new Date().toISOString(),
  };

  const durationDays = verification.estimatedResolutionDays || 3;
  const durationText = `${durationDays} Days`;
  const expectedDate = calculateExpectedResolutionDate(new Date(), durationDays);

  try {
    await updateDoc(docRef, {
      status: 'In Progress' as ComplaintStatus,
      inspectionStatus: 'VALID' as InspectionStatus,
      inspectionResult: 'genuine',
      fieldVerificationStatus: 'department_confirmed' as FieldVerificationStatus,
      verifiedDepartment: verification.departmentName || 'Road Maintenance',
      fieldVerificationRemarks: verification.inspectorRemarks,
      fieldVerifiedAt: serverTimestamp(),
      fieldVerifiedBy: verification.inspectorName,
      fieldVerifiedById: verification.inspectorId,
      trainingCandidateStatus: 'inspector_verified',
      verifiedIssueCategory: verification.verifiedIssue,
      inspectorVerifiedAt: serverTimestamp(),
      estimatedResolutionDays: durationDays,
      estimatedResolutionDuration: durationText,
      expectedResolutionDate: expectedDate,
      severity: verification.severity,
      priority: verification.severity,
      estimatedBudget: budgetNum,
      estimatedBudgetDesc: budgetDesc,
      budgetBreakdown: practicalBudget,
      roadId: verification.roadId || null,
      roadName: verification.roadName,
      roadType: verification.roadType,
      region: verification.region,
      maintenanceAuthority: verification.maintenanceAuthority,
      assignedAuthority: verification.maintenanceAuthority,
      responsibleDepartment: verification.departmentName,
      isOtherDeptInvolved: verification.isOtherDeptInvolved,
      involvedDepartments: verification.involvedDepartments || [],
      otherDeptReason: verification.otherDeptReason || null,
      ...(verification.evidenceUrl ? { inspectionEvidenceUrl: verification.evidenceUrl } : {}),
      inspectionDetails: {
        isIssuePresent: true,
        verifiedIssue: verification.verifiedIssue,
        severity: verification.severity,
        estimatedResolutionDays: verification.estimatedResolutionDays,
        estimatedBudget: budgetNum,
        estimatedBudgetDesc: budgetDesc,
        budgetBreakdown: practicalBudget,
        roadId: verification.roadId || null,
        roadName: verification.roadName,
        roadType: verification.roadType,
        region: verification.region,
        maintenanceAuthority: verification.maintenanceAuthority,
        departmentName: verification.departmentName,
        officerName: verification.officerName || null,
        officerContact: verification.officerContact || null,
        isOtherDeptInvolved: verification.isOtherDeptInvolved,
        involvedDepartments: verification.involvedDepartments || [],
        otherDeptReason: verification.otherDeptReason || null,
        inspectorRemarks: verification.inspectorRemarks,
        inspectedAt: serverTimestamp(),
        inspectedBy: verification.inspectorId,
        inspectedByName: verification.inspectorName,
      },
      statusHistory: [...existingHistory, historyItem],
      updatedAt: serverTimestamp(),
    });

    notifyCitizenStatusChange({
      complaintId: snap.exists() ? snap.data().complaintId : complaintId,
      docId: complaintId,
      citizenId: snap.exists() ? snap.data().citizenId : undefined,
      citizenEmail: snap.exists() ? snap.data().citizenEmail : undefined,
      issueType: verification.verifiedIssue,
      previousStatus: snap.exists() ? snap.data().status : 'Submitted',
      newStatus: 'In Progress',
      remarks: verification.inspectorRemarks || 'Field inspection approved; maintenance work in progress.',
      department: verification.departmentName,
      updatedByName: verification.inspectorName,
    });
  } catch (clientErr: any) {
    console.log('[complaintService] Syncing verification update via backend verification service...');
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/verify-complaint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaintId,
          verification: {
            ...verification,
            estimatedBudget: budgetNum,
            estimatedBudgetDesc: budgetDesc,
            budgetBreakdown: practicalBudget,
          },
        }),
      });
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
    } catch (fallbackErr) {
      console.error('[complaintService] Both direct Firestore and backend verification failed:', fallbackErr);
      throw clientErr;
    }
  }
}

/**
 * Field Inspector rejects fake or non-existent road complaint
 */
export async function rejectComplaintByInspector(
  complaintId: string,
  inspectorId: string,
  inspectorName: string,
  rejectionReason: string,
  inspectorRemarks?: string,
  evidenceUrl?: string
): Promise<void> {
  const docRef = doc(db, 'complaints', complaintId);
  const snap = await getDoc(docRef);
  const existingHistory = snap.exists() && Array.isArray(snap.data().statusHistory)
    ? snap.data().statusHistory
    : [];

  const historyItem = {
    id: `hist-${Date.now()}`,
    previousStatus: snap.exists() ? snap.data().status : 'Pending Field Verification',
    newStatus: 'Rejected',
    updatedBy: inspectorId,
    updatedByName: inspectorName,
    remarks: `Complaint rejected during field inspection: ${rejectionReason}. ${inspectorRemarks || ''}`,
    timestamp: new Date().toISOString(),
  };

  try {
    await updateDoc(docRef, {
      status: 'Rejected' as ComplaintStatus,
      inspectionStatus: 'INVALID' as InspectionStatus,
      inspectionResult: 'fake',
      rejectionType: 'FIELD_INSPECTION_REJECTED',
      rejectionReason,
      inspectorRemarks: inspectorRemarks || '',
      ...(evidenceUrl ? { inspectionEvidenceUrl: evidenceUrl } : {}),
      inspectedBy: inspectorId,
      inspectedByName: inspectorName,
      inspectedAt: serverTimestamp(),
      rejectedAt: serverTimestamp(),
      trainingCandidateStatus: 'rejected_candidate',
      inspectorVerifiedAt: serverTimestamp(),
      statusHistory: [...existingHistory, historyItem],
      updatedAt: serverTimestamp(),
    });

    notifyCitizenStatusChange({
      complaintId: snap.exists() ? snap.data().complaintId : complaintId,
      docId: complaintId,
      citizenId: snap.exists() ? snap.data().citizenId : undefined,
      citizenEmail: snap.exists() ? snap.data().citizenEmail : undefined,
      issueType: snap.exists() ? snap.data().issueType : 'Civic Issue',
      previousStatus: snap.exists() ? snap.data().status : 'Pending Field Verification',
      newStatus: 'Rejected',
      remarks: rejectionReason,
      department: snap.exists() ? snap.data().department : 'Road Maintenance',
      updatedByName: inspectorName,
    });
  } catch (clientErr: any) {
    console.log('[complaintService] Syncing rejection update via backend service...');
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/reject-complaint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaintId,
          inspectorId,
          inspectorName,
          rejectionReason,
          inspectorRemarks,
          evidenceUrl,
        }),
      });
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
    } catch (fallbackErr) {
      console.error('[complaintService] Both direct Firestore and backend rejection failed:', fallbackErr);
      throw clientErr;
    }
  }
}

// Alias for inspector rejection
export const rejectComplaint = rejectComplaintByInspector;

/**
 * Mark complaint as valid after field inspection
 */
export async function markComplaintAsValid(
  complaintId: string,
  inspectorId: string,
  inspectorName: string,
  inspectorRemarks: string,
  evidenceUrl?: string
): Promise<void> {
  const docRef = doc(db, 'complaints', complaintId);
  const snap = await getDoc(docRef);
  if (snap.exists() && isInvalidImageComplaint(snap.data())) {
    throw new Error('Action blocked: Complaint was rejected due to Invalid Issue image, raise the complaint with the appropriate image! and cannot be verified.');
  }
  const existingHistory = snap.exists() && Array.isArray(snap.data().statusHistory)
    ? snap.data().statusHistory
    : [];

  const historyItem = {
    id: `hist-${Date.now()}`,
    previousStatus: snap.exists() ? snap.data().status : 'Pending Field Verification',
    newStatus: 'Verified',
    updatedBy: inspectorId,
    updatedByName: inspectorName,
    remarks: `Field inspection confirmed valid: ${inspectorRemarks}`,
    timestamp: new Date().toISOString(),
  };

  try {
    await updateDoc(docRef, {
      status: 'Verified' as ComplaintStatus,
      inspectionStatus: 'VALID' as InspectionStatus,
      inspectionResult: 'genuine',
      inspectedBy: inspectorId,
      inspectedByName: inspectorName,
      inspectorRemarks,
      ...(evidenceUrl ? { inspectionEvidenceUrl: evidenceUrl } : {}),
      inspectedAt: serverTimestamp(),
      statusHistory: [...existingHistory, historyItem],
      updatedAt: serverTimestamp(),
    });

    notifyCitizenStatusChange({
      complaintId: snap.exists() ? snap.data().complaintId : complaintId,
      docId: complaintId,
      citizenId: snap.exists() ? snap.data().citizenId : undefined,
      citizenEmail: snap.exists() ? snap.data().citizenEmail : undefined,
      issueType: snap.exists() ? snap.data().issueType : 'Civic Issue',
      previousStatus: snap.exists() ? snap.data().status : 'Pending Field Verification',
      newStatus: 'Verified',
      remarks: inspectorRemarks,
      department: snap.exists() ? snap.data().department : 'Road Maintenance',
      updatedByName: inspectorName,
    });
  } catch (clientErr: any) {
    console.log('[complaintService] Syncing mark valid via backend service...');
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/verify-complaint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaintId,
          verification: {
            inspectorId,
            inspectorName,
            verifiedIssue: snap.exists() ? (snap.data().issueType || 'pothole') : 'pothole',
            severity: snap.exists() ? (snap.data().priority || 'MEDIUM') : 'MEDIUM',
            estimatedResolutionDays: 3,
            estimatedBudget: snap.exists() ? (snap.data().estimatedBudget || 25000) : 25000,
            roadName: snap.exists() ? (snap.data().roadName || 'Coimbatore Road') : 'Coimbatore Road',
            region: snap.exists() ? (snap.data().region || 'Gandhipuram') : 'Gandhipuram',
            maintenanceAuthority: snap.exists() ? (snap.data().maintenanceAuthority || 'CCMC') : 'CCMC',
            departmentName: snap.exists() ? (snap.data().department || 'Road Maintenance') : 'Road Maintenance',
            isOtherDeptInvolved: false,
            inspectorRemarks,
            evidenceUrl,
          },
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (fallbackErr) {
      console.error('[complaintService] Both direct and backend mark valid failed:', fallbackErr);
      throw clientErr;
    }
  }
}

/**
 * Field Inspector requests clarification from the citizen.
 * Records the clarification question and moves status to 'Needs Clarification'.
 */
export async function requestClarificationByInspector(
  complaintId: string,
  inspectorId: string,
  inspectorName: string,
  clarificationQuestion: string,
  inspectorRemarks?: string
): Promise<void> {
  if (!clarificationQuestion || !clarificationQuestion.trim()) {
    throw new Error('A specific clarification question is required.');
  }
  const docRef = doc(db, 'complaints', complaintId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error('Complaint not found.');
  }
  const currentData = snap.data();
  if (isInvalidImageComplaint(currentData)) {
    throw new Error('Action blocked: Complaint was rejected due to Invalid Issue image, raise the complaint with the appropriate image!');
  }
  const existingHistory = Array.isArray(currentData.statusHistory) ? currentData.statusHistory : [];

  const historyItem = {
    id: `hist-${Date.now()}`,
    previousStatus: currentData.status || 'Pending Field Verification',
    newStatus: 'Needs Clarification',
    updatedBy: inspectorId,
    updatedByName: inspectorName,
    remarks: `Field Inspector requested clarification: "${clarificationQuestion.trim()}". ${inspectorRemarks?.trim() ? `Note: ${inspectorRemarks.trim()}` : ''}`,
    timestamp: new Date().toISOString(),
  };

  try {
    await updateDoc(docRef, {
      status: 'Needs Clarification' as ComplaintStatus,
      clarificationRequest: clarificationQuestion.trim(),
      clarificationRequestedAt: serverTimestamp(),
      clarificationRequestedBy: inspectorName,
      clarificationRequestedById: inspectorId,
      inspectorRemarks: inspectorRemarks?.trim() || currentData.inspectorRemarks || '',
      statusHistory: [...existingHistory, historyItem],
      updatedAt: serverTimestamp(),
    });

    // Notify citizen in-app
    if (currentData.citizenId) {
      try {
        await createNotification({
          userId: currentData.citizenId,
          recipientRole: 'citizen',
          complaintId,
          title: 'Clarification Needed for Your Complaint',
          message: `Field Inspector ${inspectorName} requested clarification on #${currentData.complaintId || complaintId}: "${clarificationQuestion.trim()}". Please open CivicEye to provide details.`,
          type: 'clarification_requested',
        });
      } catch (notifErr) {
        console.warn('[complaintService] Clarification notification error (handled safely):', notifErr);
      }
    }

    // Notify citizen via email
    if (currentData.citizenEmail) {
      sendClarificationEmail({
        complaintId: currentData.complaintId || complaintId,
        issueType: currentData.issueType || 'Civic Infrastructure Defect',
        citizenEmail: currentData.citizenEmail,
        inspectorName,
        clarificationQuestion: clarificationQuestion.trim(),
        department: currentData.department || currentData.responsibleDepartment || 'Road Maintenance',
      }).catch(err => {
        console.warn('[complaintService] Clarification email dispatch warning:', err);
      });
    }
  } catch (clientErr: any) {
    console.log('[complaintService] Syncing clarification request via backend service...');
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/request-clarification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaintId,
          inspectorId,
          inspectorName,
          clarificationQuestion: clarificationQuestion.trim(),
          inspectorRemarks: inspectorRemarks?.trim() || '',
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (fallbackErr) {
      console.error('[complaintService] Both direct and backend request clarification failed:', fallbackErr);
      throw clientErr;
    }
  }
}

/**
 * Citizen responds to Field Inspector's clarification request.
 * Sets status back to 'Pending Field Verification' so inspection can resume.
 */
export async function respondToClarificationByCitizen(
  complaintId: string,
  citizenId: string,
  responseText: string
): Promise<void> {
  if (!responseText || !responseText.trim()) {
    throw new Error('Clarification response cannot be empty.');
  }
  const docRef = doc(db, 'complaints', complaintId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error('Complaint not found.');
  }
  const currentData = snap.data();
  if (currentData.citizenId && currentData.citizenId !== citizenId) {
    throw new Error('Only the citizen who submitted this complaint can submit a clarification response.');
  }
  const existingHistory = Array.isArray(currentData.statusHistory) ? currentData.statusHistory : [];

  const historyItem = {
    id: `hist-${Date.now()}`,
    previousStatus: 'Needs Clarification',
    newStatus: 'Pending Field Verification',
    updatedBy: citizenId,
    updatedByName: currentData.citizenEmail?.split('@')[0] || 'Citizen',
    remarks: `Citizen provided clarification: "${responseText.trim()}"`,
    timestamp: new Date().toISOString(),
  };

  try {
    await updateDoc(docRef, {
      status: 'Pending Field Verification' as ComplaintStatus,
      citizenClarificationResponse: responseText.trim(),
      citizenClarificationRespondedAt: serverTimestamp(),
      statusHistory: [...existingHistory, historyItem],
      updatedAt: serverTimestamp(),
    });

    // Notify Field Inspector / Officer in-app
    try {
      await createNotification({
        recipientRole: 'authority',
        complaintId,
        title: 'Citizen Clarification Submitted',
        message: `Clarification provided by citizen for #${currentData.complaintId || complaintId}: "${responseText.trim()}"`,
        type: 'citizen_feedback',
      });
    } catch (notifErr) {
      console.warn('[complaintService] Citizen response notification error (handled safely):', notifErr);
    }

    // Notify citizen via email
    if (currentData.citizenEmail) {
      sendStatusUpdateEmail({
        complaintId: currentData.complaintId || complaintId,
        issueType: currentData.issueType || 'Civic Infrastructure Defect',
        citizenEmail: currentData.citizenEmail,
        previousStatus: 'Needs Clarification',
        newStatus: 'Pending Field Verification',
        statusRemarks: `Your clarification response was received: "${responseText.trim()}". Field Inspector will re-evaluate on-site.`,
        department: currentData.department || currentData.responsibleDepartment || 'Road Maintenance',
        updatedByName: 'CivicEye System',
      }).catch(err => {
        console.warn('[complaintService] Clarification response acknowledgement email warning:', err);
      });
    }
  } catch (clientErr: any) {
    console.log('[complaintService] Syncing citizen clarification response via backend service...');
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/respond-clarification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaintId,
          citizenId,
          responseText: responseText.trim(),
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (fallbackErr) {
      console.error('[complaintService] Both direct and backend respond clarification failed:', fallbackErr);
      throw clientErr;
    }
  }
}

/**
 * Field Inspector officially closes a complaint that requires no serious repair,
 * has minor defect handled, or is resolved on inspection without repair assignment.
 */
export async function closeComplaintByInspector(
  complaintId: string,
  inspectorId: string,
  inspectorName: string,
  closureReason: string,
  closureOutcome: string = 'No Major Repair Required',
  inspectorRemarks?: string
): Promise<void> {
  if (!closureReason || !closureReason.trim()) {
    throw new Error('A clear closure reason is required to close a complaint.');
  }
  const docRef = doc(db, 'complaints', complaintId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error('Complaint not found.');
  }
  const currentData = snap.data();
  if (currentData.status === 'Closed') {
    throw new Error('Complaint is already closed.');
  }
  if (isInvalidImageComplaint(currentData)) {
    throw new Error('Action blocked: Complaint was rejected due to Invalid Issue image, raise the complaint with the appropriate image!');
  }
  const existingHistory = Array.isArray(currentData.statusHistory) ? currentData.statusHistory : [];

  const historyItem = {
    id: `hist-${Date.now()}`,
    previousStatus: currentData.status || 'Pending Field Verification',
    newStatus: 'Closed',
    updatedBy: inspectorId,
    updatedByName: inspectorName,
    remarks: `Closed by Field Inspector: [${closureOutcome}] ${closureReason.trim()}.${inspectorRemarks?.trim() ? ` Observations: ${inspectorRemarks.trim()}` : ''}`,
    timestamp: new Date().toISOString(),
  };

  try {
    await updateDoc(docRef, {
      status: 'Closed' as ComplaintStatus,
      inspectionStatus: 'VALID' as InspectionStatus,
      inspectionResult: 'genuine',
      closureReason: closureReason.trim(),
      closureOutcome,
      closedAt: serverTimestamp(),
      closedBy: inspectorName,
      closedById: inspectorId,
      closedByRole: 'field_inspector',
      inspectedAt: serverTimestamp(),
      inspectedBy: inspectorId,
      inspectedByName: inspectorName,
      inspectorRemarks: inspectorRemarks?.trim() || closureReason.trim(),
      statusHistory: [...existingHistory, historyItem],
      updatedAt: serverTimestamp(),
    });

    // In-app notification to citizen
    if (currentData.citizenId) {
      try {
        await createNotification({
          userId: currentData.citizenId,
          recipientRole: 'citizen',
          complaintId,
          title: `Complaint Closed: ${closureOutcome}`,
          message: `Your complaint #${currentData.complaintId || complaintId} was inspected by Field Inspector ${inspectorName} and closed: "${closureReason.trim()}".`,
          type: 'work_resolved',
        });
      } catch (notifErr) {
        console.warn('[complaintService] Closure notification error (handled safely):', notifErr);
      }
    }

    // Email notification to citizen
    if (currentData.citizenEmail) {
      sendClosureEmail({
        complaintId: currentData.complaintId || complaintId,
        issueType: currentData.issueType || 'Civic Infrastructure Defect',
        citizenEmail: currentData.citizenEmail,
        inspectorName,
        closureReason: closureReason.trim(),
        closureOutcome,
        inspectorRemarks: inspectorRemarks?.trim() || '',
        department: currentData.department || currentData.responsibleDepartment || 'Road Maintenance',
      }).catch(err => {
        console.warn('[complaintService] Closure email dispatch warning:', err);
      });
    }
  } catch (clientErr: any) {
    console.log('[complaintService] Syncing inspector closure via backend service...');
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/close-complaint-inspector`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          complaintId,
          inspectorId,
          inspectorName,
          closureReason: closureReason.trim(),
          closureOutcome,
          inspectorRemarks: inspectorRemarks?.trim() || '',
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (fallbackErr) {
      console.error('[complaintService] Both direct and backend closure failed:', fallbackErr);
      throw clientErr;
    }
  }
}

/**
 * Admin officially routes/assigns the verified complaint to the responsible maintenance authority.
 */
export async function assignToAuthority(
  complaintId: string,
  assignment: {
    assignedAuthority: string;
    assignedOfficer?: string;
    adminId: string;
    adminName: string;
    adminRemarks?: string;
  }
): Promise<void> {
  const docRef = doc(db, 'complaints', complaintId);
  const snap = await getDoc(docRef);
  if (snap.exists() && isInvalidImageComplaint(snap.data())) {
    throw new Error('Action blocked: Complaint was rejected due to Invalid Issue image, raise the complaint with the appropriate image! and cannot be assigned.');
  }
  const existingHistory = snap.exists() && Array.isArray(snap.data().statusHistory)
    ? snap.data().statusHistory
    : [];

  const historyItem = {
    id: `hist-${Date.now()}`,
    previousStatus: snap.exists() ? snap.data().status : 'Verified',
    newStatus: 'Assigned',
    updatedBy: assignment.adminId,
    updatedByName: assignment.adminName,
    remarks: `Admin routed complaint to ${assignment.assignedAuthority}.${assignment.adminRemarks ? ` Note: ${assignment.adminRemarks}` : ''}`,
    timestamp: new Date().toISOString(),
  };

  await updateDoc(docRef, {
    status: 'Assigned' as ComplaintStatus,
    assignedAuthority: assignment.assignedAuthority,
    assignedOfficer: assignment.assignedOfficer || null,
    assignedAt: serverTimestamp(),
    assignedBy: assignment.adminId,
    assignedByName: assignment.adminName,
    officerRemarks: assignment.adminRemarks || '',
    statusHistory: [...existingHistory, historyItem],
    updatedAt: serverTimestamp(),
  });

  notifyCitizenStatusChange({
    complaintId: snap.exists() ? snap.data().complaintId : complaintId,
    docId: complaintId,
    citizenId: snap.exists() ? snap.data().citizenId : undefined,
    citizenEmail: snap.exists() ? snap.data().citizenEmail : undefined,
    issueType: snap.exists() ? snap.data().issueType : 'Civic Issue',
    previousStatus: snap.exists() ? snap.data().status : 'Verified',
    newStatus: 'Assigned',
    remarks: assignment.adminRemarks || `Assigned to ${assignment.assignedAuthority}`,
    department: assignment.assignedAuthority,
    updatedByName: assignment.adminName,
  });
}

/**
 * Assign inspector to a complaint (Admin / Main Officer action)
 */
export async function assignComplaint(
  complaintId: string,
  inspectorId: string,
  inspectorName: string,
  mainOfficerId: string,
  mainOfficerName?: string
): Promise<void> {
  console.log('[complaintService] ASSIGNING INSPECTOR UID:', inspectorId, 'COMPLAINT ID:', complaintId);

  const docRef = doc(db, 'complaints', complaintId);
  const snap = await getDoc(docRef);
  if (snap.exists() && isInvalidImageComplaint(snap.data())) {
    throw new Error('Action blocked: Complaint was rejected due to Invalid Issue image, raise the complaint with the appropriate image! and cannot be assigned.');
  }
  const existingHistory = snap.exists() && Array.isArray(snap.data().statusHistory)
    ? snap.data().statusHistory
    : [];

  const historyItem = {
    id: `hist-${Date.now()}`,
    previousStatus: snap.exists() ? snap.data().status : 'Submitted',
    newStatus: 'Pending Field Verification',
    updatedBy: mainOfficerId,
    updatedByName: mainOfficerName || 'Main Officer',
    remarks: `Assigned Field Inspector ${inspectorName} for on-site physical verification.`,
    timestamp: new Date().toISOString(),
  };

  await updateDoc(docRef, {
    assignedInspectorId: inspectorId,
    assignedInspectorName: inspectorName,
    assignedAt: serverTimestamp(),
    assignedBy: mainOfficerId,
    assignedByName: mainOfficerName || 'Main Officer',
    inspectionStatus: 'PENDING' as InspectionStatus,
    status: 'Pending Field Verification' as ComplaintStatus,
    statusHistory: [...existingHistory, historyItem],
    updatedAt: serverTimestamp(),
  });
}

/**
 * Responsible Maintenance Authority updates execution status (Accepted / In Progress).
 */
export async function updateAuthorityProgress(
  complaintId: string,
  newStatus: 'Accepted' | 'In Progress',
  officerId: string,
  officerName: string,
  progressRemarks?: string
): Promise<void> {
  const docRef = doc(db, 'complaints', complaintId);
  const snap = await getDoc(docRef);
  if (snap.exists() && isInvalidImageComplaint(snap.data())) {
    throw new Error('Action blocked: Cannot update progress for a rejected complaint.');
  }
  const existingHistory = snap.exists() && Array.isArray(snap.data().statusHistory)
    ? snap.data().statusHistory
    : [];

  const historyItem = {
    id: `hist-${Date.now()}`,
    previousStatus: snap.exists() ? snap.data().status : 'Assigned',
    newStatus,
    updatedBy: officerId,
    updatedByName: officerName,
    remarks: progressRemarks || `Authority marked work status as ${newStatus}.`,
    timestamp: new Date().toISOString(),
  };

  const updatePayload: Record<string, any> = {
    status: newStatus as ComplaintStatus,
    officerRemarks: progressRemarks || '',
    statusHistory: [...existingHistory, historyItem],
    updatedAt: serverTimestamp(),
  };

  if (newStatus === 'Accepted') {
    updatePayload.authorityAcceptedAt = serverTimestamp();
  } else if (newStatus === 'In Progress') {
    updatePayload.workStartedAt = serverTimestamp();
  }

  await updateDoc(docRef, updatePayload);

  notifyCitizenStatusChange({
    complaintId: snap.exists() ? snap.data().complaintId : complaintId,
    docId: complaintId,
    citizenId: snap.exists() ? snap.data().citizenId : undefined,
    citizenEmail: snap.exists() ? snap.data().citizenEmail : undefined,
    issueType: snap.exists() ? snap.data().issueType : 'Civic Issue',
    previousStatus: snap.exists() ? snap.data().status : 'Assigned',
    newStatus,
    remarks: progressRemarks,
    department: snap.exists() ? snap.data().department : 'Road Maintenance',
    updatedByName: officerName,
  });
}

/**
 * Move complaint to 'In Progress' (maintenance stage)
 */
export async function markAsInProgress(
  complaintId: string,
  mainOfficerId: string,
  mainOfficerName?: string,
  remarks?: string
): Promise<void> {
  const docRef = doc(db, 'complaints', complaintId);
  const snap = await getDoc(docRef);
  if (snap.exists() && isInvalidImageComplaint(snap.data())) {
    throw new Error('Action blocked: Cannot mark in progress for a rejected complaint.');
  }
  const existingHistory = snap.exists() && Array.isArray(snap.data().statusHistory)
    ? snap.data().statusHistory
    : [];

  const historyItem = {
    id: `hist-${Date.now()}`,
    previousStatus: snap.exists() ? snap.data().status : 'Verified',
    newStatus: 'In Progress',
    updatedBy: mainOfficerId,
    updatedByName: mainOfficerName || 'Main Officer',
    remarks: remarks || 'Moved to In Progress for road maintenance execution.',
    timestamp: new Date().toISOString(),
  };

  await updateDoc(docRef, {
    status: 'In Progress' as ComplaintStatus,
    inProgressByName: mainOfficerName || 'Main Officer',
    officerRemarks: remarks || '',
    statusHistory: [...existingHistory, historyItem],
    updatedAt: serverTimestamp(),
  });
}

/**
 * Authority marks road repair work as Resolved.
 * Transitions complaint to 'Resolved' / 'Citizen Verification' state.
 */
export async function markComplaintResolved(
  complaintId: string,
  resolution: {
    resolvedBy: string;
    resolvedByName: string;
    contractorName?: string;
    resolutionRemarks: string;
    afterRepairImageUri?: string;
  }
): Promise<void> {
  const docRef = doc(db, 'complaints', complaintId);
  const snap = await getDoc(docRef);
  if (snap.exists() && isInvalidImageComplaint(snap.data())) {
    throw new Error('Action blocked: Cannot mark resolved for a rejected complaint.');
  }
  const existingHistory = snap.exists() && Array.isArray(snap.data().statusHistory)
    ? snap.data().statusHistory
    : [];

  const historyItem = {
    id: `hist-${Date.now()}`,
    previousStatus: snap.exists() ? snap.data().status : 'In Progress',
    newStatus: 'Resolved',
    updatedBy: resolution.resolvedBy,
    updatedByName: resolution.resolvedByName,
    remarks: `Road repair work marked as RESOLVED by authority: ${resolution.resolutionRemarks}.`,
    timestamp: new Date().toISOString(),
  };

  await updateDoc(docRef, {
    status: 'Resolved' as ComplaintStatus,
    resolvedAt: serverTimestamp(),
    resolvedBy: resolution.resolvedBy,
    resolvedByName: resolution.resolvedByName,
    resolutionRemarks: resolution.resolutionRemarks,
    resolutionDetails: {
      resolvedAt: serverTimestamp(),
      resolvedBy: resolution.resolvedBy,
      resolvedByName: resolution.resolvedByName,
      contractorName: resolution.contractorName || 'Coimbatore Highway & Corporation Rapid Response',
      resolutionRemarks: resolution.resolutionRemarks,
      afterRepairImageUri: resolution.afterRepairImageUri || '',
    },
    statusHistory: [...existingHistory, historyItem],
    updatedAt: serverTimestamp(),
  });

  notifyCitizenStatusChange({
    complaintId: snap.exists() ? snap.data().complaintId : complaintId,
    docId: complaintId,
    citizenId: snap.exists() ? snap.data().citizenId : undefined,
    citizenEmail: snap.exists() ? snap.data().citizenEmail : undefined,
    issueType: snap.exists() ? snap.data().issueType : 'Civic Issue',
    previousStatus: snap.exists() ? snap.data().status : 'In Progress',
    newStatus: 'Resolved',
    remarks: resolution.resolutionRemarks,
    department: snap.exists() ? snap.data().department : 'Road Maintenance',
    updatedByName: resolution.resolvedByName,
  });
}

export async function markAsResolved(
  complaintId: string,
  mainOfficerId: string,
  mainOfficerName?: string,
  remarks?: string
): Promise<void> {
  return markComplaintResolved(complaintId, {
    resolvedBy: mainOfficerId,
    resolvedByName: mainOfficerName || 'Main Officer',
    resolutionRemarks: remarks || 'Resolved by Main Officer',
  });
}

/**
 * Citizen verifies the resolution:
 * - If satisfied -> Closed
 * - If not resolved -> Reopened / Review
 */
export async function submitCitizenVerification(
  complaintId: string,
  citizenId: string,
  citizenEmail: string,
  confirmedResolved: boolean,
  feedbackRemarks?: string
): Promise<void> {
  const docRef = doc(db, 'complaints', complaintId);
  const snap = await getDoc(docRef);
  const existingHistory = snap.exists() && Array.isArray(snap.data().statusHistory)
    ? snap.data().statusHistory
    : [];

  const targetStatus: ComplaintStatus = confirmedResolved ? 'Closed' : 'Reopened';
  const historyItem = {
    id: `hist-${Date.now()}`,
    previousStatus: 'Resolved',
    newStatus: targetStatus,
    updatedBy: citizenId,
    updatedByName: citizenEmail.split('@')[0] || 'Citizen',
    remarks: confirmedResolved
      ? `Citizen verified and confirmed resolution. Issue officially closed.${feedbackRemarks ? ` Feedback: ${feedbackRemarks}` : ''}`
      : `Citizen reported issue is NOT resolved. Reopened for administrative review.${feedbackRemarks ? ` Reason: ${feedbackRemarks}` : ''}`,
    timestamp: new Date().toISOString(),
  };

  await updateDoc(docRef, {
    status: targetStatus,
    citizenVerification: {
      verifiedByCitizen: true,
      isResolvedSatisfied: confirmedResolved,
      citizenFeedback: feedbackRemarks || '',
      verifiedAt: serverTimestamp(),
    },
    statusHistory: [...existingHistory, historyItem],
    updatedAt: serverTimestamp(),
  });

  notifyCitizenStatusChange({
    complaintId: snap.exists() ? snap.data().complaintId : complaintId,
    docId: complaintId,
    citizenId,
    citizenEmail,
    issueType: snap.exists() ? snap.data().issueType : 'Civic Issue',
    previousStatus: 'Resolved',
    newStatus: targetStatus,
    remarks: feedbackRemarks || (confirmedResolved ? 'Citizen verified and closed' : 'Citizen reported not resolved'),
    department: snap.exists() ? snap.data().department : 'Road Maintenance',
    updatedByName: citizenEmail.split('@')[0] || 'Citizen',
  });
}

export function subscribeToUserComplaints(
  citizenId: string,
  onData: (complaints: Complaint[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, 'complaints'),
    where('citizenId', '==', citizenId)
  );

  return onSnapshot(
    q,
    snapshot => {
      const complaints: Complaint[] = snapshot.docs
        .map(d => parseComplaintDoc(d))
        .filter(c => !isInvalidImageComplaint(c) && !c.isDeleted)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      onData(complaints);
    },
    err => onError(err as Error)
  );
}

export function subscribeToAssignedComplaints(
  inspectorId: string,
  onData: (complaints: Complaint[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = collection(db, 'complaints');

  return onSnapshot(
    q,
    snapshot => {
      const complaints: Complaint[] = snapshot.docs
        .map(d => parseComplaintDoc(d))
        .filter(c => {
          // Exclude deleted or rejected image mismatch complaints from active inspector queues
          if (c.isDeleted || isInvalidImageComplaint(c)) {
            return false;
          }

          // Road maintenance complaints only
          const isRoad = isRoadDepartment(c.department || c.responsibleDepartment || 'Road Maintenance');
          if (!isRoad) return false;

          // Explicitly assigned to this inspector
          if (c.assignedInspectorId === inspectorId) return true;
          // Inspected by this inspector
          if (c.inspectedBy === inspectorId || c.inspectionDetails?.inspectedBy === inspectorId) return true;
          // Unassigned and pending field inspection / verification
          if (!c.assignedInspectorId && (c.status === 'Pending Field Verification' || c.status === 'Submitted' || c.status === 'Verified' || c.status === 'Needs Clarification')) return true;

          return false;
        })
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      onData(complaints);
    },
    err => onError(err as Error)
  );
}

export function subscribeToAllComplaints(
  onData: (complaints: Complaint[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = collection(db, 'complaints');

  return onSnapshot(
    q,
    snapshot => {
      const complaints: Complaint[] = snapshot.docs
        .map(d => parseComplaintDoc(d))
        .filter(c => !c.isDeleted)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      onData(complaints);
    },
    err => onError(err as Error)
  );
}

export function subscribeToComplaint(
  complaintId: string,
  onData: (complaint: Complaint | null) => void,
  onError: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'complaints', complaintId),
    snap => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const parsed = parseComplaintDoc(snap);
      if (parsed.isDeleted) {
        onData(null);
        return;
      }
      onData(parsed);
    },
    err => onError(err as Error)
  );
}

export async function getUserComplaintStats(citizenId: string) {
  const q = query(collection(db, 'complaints'), where('citizenId', '==', citizenId));
  const snapshot = await getDocs(q);
  let active = 0;
  let resolved = 0;
  let rejected = 0;
  snapshot.forEach(d => {
    const data = d.data();
    if (data.isDeleted) return;
    const status = data.status as ComplaintStatus;
    if (status === 'Closed' || status === 'Resolved') resolved++;
    else if (isInvalidImageComplaint(data)) rejected++;
    else active++;
  });
  return { total: snapshot.size, active, resolved, rejected };
}

export async function getOfficerStats() {
  const complaintsSnapshot = await getDocs(collection(db, 'complaints'));
  let total = 0;
  let newComplaints = 0;
  let pendingInspection = 0;
  let validComplaints = 0;
  let rejectedComplaints = 0;
  let inProgress = 0;
  let resolved = 0;

  complaintsSnapshot.forEach(d => {
    const data = d.data();
    if (data.isDeleted) return;
    const status = data.status as ComplaintStatus;
    const inspStatus = data.inspectionStatus as InspectionStatus;
    total++;
    if (isInvalidImageComplaint(data)) {
      rejectedComplaints++;
    } else if (status === 'Resolved' || status === 'Closed') {
      resolved++;
    } else if (status === 'In Progress' || status === 'Accepted' || status === 'Assigned') {
      inProgress++;
    } else if (inspStatus === 'VALID' || status === 'Verified') {
      validComplaints++;
    } else if (status === 'Pending Field Verification' || inspStatus === 'PENDING') {
      pendingInspection++;
    } else if (status === 'Submitted') {
      newComplaints++;
    }
  });

  return { total, newComplaints, pendingInspection, validComplaints, rejectedComplaints, inProgress, resolved };
}

/**
 * Citizen-side complaint deletion (owner-enforced)
 */
export async function deleteComplaintByCitizen(
  complaintId: string,
  citizenId: string
): Promise<void> {
  // First attempt backend proxy for authenticated backend proxy flow
  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(`${apiBase}/api/citizen-delete-complaint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ complaintId, citizenId }),
    });
    if (res.ok) {
      const json = await res.json();
      console.log('✅ [complaintService] Citizen deletion via server proxy successful:', json);
      return;
    }
  } catch (proxyErr) {
    console.warn('[complaintService] Backend proxy citizen deletion unavailable, falling back to direct Firestore:', proxyErr);
  }

  // Fallback direct Firestore update
  const docRef = doc(db, 'complaints', complaintId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error('Complaint not found.');
  }
  const data = snap.data();
  if (data.citizenId !== citizenId) {
    throw new Error('Unauthorized: You can only delete complaints that you submitted.');
  }

  const existingHistory = Array.isArray(data.statusHistory) ? data.statusHistory : [];
  const historyItem = {
    id: `hist-${Date.now()}`,
    previousStatus: data.status || 'Submitted',
    newStatus: 'Deleted by Citizen',
    updatedBy: citizenId,
    updatedByName: data.citizenEmail?.split('@')[0] || 'Citizen',
    remarks: 'Complaint deleted by citizen from active views.',
    timestamp: new Date().toISOString(),
  };

  await updateDoc(docRef, {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: citizenId,
    deletedByRole: 'citizen',
    status: 'Closed',
    statusHistory: [...existingHistory, historyItem],
    updatedAt: serverTimestamp(),
  });

  // Atomically create citizen notification for self-deletion
  const citizenUid = data.citizenId;
  const canonicalIssue = data.displayIssueName || data.issueType || 'Civic Defect';
  const displayId = data.complaintId || complaintId;
  const notifDateStr = new Date().toLocaleString('en-IN');
  if (citizenUid) {
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: citizenUid,
        recipientId: citizenUid,
        recipientRole: 'citizen',
        complaintId: displayId,
        complaintDocId: complaintId,
        title: 'Complaint Deleted',
        message: `Your complaint ${displayId} (${canonicalIssue}) was deleted on ${notifDateStr} and removed from active records.`,
        type: 'complaint_deleted',
        deletionReason: 'Deleted by citizen from active records',
        deletedBy: 'You (Citizen)',
        isRead: false,
        createdAt: serverTimestamp(),
      });
    } catch (notifErr) {
      console.warn('[complaintService] Citizen deletion in-app notif note:', notifErr);
    }
  }

  // Deletion email notification
  if (data.citizenEmail) {
    sendComplaintDeletionEmail({
      complaintId: displayId,
      issueType: canonicalIssue,
      citizenEmail: data.citizenEmail,
      initiatedBy: 'citizen',
      deletionReason: 'Deleted by citizen request',
    }).catch(err => console.warn('[complaintService] Citizen deletion email error (safely handled):', err));
  }
}

/**
 * Authority/Officer-side complaint deletion (reason-enforced + citizen notification)
 */
export async function deleteComplaintByAuthority(
  complaintId: string,
  officerId: string,
  officerName: string,
  officerRole: string,
  deletionReason: string
): Promise<void> {
  const reason = (deletionReason || '').trim();
  if (!reason) {
    throw new Error('A non-empty deletion reason or clarification is strictly required to delete this complaint.');
  }

  // First attempt backend proxy for atomic server execution
  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(`${apiBase}/api/authority-delete-complaint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complaintId,
        officerId,
        officerName,
        officerRole,
        deletionReason: reason,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      console.log('✅ [complaintService] Authority deletion via server proxy successful:', json);
      return;
    }
  } catch (proxyErr) {
    console.warn('[complaintService] Backend proxy authority deletion unavailable, falling back to direct Firestore:', proxyErr);
  }

  // Fallback direct Firestore update
  const docRef = doc(db, 'complaints', complaintId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error('Complaint not found.');
  }
  const data = snap.data();

  const existingHistory = Array.isArray(data.statusHistory) ? data.statusHistory : [];
  const historyItem = {
    id: `hist-${Date.now()}`,
    previousStatus: data.status || 'Submitted',
    newStatus: 'Deleted by Authority',
    updatedBy: officerId,
    updatedByName: officerName || 'Authorized Officer',
    remarks: `Complaint removed by authority. Reason: ${reason}`,
    timestamp: new Date().toISOString(),
  };

  await updateDoc(docRef, {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: officerId,
    deletedByRole: 'officer',
    deletionReason: reason,
    status: 'Closed',
    statusHistory: [...existingHistory, historyItem],
    updatedAt: serverTimestamp(),
  });

  // Atomically create citizen notification
  const citizenUid = data.citizenId;
  const canonicalIssue = data.displayIssueName || data.issueType || 'Civic Defect';
  const displayId = data.complaintId || complaintId;
  const notifDateStr = new Date().toLocaleString('en-IN');
  const notifMessage = `Your complaint ${displayId} — ${canonicalIssue} — was removed by the responsible authority. Reason: ${reason}. Date: ${notifDateStr}.`;

  if (citizenUid) {
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: citizenUid,
        recipientId: citizenUid,
        recipientRole: 'citizen',
        complaintId: displayId,
        complaintDocId: complaintId,
        title: 'Complaint Removed by Authority',
        message: notifMessage,
        type: 'complaint_deleted',
        deletionReason: reason,
        deletedBy: officerName || 'Authorized Officer',
        isRead: false,
        createdAt: serverTimestamp(),
      });
    } catch (notifErr) {
      console.warn('[complaintService] Failed to create in-app notification directly:', notifErr);
    }
  }

  // Deletion email notification
  if (data.citizenEmail) {
    sendComplaintDeletionEmail({
      complaintId: displayId,
      issueType: canonicalIssue,
      citizenEmail: data.citizenEmail,
      initiatedBy: 'authority',
      deletionReason: reason,
      deletedByName: officerName || 'Authorized Officer',
    }).catch(err => console.warn('[complaintService] Authority deletion email error (safely handled):', err));
  }
}

export async function updateComplaintStatus(docId: string, status: ComplaintStatus) {
  await updateDoc(doc(db, 'complaints', docId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Update / Reassign complaint department (Main Officer or Field Inspector)
 */
export async function updateComplaintDepartment(
  complaintId: string,
  newDept: { name: string; code: string; routingMessageName?: string },
  changedBy: { uid: string; name?: string; role: 'main_officer' | 'field_inspector' | string },
  currentDepartment = 'Road Maintenance',
  remarks?: string
): Promise<void> {
  const docRef = doc(db, 'complaints', complaintId);
  const snap = await getDoc(docRef);
  if (snap.exists() && isInvalidImageComplaint(snap.data())) {
    throw new Error('Action blocked: Cannot reassign department for a rejected complaint.');
  }

  const source: DepartmentSource = changedBy.role === 'field_inspector' ? 'field_inspector' : 'officer';
  const roleTitle = changedBy.role === 'field_inspector' ? 'Field Inspector' : 'Main Officer';
  const deptName = newDept.name;
  const isMoved = deptName !== 'Road Maintenance';

  console.log('UPDATING COMPLAINT DEPARTMENT:', {
    complaintId,
    newDept,
    changedBy,
    currentDepartment,
    remarks,
  });

  const isSWM = deptName === 'Solid Waste Management' || newDept.code === 'SWM';

  const updateData: Record<string, any> = {
    department: deptName,
    responsibleDepartment: deptName,
    departmentCode: newDept.code,
    departmentSource: source,
    routingStatus: (isMoved ? (isSWM ? 'Moved to Solid Waste Management' : 'Moved') : 'Direct') as RoutingStatus,
    routingMessage: isMoved
      ? (isSWM
          ? 'Your complaint has been moved to the Solid Waste Management Department for further action.'
          : `Your complaint has been moved to the ${newDept.routingMessageName || deptName + ' Department'}.`)
      : 'Your complaint has been assigned to the Road Maintenance Department.',
    originalDepartment: currentDepartment || 'Road Maintenance',
    departmentChangedAt: serverTimestamp(),
    departmentChangedBy: changedBy.uid,
    departmentChangedByName: changedBy.name || roleTitle,
    updatedAt: serverTimestamp(),
  };

  if (remarks && remarks.trim()) {
    updateData.departmentRemarks = remarks.trim();
  }

  await updateDoc(doc(db, 'complaints', complaintId), updateData);
}
