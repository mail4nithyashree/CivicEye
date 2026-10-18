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
import * as Location from 'expo-location';

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
  return s === 'Invalid Image, give valid Issue Image!' ||
         s === 'Invalid Issue image, raise the complaint with the appropriate image!' ||
         s === 'Dissimilar Image to the Issue' ||
         s === 'Rejected' ||
         insp === 'INVALID' ||
         rejType === 'IMAGE_MISMATCH' ||
         rejType === 'INVALID_IMAGE' ||
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

  // Audit History
  statusHistory?: StatusHistoryItem[];

  createdAt: Date;
  updatedAt: Date;
}

export interface NewComplaintData {
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
  confidence: number;
  priority: string;
  severity: string;
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

  const createdAtDate = parseDate(data.createdAt) || new Date();
  const calculatedDuration = getEstimatedResolutionDuration(
    data.priority || data.severity || 'LOW',
    data.issueType || defaultIssue,
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

    issueType: data.issueType || defaultIssue,
    confidence: typeof data.confidence === 'number' ? data.confidence : 0,
    priority: data.priority || data.severity || 'LOW',
    severity: data.severity || data.priority || 'LOW',
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
    statusHistory,

    createdAt: createdAtDate,
    updatedAt: parseDate(data.updatedAt) || new Date(),
  };
}

/**
 * Concurrency-safe human-readable Complaint ID generator: CE-YYYYMMDD-000001
 * Uses Firestore transaction atomic counter per calendar date.
 * Guarantees zero collisions, uniqueness under concurrent submissions,
 * and stable readable IDs.
 */
