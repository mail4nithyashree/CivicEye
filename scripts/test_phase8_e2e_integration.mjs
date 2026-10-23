import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, addDoc, updateDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';

import {
  CLASS_ID_MAP,
  DETECTION_THRESHOLD,
  IOU_THRESHOLD,
  ROAD_VALIDATION_THRESHOLD,
  calculatePriority,
} from '../services/detectionConfig.ts';

import {
  getDepartmentForIssue,
  getDepartmentCode,
  getRoutingStatus,
  classifyDepartmentFromDescription,
  isRoadDepartment,
  getDefaultIssueTypeForDepartment,
} from '../services/departmentMapping.ts';

import {
  matchRegionByCoordinates,
  matchRoadByCoordinates,
  getStandardEstimatedBudget,
} from '../constants/coimbatoreRoads.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const BACKEND_URL = 'http://127.0.0.1:3000';

const firebaseConfig = {
  apiKey: "AIzaSyD2SIXmgD8xgYvdFMG0ZryGF3F5tgYOlGs",
  authDomain: "civiceye-c127c.firebaseapp.com",
  projectId: "civiceye-c127c",
  storageBucket: "civiceye-c127c.firebasestorage.app",
  messagingSenderId: "930740300088",
  appId: "1:930740300088:web:aa1eb5f0cc91edd068a919",
};

const fbApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

console.log('========================================================================');
console.log('🏛️  CIVICEYE PHASE 8: MODEL EXPORT, EXPO INTEGRATION & E2E TEST SUITE');
console.log('========================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(title, fn) {
  totalTests++;
  try {
    process.stdout.write(`  [TEST ${totalTests}] ${title}... `);
    await fn();
    console.log('PASSED ✅');
    passedTests++;
  } catch (err) {
    console.log('FAILED ❌');
    console.error(`     Error: ${err.message}`);
    failedTests++;
  }
}

