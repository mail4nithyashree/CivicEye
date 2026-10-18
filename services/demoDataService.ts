import type { CoimbatoreRegion } from '@/constants/coimbatoreRoads';
import type { DetectedIssueType, Priority } from './detectionConfig';
import type { ComplaintStatus, InspectionStatus } from './complaintService';
import { getApiBaseUrl } from './apiConfig';

export interface DemoComplaintSeed {
  complaintId: string;
  citizenId: string;
  citizenEmail: string;
  citizenName: string;
  issueType: DetectedIssueType | 'Public Route Issue';
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  region: CoimbatoreRegion;
  roadName: string;
  roadType: string;
  status: ComplaintStatus;
  inspectionStatus: InspectionStatus;
  confidence: number;
  priority: Priority;
  severity: string;
  maintenanceAuthority: string;
  departmentCode: string;
  imageUri: string;
  daysAgo: number;
  assignedInspectorName?: string;
  assignedInspectorId?: string;
  resolutionRemarks?: string;
  inspectorRemarks?: string;
}

export const SYNTHETIC_COMPLAINTS_CATALOG: DemoComplaintSeed[] = [
  {
    complaintId: 'CBE-POT-2026-001',
    citizenId: 'demo-citizen-1',
    citizenEmail: 'citizen@example.com',
    citizenName: 'Nithya Sundar',
    issueType: 'pothole',
    title: 'Deep Asphalt Pothole Cavity with Exposed Aggregate',
    description: 'Severe 45cm diameter pothole crater in travel lane causing two-wheeler destabilization near Cross Cut signal. High risk for night traffic.',
    latitude: 11.0185,
    longitude: 76.9654,
    region: 'Gandhipuram',
    roadName: 'Cross Cut Road, Gandhipuram',
    roadType: 'Commercial Corridor',
    status: 'In Progress',
    inspectionStatus: 'VALID',
    confidence: 95.8,
    priority: 'HIGH',
    severity: 'High',
    maintenanceAuthority: 'Road Maintenance Department',
    departmentCode: 'ROAD',
    imageUri: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
    daysAgo: 2,
    assignedInspectorName: 'Ravi Chandran (Inspector #104)',
    assignedInspectorId: 'demo-inspector-1',
    inspectorRemarks: 'Inspected on-site. 45cm deep asphalt cavity requiring immediate cold-mix aggregate packing and bituminous resurfacing.',
    resolutionRemarks: 'Assigned to North Zone road maintenance rapid repair unit with ₹25,000 sanctioned budget.',
  },
  {
    complaintId: 'CBE-CRK-2026-002',
    citizenId: 'demo-citizen-2',
    citizenEmail: 'citizen.priya@example.com',
    citizenName: 'Priya Ramanathan',
    issueType: 'cracking',
    title: 'Transverse & Longitudinal Joint Pavement Fissures',
    description: 'Continuous 15-meter longitudinal fissure along vehicular wheel path allowing moisture penetration into subgrade.',
    latitude: 11.0267,
    longitude: 77.0142,
    region: 'Peelamedu',
    roadName: 'Avinashi Road (NH 544 Link)',
    roadType: 'Major Arterial',
    status: 'Assigned',
    inspectionStatus: 'VALID',
    confidence: 92.4,
    priority: 'MEDIUM',
    severity: 'Medium',
    maintenanceAuthority: 'Road Maintenance Department',
    departmentCode: 'ROAD',
    imageUri: 'https://images.unsplash.com/photo-1584467735815-f778f274e296?auto=format&fit=crop&w=800&q=80',
    daysAgo: 3,
    assignedInspectorName: 'Karthik Raja (Inspector #108)',
    assignedInspectorId: 'demo-inspector-2',
    inspectorRemarks: 'Longitudinal joint crack verified over 15m. Crack sealing polymer application scheduled.',
  },
  {
    complaintId: 'CBE-ALG-2026-003',
    citizenId: 'demo-citizen-1',
    citizenEmail: 'citizen@example.com',
    citizenName: 'Nithya Sundar',
    issueType: 'alligator cracking',
    title: 'Extensive Alligator Fatigue Cracking & Base Failure',
    description: 'Interconnected polygonal cracking pattern over a 12-meter stretch indicating severe load-induced asphalt fatigue.',
    latitude: 11.0342,
    longitude: 76.9821,
    region: 'Ganapathy',
    roadName: 'Sathy Main Road (SH 15)',
    roadType: 'State Highway',
    status: 'Resolved',
    inspectionStatus: 'VALID',
    confidence: 94.6,
    priority: 'HIGH',
    severity: 'High',
    maintenanceAuthority: 'Road Maintenance Department',
    departmentCode: 'ROAD',
    imageUri: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
    daysAgo: 8,
    assignedInspectorName: 'Ravi Chandran (Inspector #104)',
    assignedInspectorId: 'demo-inspector-1',
    inspectorRemarks: 'Cold milling and 40mm Bituminous Concrete overlay applied. Surface smoothness and load capacity verified.',
    resolutionRemarks: 'Milling & hot-mix bituminous resurfacing completed by Road Maintenance Department Zonal Contractor.',
  },
  {
    complaintId: 'CBE-DIV-2026-004',
    citizenId: 'demo-citizen-3',
    citizenEmail: 'citizen.karthik@example.com',
    citizenName: 'Karthik Subramanian',
    issueType: 'road divider damage',
    title: 'Displaced Concrete Median & Broken Crash Barrier',
    description: 'Central road median barrier fractured and displaced into fast lane. Severe collision hazard for nocturnal traffic.',
    latitude: 11.0142,
    longitude: 76.9691,
    region: 'Gandhipuram',
    roadName: '100 Feet Road, Gandhipuram',
    roadType: 'Major Arterial',
    status: 'In Progress',
    inspectionStatus: 'VALID',
    confidence: 96.1,
    priority: 'HIGH',
    severity: 'High',
    maintenanceAuthority: 'Traffic / Road Safety Department',
    departmentCode: 'SAFETY',
    imageUri: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80',
    daysAgo: 2,
    assignedInspectorName: 'Ravi Chandran (Inspector #104)',
    assignedInspectorId: 'demo-inspector-1',
    inspectorRemarks: 'Inspected on-site. 3 concrete median blocks shifted into carriageway. Heavy crane work order issued to Traffic Safety Wing.',
  },
  {
    complaintId: 'CBE-STL-2026-005',
    citizenId: 'demo-citizen-2',
    citizenEmail: 'citizen.priya@example.com',
    citizenName: 'Priya Ramanathan',
    issueType: 'street light fault',
    title: 'Damaged Streetlight Pole & Dangling Electrical Wire',
    description: 'High-mast streetlight pole bent at 40 degrees with exposed energized wiring near PSG Tech bus stop corridor.',
    latitude: 11.0312,
    longitude: 77.0189,
    region: 'Peelamedu',
    roadName: 'Peelamedu Airport Link Road',
    roadType: 'Bus Route Road',
    status: 'Assigned',
    inspectionStatus: 'VALID',
    confidence: 93.8,
    priority: 'HIGH',
    severity: 'High',
    maintenanceAuthority: 'Street Lighting Department',
    departmentCode: 'LIGHTING',
    imageUri: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=800&q=80',
    daysAgo: 3,
    assignedInspectorName: 'Karthik Raja (Inspector #108)',
    assignedInspectorId: 'demo-inspector-2',
    inspectorRemarks: 'Hazardous electrical fixture verified. Power isolated at junction box; pole replacement line work scheduled.',
  },
  {
    complaintId: 'CBE-MNH-2026-006',
    citizenId: 'demo-citizen-1',
    citizenEmail: 'citizen@example.com',
    citizenName: 'Nithya Sundar',
    issueType: 'manhole defect',
    title: 'Cracked & Sunken Drainage Manhole Chamber',
    description: 'Cast iron sewer chamber cover cracked through center with 15cm depression in the middle of travel lane.',
    latitude: 11.0452,
    longitude: 76.9712,
    region: 'Maniyakarampalayam',
    roadName: 'Maniyakarampalayam Main Road',
    roadType: 'Corporation Ward Road',
    status: 'Verified',
    inspectionStatus: 'VALID',
    confidence: 96.5,
    priority: 'HIGH',
    severity: 'High',
    maintenanceAuthority: 'Water Supply & Drainage Department',
    departmentCode: 'TWAD',
    imageUri: 'https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=800&q=80',
    daysAgo: 1,
    assignedInspectorName: 'Ravi Chandran (Inspector #104)',
    assignedInspectorId: 'demo-inspector-1',
    inspectorRemarks: 'Chamber rim collapsed from heavy axle loading. New ductile iron frame requisitioned for TWAD drainage crew.',
  },
  {
    complaintId: 'CBE-WTR-2026-007',
    citizenId: 'demo-citizen-3',
    citizenEmail: 'citizen.karthik@example.com',
    citizenName: 'Karthik Subramanian',
    issueType: 'waterlogging',
    title: 'Severe Carriageway Waterlogging & Choked Catchpit',
    description: 'Over 30 meters of stagnant rainwater accumulating after brief shower. Stormwater inlet completely blocked by silt.',
    latitude: 11.0171,
    longitude: 76.9682,
    region: 'Gandhipuram',
    roadName: 'Dr. Nanjappa Road, Gandhipuram',
    roadType: 'Commercial Corridor',
    status: 'In Progress',
    inspectionStatus: 'VALID',
    confidence: 91.7,
    priority: 'HIGH',
    severity: 'High',
    maintenanceAuthority: 'Water Supply & Drainage Department',
    departmentCode: 'TWAD',
    imageUri: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=800&q=80',
    daysAgo: 4,
    assignedInspectorName: 'Ravi Chandran (Inspector #104)',
    assignedInspectorId: 'demo-inspector-1',
    inspectorRemarks: 'High-pressure suction jetting machine deployed to clear clogged 450mm stormwater drainage pipe.',
  },
  {
    complaintId: 'CBE-PWD-2026-008',
    citizenId: 'demo-citizen-2',
    citizenEmail: 'citizen.priya@example.com',
    citizenName: 'Priya Ramanathan',
    issueType: 'Public Route Issue',
    title: 'Collapsed Public Route Footpath & Paver Subgrade Failure',
    description: 'Public government corridor pedestrian walkway collapsed with broken kerb stones and eroded sub-base along PWD arterial link.',
    latitude: 11.0289,
    longitude: 77.0098,
    region: 'Peelamedu',
    roadName: 'Bharathi Colony Road (PWD Route)',
    roadType: 'Major Arterial',
    status: 'Pending Field Verification',
    inspectionStatus: 'PENDING',
    confidence: 90.2,
    priority: 'HIGH',
    severity: 'High',
    maintenanceAuthority: 'Public Works Department',
    departmentCode: 'PWD',
    imageUri: 'https://images.unsplash.com/photo-1572949645841-094f3a9c4c94?auto=format&fit=crop&w=800&q=80',
    daysAgo: 0,
    inspectorRemarks: 'Auto-routed to Public Works Department (PWD) for corridor walkway reconstruction.',
  },
  {
    complaintId: 'CBE-DEB-2026-009',
    citizenId: 'demo-citizen-1',
    citizenEmail: 'citizen@example.com',
    citizenName: 'Nithya Sundar',
    issueType: 'debris / road blockage',
    title: 'Highway Construction Debris & Aggregate Rubble Dump',
    description: 'Unorganized pile of building aggregate, concrete chunks, and tree limbs obstructing the left travel lane.',
    latitude: 11.0389,
    longitude: 76.9631,
    region: 'Maniyakarampalayam',
    roadName: 'Nallampalayam Link Road',
    roadType: 'Corporation Ward Road',
    status: 'Closed',
    inspectionStatus: 'VALID',
    confidence: 92.5,
    priority: 'MEDIUM',
    severity: 'Medium',
    maintenanceAuthority: 'Solid Waste Management Department',
    departmentCode: 'SWM',
    imageUri: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=800&q=80',
    daysAgo: 10,
    assignedInspectorName: 'Ravi Chandran (Inspector #104)',
    assignedInspectorId: 'demo-inspector-1',
    inspectorRemarks: 'Debris completely cleared by CCMC SWM JCB loaders. Roadway fully swept and restored.',
    resolutionRemarks: 'Citizen verified rapid 24-hour obstacle removal and road clearance.',
  },
  {
    complaintId: 'CBE-SGN-2026-010',
    citizenId: 'demo-citizen-3',
    citizenEmail: 'citizen.karthik@example.com',
    citizenName: 'Karthik Subramanian',
    issueType: 'missing signage',
    title: 'Damaged Speed Limit Signboard & Broken Reflector Pole',
    description: 'School zone 30 km/h speed limit and pedestrian crossing sign knocked down by storm, lying on walkway curb.',
    latitude: 11.0298,
    longitude: 76.9892,
    region: 'Ganapathy',
    roadName: 'Ganapathy Bus Stand Link Road',
    roadType: 'Bus Route Road',
    status: 'Verified',
    inspectionStatus: 'VALID',
    confidence: 88.3,
    priority: 'MEDIUM',
    severity: 'Medium',
    maintenanceAuthority: 'Traffic / Road Safety Department',
    departmentCode: 'SAFETY',
    imageUri: 'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=800&q=80',
    daysAgo: 5,
    assignedInspectorName: 'Ravi Chandran (Inspector #104)',
    assignedInspectorId: 'demo-inspector-1',
    inspectorRemarks: 'Verified school safety sign damage. Replacement retro-reflective signboard fabricated and scheduled for installation.',
  },
];