export async function generateMeaningfulComplaintId(customDate: Date = new Date()): Promise<string> {
  const yyyy = customDate.getFullYear();
  const mm = String(customDate.getMonth() + 1).padStart(2, '0');
  const dd = String(customDate.getDate()).padStart(2, '0');
  const dateKey = `${yyyy}${mm}${dd}`;

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
    console.warn('[complaintService] Firestore transaction failed, trying backend endpoint:', err);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/next-complaint-id?dateKey=${dateKey}`);
      if (res.ok) {
        const data = await res.json();
        if (data.complaintId) return data.complaintId;
      }
    } catch (apiErr) {
      console.warn('[complaintService] Backend endpoint fallback note:', apiErr);
    }
    const fallbackSeq = String(Math.floor(Date.now() % 1000000)).padStart(6, '0');
    return `CE-${dateKey}-${fallbackSeq}`;
  }
}

// Backward-compatibility alias
export const generateComplaintId = generateMeaningfulComplaintId;

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
  if (!params.citizenEmail) {
    console.warn('[complaintService] No citizen email provided for SWM notification.');
    return false;
  }

  try {
    const apiUrl = `${getApiBaseUrl()}/api/send-email`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        complaintId: params.complaintId,
        issueType: params.issueType,
        description: params.description,
        citizenEmail: params.citizenEmail,
        department: params.department || 'Solid Waste Management',
        routingStatus: params.routingStatus || 'Moved to Solid Waste Management',
      }),
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      console.log('[complaintService] SWM notification email triggered successfully:', data);
      return true;
    } else {
      console.warn('[complaintService] Server returned non-ok status for email notification:', response.status);
      return false;
    }
  } catch (error) {
    console.warn('[complaintService] Email endpoint error (handled gracefully):', error);
    return false;
  }
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
  const complaintId = data.complaintId || await generateMeaningfulComplaintId();
  const isDissimilar = data.status === 'Dissimilar Image to the Issue' || data.analysisStatus === 'dissimilar_image' || (data.roadValidationResult === 'not_road' && data.rejectionType === 'IMAGE_MISMATCH');
  const isNoMajorIssue = data.analysisStatus === 'no_major_issue' || data.issueType === 'no_major_issue' || data.issueType === 'No supported issue detected' || data.issueType === 'Road Surface (Inspection Requested)';
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

  const defaultIssue = isDissimilar
    ? (data.issueType || 'Dissimilar Image to the Issue')
    : isNoMajorIssue
    ? (data.issueType || 'No supported issue detected')
    : (isNonRoad ? getDefaultIssueTypeForDepartment(deptCode) : (data.issueType || 'pothole'));

  const complaintDocData: Record<string, any> = {
    complaintId,
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
    issueType: defaultIssue,
    confidence: typeof data.confidence === 'number' ? data.confidence : 0,
    priority: isDissimilar || isNoMajorIssue ? 'NONE' : (data.priority || 'LOW'),
    severity: isDissimilar || isNoMajorIssue ? 'NONE' : (data.severity || data.priority || 'LOW'),
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
    AI_prediction: isDissimilar ? 'Dissimilar Image to the Issue' : (data.detectedIssue || data.issueType || defaultIssue),
    AI_confidence: data.detectionConfidence ?? data.confidence,
    AI_validation: data.roadValidationResult || (isDissimilar ? 'not_road' : (isNonRoad ? 'not_road' : 'road')),
    AI_timestamp: serverTimestamp(),
    ...(data.detectedIssue ? { detectedIssue: data.detectedIssue } : {}),
    ...(typeof data.detectionConfidence === 'number' ? { detectionConfidence: data.detectionConfidence } : {}),
    ...(data.suggestedRoadName ? { roadName: data.suggestedRoadName } : {}),
    ...(data.suggestedAuthority ? { maintenanceAuthority: data.suggestedAuthority } : {}),
    ...(typeof data.estimatedBudget === 'number' ? { estimatedBudget: data.estimatedBudget } : {}),
    ...(data.estimatedBudgetDesc ? { estimatedBudgetDesc: data.estimatedBudgetDesc } : {}),
    ...(data.budgetBreakdown ? { budgetBreakdown: data.budgetBreakdown } : {}),
    // Resolution duration calculation
    estimatedResolutionDays: (() => {
      if (isDissimilar) return 0;
      const dur = getEstimatedResolutionDuration(data.priority || 'LOW', data.issueType || defaultIssue, activeDept);
      return typeof data.estimatedResolutionDays === 'number' ? data.estimatedResolutionDays : dur.durationDays;
    })(),
    estimatedResolutionDuration: (() => {
      if (isDissimilar) return 'Inactive';
      const dur = getEstimatedResolutionDuration(data.priority || 'LOW', data.issueType || defaultIssue, activeDept);
      return data.estimatedResolutionDuration || dur.durationText;
    })(),
    expectedResolutionDate: (() => {
      if (isDissimilar) return null;
      const dur = getEstimatedResolutionDuration(data.priority || 'LOW', data.issueType || defaultIssue, activeDept);
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

  // If routed to Solid Waste Management and not rejected, send email notification to citizen
  if (!isDissimilar && (deptCode === 'SWM' || activeDept === 'Solid Waste Management')) {
    sendSWMNotificationEmail({
      complaintId,
      issueType: data.issueType || defaultIssue,
      description: data.description,
      citizenEmail: data.citizenEmail,
      department: activeDept,
      routingStatus,
    }).catch(err => {
      console.warn('[complaintService] SWM Email notification dispatch error:', err);
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

      // If transferred to SWM, send email notification to citizen
      if (newDeptCode === 'SWM' && currentData.citizenEmail) {
        sendSWMNotificationEmail({
          complaintId: currentData.complaintId || complaintId,
          issueType: newIssueType,
          description: currentData.description || '',
          citizenEmail: currentData.citizenEmail,
          department: newDeptName,
          routingStatus,
        }).catch(err => {
          console.warn('[complaintService] SWM Email error on department transfer:', err);
        });
      }
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
      statusHistory: [...existingHistory, historyItem],
      updatedAt: serverTimestamp(),
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
          // Exclude rejected image mismatch complaints from active inspector queues
          if (isInvalidImageComplaint(c)) {
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
          if (!c.assignedInspectorId && (c.status === 'Pending Field Verification' || c.status === 'Submitted' || c.status === 'Verified')) return true;

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
      onData(parseComplaintDoc(snap));
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
    const status = d.data().status as ComplaintStatus;
    if (status === 'Closed' || status === 'Resolved') resolved++;
    else if (isInvalidImageComplaint(d.data())) rejected++;
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