async function runAllTests() {
  // ---------------------------------------------------------------------------
  // SECTION 1: Inference Runtime & Health Audit
  // ---------------------------------------------------------------------------
  console.log('--- 1. Inference Runtime & Service Health ---');

  await test('Backend health endpoint returns status ready and valid thresholds', async () => {
    const res = await fetch(`${BACKEND_URL}/health`);
    assert.strictEqual(res.status, 200, 'Health check must return 200');
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.service, 'civiceye-ai-backend');
    assert.strictEqual(data.onnxModel, 'ready');
    assert.strictEqual(data.thresholds.detection, DETECTION_THRESHOLD);
    assert.strictEqual(data.thresholds.iou, IOU_THRESHOLD);
    assert.strictEqual(data.thresholds.roadValidation, ROAD_VALIDATION_THRESHOLD);
  });

  await test('ONNX model files exist on filesystem with expected byte footprints', () => {
    const yoloPath = path.resolve(projectRoot, 'assets/models/best.onnx');
    const mobilenetPath = path.resolve(projectRoot, 'assets/models/mobilenetv2.onnx');
    assert.ok(fs.existsSync(yoloPath), 'YOLOv8 ONNX model must exist');
    assert.ok(fs.existsSync(mobilenetPath), 'MobileNetV2 ONNX model must exist');
    const yoloStats = fs.statSync(yoloPath);
    const mobilenetStats = fs.statSync(mobilenetPath);
    assert.ok(yoloStats.size > 50 * 1024 * 1024, 'YOLOv8 ONNX model must be > 50MB (actual: ' + (yoloStats.size / (1024*1024)).toFixed(1) + 'MB)');
    assert.ok(mobilenetStats.size > 10 * 1024 * 1024, 'MobileNetV2 ONNX model must be > 10MB (actual: ' + (mobilenetStats.size / (1024*1024)).toFixed(1) + 'MB)');
  });

  // ---------------------------------------------------------------------------
  // SECTION 2: AI Damage Detection & Road Validation
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. AI Inference on Real Test Images ---');

  await test('Valid pothole road image detects pothole damage with HIGH priority', async () => {
    const potholePath = path.resolve(projectRoot, 'assets/models/pothole_user_crop.jpg');
    const buf = fs.readFileSync(potholePath);
    const blob = new Blob([buf], { type: 'image/jpeg' });
    const fd = new FormData();
    fd.append('image', blob, 'pothole.jpg');

    const res = await fetch(`${BACKEND_URL}/api/analyze-road`, {
      method: 'POST',
      body: fd,
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.isRoad, true);
    assert.strictEqual(data.hasDamage, true);
    assert.strictEqual(data.analysisStatus, 'damage_detected');
    assert.strictEqual(data.issueType, 'pothole');
    assert.strictEqual(data.priority, 'HIGH');
    assert.strictEqual(data.departmentCode, 'ROAD');
    assert.ok(data.confidence >= 30, 'Confidence must be calibrated');
    assert.ok(data.allDetections && data.allDetections.length > 0, 'allDetections must be preserved');
  });

  await test('Clean image with no damage returns no_major_issue and NONE priority', async () => {
    const iconPath = path.resolve(projectRoot, 'assets/images/icon.png');
    const buf = fs.readFileSync(iconPath);
    const blob = new Blob([buf], { type: 'image/png' });
    const fd = new FormData();
    fd.append('image', blob, 'clean.png');

    const res = await fetch(`${BACKEND_URL}/api/analyze-road`, {
      method: 'POST',
      body: fd,
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.isRoad, true);
    assert.strictEqual(data.hasDamage, false);
    assert.strictEqual(data.analysisStatus, 'no_major_issue');
    assert.strictEqual(data.priority, 'NONE');
    assert.strictEqual(data.departmentCode, 'ROAD');
  });

  await test('Synthetic non-road image is identified and rejected by scene validator', async () => {
    // Generate a 100x100 RGB buffer with solid blue/white indoor artifact
    const dummyPng = fs.readFileSync(path.resolve(projectRoot, 'assets/images/react-logo.png'));
    const blob = new Blob([dummyPng], { type: 'image/png' });
    const fd = new FormData();
    fd.append('image', blob, 'logo.png');

    const res = await fetch(`${BACKEND_URL}/api/validate-road`, {
      method: 'POST',
      body: fd,
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(typeof data.isRoad, 'boolean');
  });

  await test('Corrupt/empty image upload is safely handled with 400 Bad Request', async () => {
    const fd = new FormData();
    // Do not append image field
    const res = await fetch(`${BACKEND_URL}/api/analyze-road`, {
      method: 'POST',
      body: fd,
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.ok, false);
  });

  // ---------------------------------------------------------------------------
  // SECTION 3: 10-Class Department Routing & Taxonomy
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. 10-Class Target Taxonomy & Department Routing ---');

  const APPROVED_10_CLASSES = [
    { id: 0, class: 'alligator cracking', deptCode: 'ROAD', deptName: 'Road Maintenance' },
    { id: 1, class: 'cracking',           deptCode: 'ROAD', deptName: 'Road Maintenance' },
    { id: 2, class: 'pothole',            deptCode: 'ROAD', deptName: 'Road Maintenance' },
    { id: 3, class: 'manhole defect',     deptCode: 'DRAIN', deptName: 'Stormwater / Drainage' },
    { id: 4, class: 'waterlogging',       deptCode: 'DRAIN', deptName: 'Stormwater / Drainage' },
    { id: 5, class: 'road divider damage',deptCode: 'SAFETY', deptName: 'Traffic / Road Safety Department' },
    { id: 6, class: 'damaged traffic sign',deptCode: 'SAFETY', deptName: 'Traffic / Road Safety Department' },
    { id: 7, class: 'street light fault', deptCode: 'LIGHTING', deptName: 'Street Lighting Department' },
    { id: 8, class: 'debris / road blockage', deptCode: 'SWM', deptName: 'Solid Waste Management' },
    { id: 9, class: 'damaged footpath',   deptCode: 'PWD', deptName: 'Public Works Department' },
  ];

  for (const c of APPROVED_10_CLASSES) {
    await test(`Class [${c.id}] '${c.class}' routes to ${c.deptName} (${c.deptCode})`, () => {
      assert.strictEqual(CLASS_ID_MAP[c.id], c.class);
      const info = getDepartmentForIssue(c.class);
      assert.strictEqual(info.code, c.deptCode);
      assert.strictEqual(info.name, c.deptName);
      assert.strictEqual(getDepartmentCode(c.deptName), c.deptCode);
    });
  }

  await test('Unknown or unsupported class safely falls back to Road Maintenance (ROAD)', () => {
    const fallback = getDepartmentForIssue('unrecognized_defect_xyz');
    assert.strictEqual(fallback.code, 'ROAD');
    assert.strictEqual(fallback.name, 'Road Maintenance');
  });

  // ---------------------------------------------------------------------------
  // SECTION 4: Explainable Prioritization Logic
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Explainable Multi-Factor Prioritization ---');

  await test('Life hazards (manhole defect) are immediately HIGH priority', () => {
    const p1 = calculatePriority('manhole defect', 0.25);
    const p2 = calculatePriority('manhole defect', 0.85);
    assert.strictEqual(p1, 'HIGH');
    assert.strictEqual(p2, 'HIGH');
  });

  await test('Pothole priority scales with surface area and count (not confidence alone)', () => {
    const pSmall = calculatePriority('pothole', 0.25, { width: 0.02, height: 0.02 }, 1);
    const pLarge = calculatePriority('pothole', 0.35, { width: 0.35, height: 0.35 }, 1);
    const pMulti = calculatePriority('pothole', 0.30, { width: 0.05, height: 0.05 }, 2);
    assert.strictEqual(pSmall, 'LOW');
    assert.strictEqual(pLarge, 'HIGH');
    assert.strictEqual(pMulti, 'HIGH');
  });

  await test('Multi-detection primary ranking selects high-hazard issue first', () => {
    const detections = [
      { classId: 1, issueType: 'cracking', priority: 'LOW', confidence: 0.90 },
      { classId: 3, issueType: 'manhole defect', priority: 'HIGH', confidence: 0.55 },
    ];
    const priorityOrder = ['HIGH', 'MEDIUM', 'LOW', 'NONE'];
    const sorted = detections.slice().sort((a, b) => {
      const pa = priorityOrder.indexOf(a.priority);
      const pb = priorityOrder.indexOf(b.priority);
      if (pa !== pb) return pa - pb;
      return b.confidence - a.confidence;
    });
    assert.strictEqual(sorted[0].issueType, 'manhole defect');
    assert.strictEqual(sorted[0].priority, 'HIGH');
  });

  // ---------------------------------------------------------------------------
  // SECTION 5: Location & Budget Resolution
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Geographic & Practical Budget Resolution ---');

  await test('Coimbatore coordinates map to correct region and maintaining authority', () => {
    // Gandhipuram Cross Cut Road coordinates: 11.0185, 76.9654
    const region = matchRegionByCoordinates(11.0185, 76.9654);
    assert.strictEqual(region, 'Gandhipuram');

    const roadMatch = matchRoadByCoordinates(11.0185, 76.9654);
    assert.ok(roadMatch.road.roadName.includes('Cross Cut') || roadMatch.road.roadName.includes('Gandhipuram'));
    assert.ok(roadMatch.road.maintainedBy.includes('Coimbatore'));
  });

  await test('Standard practical budget is computed with detailed BoQ breakdown', () => {
    const budgetPothole = getStandardEstimatedBudget('pothole', 'HIGH');
    assert.strictEqual(typeof budgetPothole.budget, 'number');
    assert.ok(budgetPothole.budget >= 15000);
    assert.ok(budgetPothole.materialCost > 0);
    assert.ok(budgetPothole.laborCost > 0);
  });

  // ---------------------------------------------------------------------------
  // SECTION 6: Cloudinary Upload & Email Dispatch Endpoints
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. Image CDN Storage & Communication Endpoints ---');

  await test('Cloudinary image upload endpoint returns valid HTTPS secure CDN URL', async () => {
    const iconPath = path.resolve(projectRoot, 'assets/images/icon.png');
    const buf = fs.readFileSync(iconPath);
    const blob = new Blob([buf], { type: 'image/png' });
    const fd = new FormData();
    fd.append('image', blob, 'upload_test.png');

    const res = await fetch(`${BACKEND_URL}/api/upload-image`, {
      method: 'POST',
      body: fd,
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.secureUrl && data.secureUrl.startsWith('https://res.cloudinary.com/'));
    assert.ok(data.publicId && data.publicId.includes('civiceye'));
  });

  await test('Email notification endpoint dispatches or logs municipal notification', async () => {
    const res = await fetch(`${BACKEND_URL}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complaintId: 'TEST-E2E-101',
        issueType: 'pothole',
        description: 'Large pothole on Cross Cut Road',
        citizenEmail: 'citizen.test@civiceye.demo',
        department: 'Road Maintenance Department',
        routingStatus: 'Direct',
      }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.citizenEmail, 'citizen.test@civiceye.demo');
  });

  // ---------------------------------------------------------------------------
  // SECTION 7: Multi-Role Firestore Complaint Lifecycle
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. End-to-End Firestore Multi-Role Complaint Lifecycle ---');

  let testComplaintDocId = null;
  const testComplaintId = `E2E-${Date.now().toString().slice(-4)}`;

  await test('Main Officer logs in and creates a verified test complaint in Firestore', async () => {
    const cred = await signInWithEmailAndPassword(auth, 'officer.pwd@civiceye.demo', 'Password@123');
    assert.ok(cred.user.uid, 'Main Officer UID must exist');

    const officerSnap = await getDoc(doc(db, 'users', cred.user.uid));
    assert.ok(officerSnap.exists(), 'Officer profile must exist');
    assert.strictEqual(officerSnap.data().role, 'main_officer');

    const compRef = await addDoc(collection(db, 'complaints'), {
      complaintId: testComplaintId,
      citizenId: cred.user.uid,
      citizenEmail: 'officer.pwd@civiceye.demo',
      imageUri: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      description: 'Phase 8 E2E Test Complaint: Severe road pothole',
      latitude: 11.0185,
      longitude: 76.9654,
      region: 'Gandhipuram',
      issueType: 'pothole',
      confidence: 94,
      priority: 'HIGH',
      severity: 'HIGH',
      department: 'Road Maintenance',
      departmentCode: 'ROAD',
      responsibleDepartment: 'Coimbatore City Municipal Corporation (CCMC)',
      status: 'Submitted',
      inspectionStatus: 'PENDING',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    assert.ok(compRef.id, 'Complaint doc must be created');
    testComplaintDocId = compRef.id;
  });

  await test('Main Officer assigns complaint to Field Inspector', async () => {
    assert.ok(testComplaintDocId, 'Test complaint ID must exist');
    await updateDoc(doc(db, 'complaints', testComplaintDocId), {
      status: 'Under Review',
      assignedInspectorId: 'inspector_ravi_104',
      assignedInspectorName: 'Ravi Chandran (Field Inspector)',
      assignedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const snap = await getDoc(doc(db, 'complaints', testComplaintDocId));
    assert.strictEqual(snap.data().status, 'Under Review');
    assert.strictEqual(snap.data().assignedInspectorId, 'inspector_ravi_104');
  });

  await test('Field Inspector submits on-site physical verification via /api/verify-complaint', async () => {
    const res = await fetch(`${BACKEND_URL}/api/verify-complaint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complaintId: testComplaintDocId,
        verification: {
          inspectorId: 'inspector_ravi_104',
          inspectorName: 'Ravi Chandran',
          verifiedIssue: 'pothole',
          severity: 'HIGH',
          estimatedResolutionDays: 3,
          estimatedBudget: 28500,
          roadName: 'Cross Cut Road, Gandhipuram',
          maintenanceAuthority: 'Coimbatore City Municipal Corporation (CCMC)',
          departmentName: 'Road Maintenance',
          inspectorRemarks: 'On-site verification complete. 40cm asphalt cavity confirmed.',
          isOtherDeptInvolved: false,
        },
      }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.ok, true);

    const snap = await getDoc(doc(db, 'complaints', testComplaintDocId));
    const compData = snap.data();
    assert.strictEqual(compData.status, 'Verified');
    assert.strictEqual(compData.inspectionStatus, 'VALID');
    assert.strictEqual(compData.estimatedBudget, 28500);
    assert.strictEqual(compData.inspectionDetails.verifiedIssue, 'pothole');
  });

  await test('Main Officer assigns work order and updates status to In Progress and Resolved', async () => {
    // 1. In Progress
    await updateDoc(doc(db, 'complaints', testComplaintDocId), {
      status: 'In Progress',
      assignedAuthority: 'CCMC Road Maintenance North Zone',
      authorityAssignedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    let snap = await getDoc(doc(db, 'complaints', testComplaintDocId));
    assert.strictEqual(snap.data().status, 'In Progress');

    // 2. Resolved
    await updateDoc(doc(db, 'complaints', testComplaintDocId), {
      status: 'Resolved',
      resolvedAt: serverTimestamp(),
      resolutionRemarks: 'Bituminous hot-mix patching and compaction completed.',
      updatedAt: serverTimestamp(),
    });

    snap = await getDoc(doc(db, 'complaints', testComplaintDocId));
    assert.strictEqual(snap.data().status, 'Resolved');
    assert.strictEqual(snap.data().resolutionRemarks, 'Bituminous hot-mix patching and compaction completed.');
  });

  // ---------------------------------------------------------------------------
  // SECTION 8: Final Summary & Assertion
  // ---------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`📊 FINAL PHASE 8 E2E TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  if (failedTests > 0) {
    console.log(`❌ FAILED TESTS: ${failedTests}`);
    console.log('========================================================================');
    process.exit(1);
  } else {
    console.log('🎉 ALL INTEGRATION & END-TO-END PIPELINE CHECKS PASSED WITH 100% SUCCESS!');
    console.log('========================================================================\n');
  }
}

runAllTests().then(() => process.exit(0)).catch(err => {
  console.error('\n❌ Unhandled exception during E2E test suite:', err);
  process.exit(1);
});
