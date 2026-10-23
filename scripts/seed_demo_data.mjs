import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { calculatePracticalBudget } from '../constants/coimbatoreRoads.ts';

const firebaseConfig = {
  apiKey: "AIzaSyD2SIXmgD8xgYvdFMG0ZryGF3F5tgYOlGs",
  authDomain: "civiceye-c127c.firebaseapp.com",
  projectId: "civiceye-c127c",
  storageBucket: "civiceye-c127c.firebasestorage.app",
  messagingSenderId: "930740300088",
  appId: "1:930740300088:web:aa1eb5f0cc91edd068a919",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const DEFAULT_DEMO_PASSWORD = 'Password@123';

function cleanDocData(obj) {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      if (val && typeof val === 'object' && !(val instanceof Timestamp) && !(val instanceof Date)) {
        result[key] = cleanDocData(val);
      } else {
        result[key] = val;
      }
    }
  }
  return result;
}

export const DEMO_SYSTEM_USERS = [
  {
    email: 'citizen1@civiceye.demo',
    fullName: 'Nithya Sundar',
    phone: '+91 98401 23456',
    role: 'citizen',
    preferredRegion: 'Gandhipuram',
    badges: ['Civic Champion', 'Road Guardian'],
    reportedCount: 4,
  },
  {
    email: 'citizen2@civiceye.demo',
    fullName: 'Priya Ramanathan',
    phone: '+91 97890 54321',
    role: 'citizen',
    preferredRegion: 'Peelamedu',
    badges: ['Active Contributor'],
    reportedCount: 3,
  },
  {
    email: 'citizen3@civiceye.demo',
    fullName: 'Karthik Subramanian',
    phone: '+91 94432 98765',
    role: 'citizen',
    preferredRegion: 'Ganapathy',
    badges: ['Safety Spotter'],
    reportedCount: 2,
  },
  {
    email: 'officer.pwd@civiceye.demo',
    fullName: 'Er. S. Murugesan (Divisional Engineer)',
    phone: '+91 422 2300100',
    role: 'main_officer',
    department: 'Public Works Department (PWD)',
    active: true,
  },
  {
    email: 'inspector.ravi@civiceye.demo',
    fullName: 'Ravi Chandran (Field Inspector)',
    phone: '+91 98422 11223',
    role: 'field_inspector',
    department: 'Coimbatore Corporation North & Central',
    active: true,
  },
  {
    email: 'officer.tangedco@civiceye.demo',
    fullName: 'K. Balaji (Assistant Executive Engineer)',
    phone: '+91 422 2490200',
    role: 'main_officer',
    department: 'TANGEDCO Electrical Wing',
    active: true,
  },
  {
    email: 'officer.twad@civiceye.demo',
    fullName: 'M. Anandhan (UGD Drainage Wing)',
    phone: '+91 422 2244100',
    role: 'main_officer',
    department: 'TWAD Board & Sewerage',
    active: true,
  },
];