export const DEMO_SYSTEM_USERS = [
  {
    uid: 'demo-citizen-1',
    email: 'citizen@example.com',
    fullName: 'Nithya Sundar',
    phone: '+91 98401 23456',
    role: 'citizen',
    preferredRegion: 'Gandhipuram',
    badges: ['Civic Champion', 'Road Guardian'],
    reportedCount: 4,
  },
  {
    uid: 'demo-citizen-2',
    email: 'citizen.priya@example.com',
    fullName: 'Priya Ramanathan',
    phone: '+91 97890 54321',
    role: 'citizen',
    preferredRegion: 'Peelamedu',
    badges: ['Active Contributor'],
    reportedCount: 3,
  },
  {
    uid: 'demo-citizen-3',
    email: 'citizen.karthik@example.com',
    fullName: 'Karthik Subramanian',
    phone: '+91 94432 98765',
    role: 'citizen',
    preferredRegion: 'Ganapathy',
    badges: ['Safety Spotter'],
    reportedCount: 2,
  },
  {
    uid: 'demo-officer-pwd',
    email: 'officer.pwd@civiceye.gov',
    fullName: 'Er. S. Murugesan (Divisional Engineer)',
    phone: '+91 422 2300100',
    role: 'main_officer',
    department: 'Public Works Department (PWD)',
    active: true,
  },
  {
    uid: 'demo-inspector-1',
    email: 'inspector.ravi@civiceye.gov',
    fullName: 'Ravi Chandran (Field Inspector)',
    phone: '+91 98422 11223',
    role: 'field_inspector',
    department: 'Coimbatore Corporation North & Central',
    active: true,
  },
  {
    uid: 'demo-officer-tangedco',
    email: 'officer.tangedco@civiceye.gov',
    fullName: 'K. Balaji (Assistant Executive Engineer)',
    phone: '+91 422 2490200',
    role: 'main_officer',
    department: 'TANGEDCO Electrical Wing',
    active: true,
  },
  {
    uid: 'demo-officer-twad',
    email: 'officer.twad@civiceye.gov',
    fullName: 'M. Anandhan (UGD Drainage Wing)',
    phone: '+91 422 2244100',
    role: 'main_officer',
    department: 'TWAD Board & Sewerage',
    active: true,
  },
];

