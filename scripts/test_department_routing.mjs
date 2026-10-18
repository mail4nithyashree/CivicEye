import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';

// ============================================================================
// Keyword & Rule-Based Department Classification Engine (Mirrors departmentMapping.ts)
// ============================================================================

const DEPARTMENTS_CONFIG = {
  ROAD: {
    code: 'ROAD',
    name: 'Road Maintenance',
    responsibleDepartment: 'Road Maintenance',
    label: 'PWD / Road Infrastructure',
    icon: 'construct-outline',
    badgeColor: '#2563EB',
    badgeBg: '#EFF6FF',
    keywords: [
      'pothole',
      'potholes',
      'road damage',
      'road crack',
      'road cracks',
      'broken road',
      'damaged road',
      'asphalt',
      'tar road',
      'surface wear',
      'uneven road',
      'crater',
      'manhole cover',
      'speed breaker',
      'road cave-in',
      'pavement defect',
    ],
  },
  WATER: {
    code: 'WATER',
    name: 'Water Supply',
    responsibleDepartment: 'Water Supply',
    label: 'Municipal Water Board',
    icon: 'water-outline',
    badgeColor: '#0284C7',
    badgeBg: '#F0F9FF',
    keywords: [
      'water leak',
      'water leakage',
      'pipe leak',
      'pipe leakage',
      'pipe burst',
      'broken pipe',
      'leaking pipe',
      'water supply',
      'no water',
      'low water pressure',
      'water contamination',
      'dirty water',
      'pipeline damage',
      'water line',
      'water pipe',
      'main line burst',
      'drinking water',
    ],
  },
  ELEC: {
    code: 'ELEC',
    name: 'Streetlight / Electrical',
    responsibleDepartment: 'Streetlight / Electrical',
    label: 'Electricity & Street Lighting',
    icon: 'flash-outline',
    badgeColor: '#D97706',
    badgeBg: '#FFFBEB',
    keywords: [
      'streetlight',
      'street light',
      'street lights',
      'lamp post',
      'light pole',
      'broken light',
      'dim light',
      'flickering light',
      'hanging wire',
      'electric wire',
      'sparking',
      'short circuit',
      'power outage',
      'transformer fault',
      'dark street',
      'light not working',
      'light not glowing',
    ],
  },
  DRAIN: {
    code: 'DRAIN',
    name: 'Drainage / Sewerage',
    responsibleDepartment: 'Drainage / Sewerage',
    label: 'Drainage & Sewerage Board',
    icon: 'git-network-outline',
    badgeColor: '#7C3AED',
    badgeBg: '#F5F3FF',
    keywords: [
      'drain',
      'drainage',
      'blocked drain',
      'drain blockage',
      'clogged drain',
      'sewage',
      'sewer',
      'sewerage',
      'overflowing sewage',
      'open gutter',
      'gutter overflow',
      'stagnant water',
      'drain water',
      'waterlogging',
      'sewage smell',
      'foul smell from drain',
    ],
  },
  SAN: {
    code: 'SAN',
    name: 'Garbage / Sanitation',
    responsibleDepartment: 'Garbage / Sanitation',
    label: 'Sanitation & Solid Waste',
    icon: 'trash-outline',
    badgeColor: '#059669',
    badgeBg: '#ECFDF5',
    keywords: [
      'garbage',
      'trash',
      'waste',
      'rubbish',
      'overflowing bin',
      'garbage dump',
      'illegal dumping',
      'uncollected garbage',
      'litter',
      'debris',
      'dead animal',
      'sanitation',
      'dirty street',
      'waste pile',
      'dustbin broken',
    ],
  },
};