export const SYNTHETIC_COMPLAINTS_CATALOG = [
  {
    complaintId: 'CBE-POT-2026-001',
    citizenEmail: 'citizen1@civiceye.demo',
    citizenName: 'Nithya Sundar',
    issueType: 'pothole',
    title: 'Deep Asphalt Pothole Cavity with Exposed Aggregate',
    description: 'Severe 45cm diameter pothole crater in travel lane causing two-wheeler destabilization near Cross Cut signal. High risk for night traffic.',
    latitude: 11.0185,
    longitude: 76.9654,
    region: 'Gandhipuram',
    roadName: 'Cross Cut Road, Gandhipuram',
    roadType: 'Commercial Corridor',
    finalStatus: 'In Progress',
    inspectionStatus: 'VALID',
    confidence: 95.8,
    priority: 'HIGH',
    severity: 'High',
    maintenanceAuthority: 'Road Maintenance Department',
    departmentCode: 'ROAD',
    imageUri: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
    daysAgo: 2,
    assignedInspectorName: 'Ravi Chandran (Inspector #104)',
    inspectorRemarks: 'Inspected on-site. 45cm deep asphalt cavity requiring immediate cold-mix aggregate packing and bituminous resurfacing.',
    resolutionRemarks: 'Assigned to North Zone road maintenance rapid repair unit with ₹25,000 sanctioned budget.',
  },
  {
    complaintId: 'CBE-CRK-2026-002',
    citizenEmail: 'citizen2@civiceye.demo',
    citizenName: 'Priya Ramanathan',
    issueType: 'cracking',
    title: 'Transverse & Longitudinal Joint Pavement Fissures',
    description: 'Continuous 15-meter longitudinal fissure along vehicular wheel path allowing moisture penetration into subgrade.',
    latitude: 11.0267,
    longitude: 77.0142,
    region: 'Peelamedu',
    roadName: 'Avinashi Road (NH 544 Link)',
    roadType: 'Major Arterial',
    finalStatus: 'Assigned',
    inspectionStatus: 'VALID',
    confidence: 92.4,
    priority: 'MEDIUM',
    severity: 'Medium',
    maintenanceAuthority: 'Road Maintenance Department',
    departmentCode: 'ROAD',
    imageUri: 'https://images.unsplash.com/photo-1584467735815-f778f274e296?auto=format&fit=crop&w=800&q=80',
    daysAgo: 3,
    assignedInspectorName: 'Ravi Chandran (Inspector #104)',
    inspectorRemarks: 'Longitudinal joint crack verified over 15m. Crack sealing polymer application scheduled.',
  },
  {
    complaintId: 'CBE-ALG-2026-003',
    citizenEmail: 'citizen1@civiceye.demo',
    citizenName: 'Nithya Sundar',
    issueType: 'alligator cracking',
    title: 'Extensive Alligator Fatigue Cracking & Base Failure',
    description: 'Interconnected polygonal cracking pattern over a 12-meter stretch indicating severe load-induced asphalt fatigue.',
    latitude: 11.0342,
    longitude: 76.9821,
    region: 'Ganapathy',
    roadName: 'Sathy Main Road (SH 15)',
    roadType: 'State Highway',
    finalStatus: 'Resolved',
    inspectionStatus: 'VALID',
    confidence: 94.6,
    priority: 'HIGH',
    severity: 'High',
    maintenanceAuthority: 'Road Maintenance Department',
    departmentCode: 'ROAD',
    imageUri: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
    daysAgo: 8,
    assignedInspectorName: 'Ravi Chandran (Inspector #104)',
    inspectorRemarks: 'Cold milling and 40mm Bituminous Concrete overlay applied. Surface smoothness and load capacity verified.',
    resolutionRemarks: 'Milling & hot-mix bituminous resurfacing completed by Road Maintenance Department Zonal Contractor.',
  },
  {
    complaintId: 'CBE-DIV-2026-004',
    citizenEmail: 'citizen3@civiceye.demo',
    citizenName: 'Karthik Subramanian',
    issueType: 'road divider damage',
    title: 'Displaced Concrete Median & Broken Crash Barrier',
    description: 'Central road median barrier fractured and displaced into fast lane. Severe collision hazard for nocturnal traffic.',
    latitude: 11.0142,
    longitude: 76.9691,
    region: 'Gandhipuram',
    roadName: '100 Feet Road, Gandhipuram',
    roadType: 'Major Arterial',
    finalStatus: 'In Progress',
    inspectionStatus: 'VALID',
    confidence: 96.1,
    priority: 'HIGH',
    severity: 'High',
    maintenanceAuthority: 'Traffic / Road Safety Department',
    departmentCode: 'SAFETY',
    imageUri: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80',
    daysAgo: 2,
    assignedInspectorName: 'Ravi Chandran (Inspector #104)',
    inspectorRemarks: 'Inspected on-site. 3 concrete median blocks shifted into carriageway. Heavy crane work order issued to Traffic Safety Wing.',
  },
  {
    complaintId: 'CBE-STL-2026-005',
    citizenEmail: 'citizen2@civiceye.demo',
    citizenName: 'Priya Ramanathan',
    issueType: 'street light fault',
    title: 'Damaged Streetlight Pole & Dangling Electrical Wire',
    description: 'High-mast streetlight pole bent at 40 degrees with exposed energized wiring near PSG Tech bus stop corridor.',
    latitude: 11.0312,
    longitude: 77.0189,
    region: 'Peelamedu',
    roadName: 'Peelamedu Airport Link Road',
    roadType: 'Bus Route Road',
    finalStatus: 'Assigned',
    inspectionStatus: 'VALID',
    confidence: 93.8,
    priority: 'HIGH',
    severity: 'High',
    maintenanceAuthority: 'Street Lighting Department',
    departmentCode: 'LIGHTING',
    imageUri: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=800&q=80',
    daysAgo: 3,
    assignedInspectorName: 'Ravi Chandran (Inspector #104)',
    inspectorRemarks: 'Hazardous electrical fixture verified. Power isolated at junction box; pole replacement line work scheduled.',
  },
  {
    complaintId: 'CBE-MNH-2026-006',
    citizenEmail: 'citizen1@civiceye.demo',
    citizenName: 'Nithya Sundar',
    issueType: 'manhole defect',
    title: 'Cracked & Sunken Drainage Manhole Chamber',
    description: 'Cast iron sewer chamber cover cracked through center with 15cm depression in the middle of travel lane.',
    latitude: 11.0452,
    longitude: 76.9712,
    region: 'Maniyakarampalayam',
    roadName: 'Maniyakarampalayam Main Road',
    roadType: 'Corporation Ward Road',
    finalStatus: 'Verified',
    inspectionStatus: 'VALID',
    confidence: 96.5,
    priority: 'HIGH',
    severity: 'High',
    maintenanceAuthority: 'Water Supply & Drainage Department',
    departmentCode: 'TWAD',
    imageUri: 'https://images.unsplash.com/photo-1578328819058-b69f3a3b0f6b?auto=format&fit=crop&w=800&q=80',
    daysAgo: 1,
    assignedInspectorName: 'Ravi Chandran (Inspector #104)',
    inspectorRemarks: 'Chamber rim collapsed from heavy axle loading. New ductile iron frame requisitioned for TWAD drainage crew.',
  },
  {
    complaintId: 'CBE-WTR-2026-007',
    citizenEmail: 'citizen3@civiceye.demo',
    citizenName: 'Karthik Subramanian',
    issueType: 'waterlogging',
    title: 'Severe Carriageway Waterlogging & Choked Catchpit',
    description: 'Over 30 meters of stagnant rainwater accumulating after brief shower. Stormwater inlet completely blocked by silt.',
    latitude: 11.0171,
    longitude: 76.9682,
    region: 'Gandhipuram',
    roadName: 'Dr. Nanjappa Road, Gandhipuram',
    roadType: 'Commercial Corridor',
    finalStatus: 'In Progress',
    inspectionStatus: 'VALID',
    confidence: 91.7,
    priority: 'HIGH',
    severity: 'High',
    maintenanceAuthority: 'Water Supply & Drainage Department',
    departmentCode: 'TWAD',
    imageUri: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=800&q=80',
    daysAgo: 4,
    assignedInspectorName: 'Ravi Chandran (Inspector #104)',
    inspectorRemarks: 'High-pressure suction jetting machine deployed to clear clogged 450mm stormwater drainage pipe.',
  },
  {
    complaintId: 'CBE-PWD-2026-008',
    citizenEmail: 'citizen2@civiceye.demo',
    citizenName: 'Priya Ramanathan',
    issueType: 'Public Route Issue',
    title: 'Collapsed Public Route Footpath & Paver Subgrade Failure',
    description: 'Public government corridor pedestrian walkway collapsed with broken kerb stones and eroded sub-base along PWD arterial link.',
    latitude: 11.0289,
    longitude: 77.0098,
    region: 'Peelamedu',
    roadName: 'Bharathi Colony Road (PWD Route)',
    roadType: 'Major Arterial',
    finalStatus: 'Pending Field Verification',
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
    citizenEmail: 'citizen1@civiceye.demo',
    citizenName: 'Nithya Sundar',
    issueType: 'debris / road blockage',
    title: 'Highway Construction Debris & Aggregate Rubble Dump',
    description: 'Unorganized pile of building aggregate, concrete chunks, and tree limbs obstructing the left travel lane.',
    latitude: 11.0389,
    longitude: 76.9631,
    region: 'Maniyakarampalayam',
    roadName: 'Nallampalayam Link Road',
    roadType: 'Corporation Ward Road',
    finalStatus: 'Closed',
    inspectionStatus: 'VALID',
    confidence: 92.5,
    priority: 'MEDIUM',
    severity: 'Medium',
    maintenanceAuthority: 'Solid Waste Management Department',
    departmentCode: 'SWM',
    imageUri: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=800&q=80',
    daysAgo: 10,
    assignedInspectorName: 'Ravi Chandran (Inspector #104)',
    inspectorRemarks: 'Debris completely cleared by CCMC SWM JCB loaders. Roadway fully swept and restored.',
    resolutionRemarks: 'Citizen verified rapid 24-hour obstacle removal and road clearance.',
  },
  {
    complaintId: 'CBE-SGN-2026-010',
    citizenEmail: 'citizen3@civiceye.demo',
    citizenName: 'Karthik Subramanian',
    issueType: 'missing signage',
    title: 'Damaged Speed Limit Signboard & Broken Reflector Pole',
    description: 'School zone 30 km/h speed limit and pedestrian crossing sign knocked down by storm, lying on walkway curb.',
    latitude: 11.0298,
    longitude: 76.9892,
    region: 'Ganapathy',
    roadName: 'Ganapathy Bus Stand Link Road',
    roadType: 'Bus Route Road',
    finalStatus: 'Verified',
    inspectionStatus: 'VALID',
    confidence: 88.3,
    priority: 'MEDIUM',
    severity: 'Medium',
    maintenanceAuthority: 'Traffic / Road Safety Department',
    departmentCode: 'SAFETY',
    imageUri: 'https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=800&q=80',
    daysAgo: 5,
    assignedInspectorName: 'Ravi Chandran (Inspector #104)',
    inspectorRemarks: 'Verified school safety sign damage. Replacement retro-reflective signboard fabricated and scheduled for installation.',
  },
];