/**
 * Seeds synthetic complaints and system users by delegating to the backend server
 * or server-side admin script to ensure Firestore security rules remain strict.
 */
export async function seedSyntheticCivicData(
  currentUserId?: string,
  currentEmail?: string
): Promise<{ success: boolean; count: number; message: string }> {
  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/seed-demo-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        currentUserId,
        currentEmail,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        count: data.count || SYNTHETIC_COMPLAINTS_CATALOG.length,
        message: data.message || `Successfully populated synthetic road issues across Coimbatore hubs.`,
      };
    } else {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        count: 0,
        message: errorData.message || 'Server-side seeding returned an error.',
      };
    }
  } catch (error: any) {
    console.warn('[demoDataService] Backend seed endpoint unreachable:', error.message);
    return {
      success: false,
      count: 0,
      message: 'CivicEye backend server is offline. Please run "npm run seed" or "node scripts/seed_demo_data.mjs" in the project terminal to populate demo data.',
    };
  }
}

/**
 * Safe no-op on the mobile client. Automatic client-side seeding on app startup is disabled
 * to preserve Firestore security and prevent unauthorized client writes.
 */
export async function ensureInitialDemoData(_currentUserId?: string, _currentEmail?: string): Promise<void> {
  // Deliberate no-op: mobile clients should not execute unauthorized batch seed writes on launch.
  // Use "npm run seed" or "node scripts/seed_demo_data.mjs" to seed demo data.
}