function classifyDepartmentFromDescription(description, aiOriginalDepartment = 'Road Maintenance') {
  if (!description || typeof description !== 'string') {
    const roadDept = DEPARTMENTS_CONFIG.ROAD;
    return {
      department: roadDept.name,
      departmentCode: roadDept.code,
      departmentSource: 'ai_default',
      routingStatus: 'Direct',
      routingMessage: `Assigned directly to ${roadDept.name}.`,
      originalDepartment: aiOriginalDepartment,
      matchedKeywords: [],
      departmentExplanation: `Default municipal routing: assigned to ${roadDept.name}.`,
    };
  }

  const normalizedDesc = description.toLowerCase();
  const candidates = [
    DEPARTMENTS_CONFIG.WATER,
    DEPARTMENTS_CONFIG.ELEC,
    DEPARTMENTS_CONFIG.DRAIN,
    DEPARTMENTS_CONFIG.SAN,
    DEPARTMENTS_CONFIG.ROAD,
  ];

  const matchResults = [];

  for (const dept of candidates) {
    const matched = [];
    for (const kw of dept.keywords) {
      const regex = new RegExp(`\\b${kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (regex.test(normalizedDesc)) {
        matched.push(kw);
      }
    }
    if (matched.length > 0) {
      matchResults.push({ dept, count: matched.length, matched });
    }
  }

  matchResults.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const aIsNonRoad = a.dept.code !== 'ROAD' ? 1 : 0;
    const bIsNonRoad = b.dept.code !== 'ROAD' ? 1 : 0;
    return bIsNonRoad - aIsNonRoad;
  });

  if (matchResults.length > 0) {
    const topMatch = matchResults[0];
    const isMoved = topMatch.dept.name !== aiOriginalDepartment;

    return {
      department: topMatch.dept.name,
      departmentCode: topMatch.dept.code,
      departmentSource: 'keyword_rule',
      routingStatus: isMoved ? 'Moved' : 'Direct',
      routingMessage: isMoved
        ? `Your complaint has been moved to the ${topMatch.dept.name} Department based on your description.`
        : `Assigned directly to ${topMatch.dept.name}.`,
      originalDepartment: aiOriginalDepartment,
      matchedKeywords: topMatch.matched,
      departmentExplanation: `Identified keywords (${topMatch.matched.join(', ')}). ${
        isMoved ? `Moved from ${aiOriginalDepartment} to ${topMatch.dept.name}.` : `Assigned to ${topMatch.dept.name}.`
      }`,
    };
  }

  const roadDept = DEPARTMENTS_CONFIG.ROAD;
  return {
    department: roadDept.name,
    departmentCode: roadDept.code,
    departmentSource: 'ai_default',
    routingStatus: 'Direct',
    routingMessage: `Assigned directly to ${roadDept.name}.`,
    originalDepartment: aiOriginalDepartment,
    matchedKeywords: [],
    departmentExplanation: `No specific non-road keywords identified. Assigned to ${roadDept.name}.`,
  };
}

// ============================================================================
// Firebase Integration Setup
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyBhc69f1641f1CwYmHFU3JBed9EJxwIaAE",
  authDomain: "civiceye-21b88.firebaseapp.com",
  projectId: "civiceye-21b88",
  storageBucket: "civiceye-21b88.firebasestorage.app",
  messagingSenderId: "819267334108",
  appId: "1:819267334108:web:aa1eb5f0cc91edd068a919",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function runTestSuite() {
  console.log(`\n======================================================`);
  console.log(`CivicEye Multi-Department Routing Verification Suite`);
  console.log(`======================================================\n`);

  let testCount = 0;
  let passCount = 0;

  function assert(name, condition) {
    testCount++;
    if (condition) {
      passCount++;
      console.log(`✅ TEST ${testCount} PASSED: ${name}`);
    } else {
      console.error(`❌ TEST ${testCount} FAILED: ${name}`);
    }
  }

  // --------------------------------------------------------------------------
  // SECTION 1: Pure Keyword & Rule-Based Classification Logic Tests
  // --------------------------------------------------------------------------
  console.log(`--- SECTION 1: Classification Engine Keyword Tests ---`);

  // Test 1: Road Maintenance
  const roadRes = classifyDepartmentFromDescription("There is a large pothole and road damage near the bus stand.");
  assert("Road Maintenance: identifies pothole & road damage",
    roadRes.department === "Road Maintenance" &&
    roadRes.departmentCode === "ROAD" &&
    roadRes.routingStatus === "Direct" &&
    roadRes.matchedKeywords.includes("pothole")
  );

  // Test 2: Water Supply
  const waterRes = classifyDepartmentFromDescription("Main water pipe leak causing heavy drinking water waste on 5th avenue.");
  assert("Water Supply: identifies water pipe & water leak",
    waterRes.department === "Water Supply" &&
    waterRes.departmentCode === "WATER" &&
    waterRes.routingStatus === "Moved" &&
    waterRes.matchedKeywords.some(k => k.includes('leak') || k.includes('water'))
  );

  // Test 3: Streetlight / Electrical
  const elecRes = classifyDepartmentFromDescription("Street light not working at crossroad and electric wire sparking.");
  assert("Streetlight / Electrical: identifies street light & electric wire",
    elecRes.department === "Streetlight / Electrical" &&
    elecRes.departmentCode === "ELEC" &&
    elecRes.routingStatus === "Moved" &&
    elecRes.matchedKeywords.some(k => k.includes('street light') || k.includes('electric wire'))
  );

  // Test 4: Drainage / Sewerage
  const drainRes = classifyDepartmentFromDescription("Blocked drain causing severe sewage overflow and gutter overflow.");
  assert("Drainage / Sewerage: identifies blocked drain & sewage",
    drainRes.department === "Drainage / Sewerage" &&
    drainRes.departmentCode === "DRAIN" &&
    drainRes.routingStatus === "Moved" &&
    drainRes.matchedKeywords.some(k => k.includes('drain') || k.includes('sewage'))
  );

  // Test 5: Garbage / Sanitation
  const sanRes = classifyDepartmentFromDescription("Overflowing garbage bin and uncollected trash piling up.");
  assert("Garbage / Sanitation: identifies overflowing bin & trash",
    sanRes.department === "Garbage / Sanitation" &&
    sanRes.departmentCode === "SAN" &&
    sanRes.routingStatus === "Moved" &&
    sanRes.matchedKeywords.some(k => k.includes('garbage') || k.includes('trash'))
  );

  // Test 6: Fallback for generic / non-matching description
  const fallbackRes = classifyDepartmentFromDescription("Please inspect the issue near my front gate.");
  assert("Fallback: Defaults to Road Maintenance with Direct status",
    fallbackRes.department === "Road Maintenance" &&
    fallbackRes.departmentCode === "ROAD" &&
    fallbackRes.routingStatus === "Direct"
  );

  // Test 7: Empty / Null description fallback
  const nullRes = classifyDepartmentFromDescription(null);
  assert("Null/Empty input fallback: Defaults to Road Maintenance",
    nullRes.department === "Road Maintenance" &&
    nullRes.departmentCode === "ROAD" &&
    nullRes.routingStatus === "Direct"
  );

  // --------------------------------------------------------------------------
  // SECTION 2: End-to-End Firestore Persistence & Multi-Role Lifecycle
  // --------------------------------------------------------------------------
  console.log(`\n--- SECTION 2: Firestore End-to-End Persistence & Overrides ---`);

  try {
    // 1. Authenticate as Main Officer
    const officerCred = await signInWithEmailAndPassword(
      auth,
      'officer.pwd@civiceye.demo',
      'Password@123'
    );
    assert("Main Officer Authentication for Integration Tests", !!officerCred.user.uid);

    // 2. Simulate Citizen Submitting a Water Supply Complaint
    const testComplaintRef = await addDoc(collection(db, 'complaints'), {
      citizenId: officerCred.user.uid,
      citizenEmail: 'citizen.test@civiceye.org',
      imageUri: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7',
      issueType: 'Pothole', // AI classified image as Pothole
      confidence: 89,
      severity: 'HIGH',
      priority: 'HIGH',
      status: 'Submitted',
      latitude: 12.9716,
      longitude: 77.5946,
      description: 'Water pipe burst with severe water leakage flooding the street',
      // Multi-department routing fields
      department: waterRes.department,
      departmentCode: waterRes.departmentCode,
      responsibleDepartment: waterRes.department,
      departmentSource: waterRes.departmentSource,
      routingStatus: waterRes.routingStatus,
      routingMessage: waterRes.routingMessage,
      originalDepartment: waterRes.originalDepartment,
      departmentExplanation: waterRes.departmentExplanation,
      inspectionStatus: 'PENDING',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const complaintId = testComplaintRef.id;
    assert(`Create Complaint with auto-routed department (Doc ID: ${complaintId})`, !!complaintId);

    // 3. Read back and verify all department fields
    const snap = await getDoc(testComplaintRef);
    const data = snap.data();
    assert("Firestore document retains department: 'Water Supply'", data.department === 'Water Supply');
    assert("Firestore document retains departmentCode: 'WATER'", data.departmentCode === 'WATER');
    assert("Firestore document retains routingStatus: 'Moved'", data.routingStatus === 'Moved');
    assert("Firestore document retains routingMessage", typeof data.routingMessage === 'string' && data.routingMessage.includes('Water Supply'));
    assert("Firestore document retains departmentExplanation", typeof data.departmentExplanation === 'string' && data.departmentExplanation.includes('keywords'));

    // 4. Test Manual Officer Department Reassignment (e.g. Inspector changes to Drainage)
    const targetDept = DEPARTMENTS_CONFIG.DRAIN;
    const nowIso = new Date().toISOString();
    const reassignmentAudit = {
      fromDepartment: data.department,
      toDepartment: targetDept.name,
      toDepartmentCode: targetDept.code,
      changedByRole: 'main_officer',
      changedByEmail: officerCred.user.email,
      changedAt: nowIso,
      remarks: 'Verified on-site: Leak is actually from municipal sewer line drainage blockage.',
    };

    await updateDoc(doc(db, 'complaints', complaintId), {
      department: targetDept.name,
      departmentCode: targetDept.code,
      responsibleDepartment: targetDept.name,
      departmentSource: 'officer_override',
      routingStatus: 'Moved',
      routingMessage: `Complaint reassigned to ${targetDept.name} Department by officer.`,
      departmentExplanation: `Officer reassigned: Verified on-site: Leak is actually from municipal sewer line drainage blockage.`,
      departmentReassignments: [reassignmentAudit],
      updatedAt: serverTimestamp(),
    });

    const updatedSnap = await getDoc(testComplaintRef);
    const updatedData = updatedSnap.data();
    assert("Manual Reassignment: Department updated to 'Drainage / Sewerage'", updatedData.department === 'Drainage / Sewerage');
    assert("Manual Reassignment: departmentSource set to 'officer_override'", updatedData.departmentSource === 'officer_override');
    assert("Manual Reassignment: Audit trail array recorded", Array.isArray(updatedData.departmentReassignments) && updatedData.departmentReassignments.length === 1);
    assert("Manual Reassignment: Audit trail captures changedByEmail", updatedData.departmentReassignments[0].changedByEmail === officerCred.user.email);

    // 5. Verify status transition and field inspector validation readiness
    await updateDoc(doc(db, 'complaints', complaintId), {
      status: 'Resolved',
      updatedAt: serverTimestamp(),
    });
    const finalSnap = await getDoc(testComplaintRef);
    assert("Complaint lifecycle completion (status: Resolved)", finalSnap.data().status === 'Resolved');

  } catch (err) {
    console.error("Firestore integration test error:", err);
    assert("Firestore integration tests executed without uncaught exception", false);
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log(`\n======================================================`);
  console.log(`SUMMARY: ${passCount} / ${testCount} Tests Passed (${Math.round((passCount / testCount) * 100)}%)`);
  console.log(`======================================================\n`);

  if (passCount === testCount) {
    console.log(`🎉 ALL TESTS PASSED! Multi-Department Routing is fully functional.`);
    process.exit(0);
  } else {
    console.error(`⚠️ SOME TESTS FAILED.`);
    process.exit(1);
  }
}

runTestSuite();