function getStandardEstimatedBudget(issueType, priority) {
  const norm = (issueType || '').toLowerCase();
  if (norm.includes('pothole')) {
    return priority === 'HIGH' ? { budget: 25000, days: 3 } : { budget: 12000, days: 5 };
  }
  if (norm.includes('alligator')) {
    return priority === 'HIGH' ? { budget: 35000, days: 5 } : { budget: 18000, days: 7 };
  }
  if (norm.includes('crack')) {
    return priority === 'HIGH' ? { budget: 28000, days: 4 } : { budget: 15000, days: 6 };
  }
  if (norm.includes('divider')) {
    return priority === 'HIGH' ? { budget: 45000, days: 4 } : { budget: 20000, days: 7 };
  }
  if (norm.includes('street light')) {
    return priority === 'HIGH' ? { budget: 12000, days: 2 } : { budget: 6000, days: 3 };
  }
  if (norm.includes('manhole')) {
    return priority === 'HIGH' ? { budget: 30000, days: 2 } : { budget: 15000, days: 4 };
  }
  if (norm.includes('waterlogging')) {
    return priority === 'HIGH' ? { budget: 30000, days: 3 } : { budget: 15000, days: 5 };
  }
  if (norm.includes('debris') || norm.includes('garbage')) {
    return priority === 'HIGH' ? { budget: 15000, days: 1 } : { budget: 8000, days: 2 };
  }
  if (norm.includes('signage')) {
    return priority === 'HIGH' ? { budget: 18000, days: 3 } : { budget: 10000, days: 5 };
  }
  if (norm.includes('public') || norm.includes('pwd')) {
    return priority === 'HIGH' ? { budget: 35000, days: 5 } : { budget: 18000, days: 8 };
  }
  return { budget: 20000, days: 5 };
}

async function getOrCreateUser(email, password, userData) {
  let user;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    user = cred.user;
  } catch (err) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        user = cred.user;
      } catch (createErr) {
        if (createErr.code === 'auth/email-already-in-use') {
          const cred = await signInWithEmailAndPassword(auth, email, password);
          user = cred.user;
        } else {
          throw createErr;
        }
      }
    } else {
      throw err;
    }
  }

  // Write the user's own profile at users/{user.uid}
  // This satisfies request.auth.uid == userId rule with 100% security
  await setDoc(doc(db, 'users', user.uid), cleanDocData({
    ...userData,
    uid: user.uid,
    email: user.email,
    updatedAt: serverTimestamp(),
  }), { merge: true });

  return user;
}

export async function runSeed(currentUserId, currentEmail) {
  console.log('======================================================');
  console.log('CivicEye Server/Admin Demo Data Seeding Script');
  console.log('======================================================\n');

  const userUidMap = new Map(); // email -> uid
  let seededUsers = 0;
  let seededComplaints = 0;

  console.log('1. Setting up Demo Users & Profiles (authenticated per user)...');
  for (const u of DEMO_SYSTEM_USERS) {
    try {
      const authUser = await getOrCreateUser(u.email, DEFAULT_DEMO_PASSWORD, u);
      userUidMap.set(u.email, authUser.uid);
      seededUsers++;
      console.log(`   + User: ${u.email} -> UID: ${authUser.uid} (${u.role})`);
    } catch (userErr) {
      console.warn(`   ! Warning setting up user ${u.email}:`, userErr.message);
    }
  }

  console.log('\n2. Creating Initial Citizen Complaints (Initial Status: Submitted)...');
  const now = Date.now();

  // Authenticate as Main Officer to authorize batch writes under security rules (isMainOfficer() == true)
  await signInWithEmailAndPassword(auth, 'officer.pwd@civiceye.demo', DEFAULT_DEMO_PASSWORD);

  for (const item of SYNTHETIC_COMPLAINTS_CATALOG) {
    try {
      const citizenUid = (currentUserId && (item.citizenEmail === 'citizen1@civiceye.demo'))
        ? currentUserId
        : (userUidMap.get(item.citizenEmail) || item.citizenEmail);

      const citizenEmail = (currentEmail && (item.citizenEmail === 'citizen1@civiceye.demo'))
        ? currentEmail
        : item.citizenEmail;

      const createdAtDate = new Date(now - item.daysAgo * 86400000);
      const practical = calculatePracticalBudget(item.issueType, item.priority);

      const initialComplaint = {
        complaintId: item.complaintId,
        citizenId: citizenUid,
        citizenEmail,
        citizenName: item.citizenName,
        issueType: item.issueType,
        title: item.title,
        description: item.description,
        latitude: item.latitude,
        longitude: item.longitude,
        region: item.region,
        roadName: item.roadName,
        roadType: item.roadType,
        status: 'Submitted',
        inspectionStatus: 'PENDING',
        confidence: item.confidence,
        priority: item.priority,
        severity: item.severity,
        maintenanceAuthority: item.maintenanceAuthority,
        departmentCode: item.departmentCode,
        estimatedBudget: practical.budget,
        estimatedBudgetDesc: practical.description,
        budgetBreakdown: practical,
        imageUri: item.imageUri,
        roadValidationResult: 'road',
        roadValidationConfidence: 0.98,
        analysisStatus: 'damage_detected',
        AI_prediction: item.issueType,
        AI_confidence: item.confidence,
        AI_validation: 'road',
        AI_timestamp: Timestamp.fromDate(createdAtDate),
        createdAt: Timestamp.fromDate(createdAtDate),
        updatedAt: Timestamp.fromDate(createdAtDate),
      };

      await setDoc(doc(db, 'complaints', item.complaintId), cleanDocData(initialComplaint), { merge: true });
      seededComplaints++;
      console.log(`   + Submitted Complaint: ${item.complaintId} [${item.region}] - ${item.title}`);
    } catch (compErr) {
      console.warn(`   ! Error writing complaint ${item.complaintId}:`, compErr.message);
    }
  }

  console.log('\n3. Officer Workflow Updates (Assignments, Inspections, Resolutions)...');
  try {
    // Authenticate as Officer Murugesan to apply official status workflows
    await signInWithEmailAndPassword(auth, 'officer.pwd@civiceye.demo', DEFAULT_DEMO_PASSWORD);

    for (const item of SYNTHETIC_COMPLAINTS_CATALOG) {
      if (item.finalStatus === 'Submitted') continue;

      const updatedAtDate = new Date(now - (item.daysAgo > 1 ? item.daysAgo - 1 : 0) * 86400000);
      const practical = calculatePracticalBudget(item.issueType, item.priority);

      const officerUpdate = {
        status: item.finalStatus,
        inspectionStatus: item.inspectionStatus,
        estimatedBudget: practical.budget,
        estimatedBudgetDesc: practical.description,
        budgetBreakdown: practical,
        assignedInspectorName: item.assignedInspectorName,
        assignedAt: item.assignedInspectorName ? Timestamp.fromDate(new Date(now - (item.daysAgo - 0.5) * 86400000)) : undefined,
        inspectionDetails: item.inspectionStatus === 'VALID' ? {
          isIssuePresent: true,
          verifiedIssue: item.issueType,
          severity: item.priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
          estimatedResolutionDays: practical.estimatedDays,
          estimatedBudget: practical.budget,
          estimatedBudgetDesc: practical.description,
          budgetBreakdown: practical,
          roadName: item.roadName,
          roadType: item.roadType,
          region: item.region,
          maintenanceAuthority: item.maintenanceAuthority,
          departmentName: item.maintenanceAuthority,
          inspectorRemarks: item.inspectorRemarks || 'Verified road hazard on-site.',
          inspectedAt: Timestamp.fromDate(updatedAtDate),
          inspectedByName: item.assignedInspectorName || 'Ravi Chandran',
        } : undefined,
        resolutionDetails: (item.finalStatus === 'Resolved' || item.finalStatus === 'Closed') ? {
          resolvedAt: Timestamp.fromDate(updatedAtDate),
          resolvedByName: 'Er. S. Murugesan (Divisional Engineer)',
          resolutionRemarks: item.resolutionRemarks || 'Completed on-site works per specification.',
        } : undefined,
        updatedAt: Timestamp.fromDate(updatedAtDate),
      };

      await updateDoc(doc(db, 'complaints', item.complaintId), cleanDocData(officerUpdate));
      console.log(`   + Updated ${item.complaintId} -> Status: "${item.finalStatus}"`);
    }
  } catch (officerErr) {
    console.warn('   ! Warning during officer updates:', officerErr.message);
  }

  await signOut(auth).catch(() => {});
  console.log(`\n✅ Finished seeding: ${seededUsers} users and ${seededComplaints} complaints into Firestore.\n`);
  return { success: true, count: seededComplaints, users: seededUsers };
}

// If run directly from CLI
if (process.argv[1] && process.argv[1].endsWith('seed_demo_data.mjs')) {
  runSeed().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('❌ Error executing seed:', err);
    process.exit(1);
  });
}
