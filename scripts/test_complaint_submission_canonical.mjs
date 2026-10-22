import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  runTransaction
} from 'firebase/firestore';

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

const BASE_URL = 'http://127.0.0.1:3000';

async function sendAnalyzeRequest(filePath, description = '') {
  const fileBuffer = fs.readFileSync(filePath);
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const filename = path.basename(filePath);

  const pre = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
    `Content-Type: image/jpeg\r\n\r\n`
  );
  const postDesc = Buffer.from(
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="description"\r\n\r\n` +
    `${description}\r\n--${boundary}--\r\n`
  );

  const body = Buffer.concat([pre, fileBuffer, postDesc]);

  const response = await fetch(`${BASE_URL}/api/analyze-road`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length.toString(),
    },
    body: body,
  });

  return await response.json();
}

function formatDisplayIssueName(raw) {
  if (!raw) return 'Pothole';
  const clean = raw.trim().replace(/_/g, ' ').toLowerCase();
  if (clean === 'pothole') return 'Pothole';
  if (clean === 'alligator cracking' || clean === 'alligator_cracking') return 'Alligator Cracking';
  if (clean === 'cracking' || clean === 'road cracking' || clean === 'road_cracking') return 'Road Cracking';
  if (clean === 'manhole' || clean === 'manhole defect') return 'Manhole Defect';
  if (clean === 'road divider damage' || clean === 'divider damage') return 'Road Divider Damage';
  if (clean === 'debris' || clean === 'debris / road blockage') return 'Debris / Road Blockage';
  if (clean === 'street light fault' || clean === 'street light') return 'Street Light Fault';
  if (clean === 'waterlogging') return 'Waterlogging';
  if (clean === 'missing signage') return 'Missing Signage';
  if (clean === 'public route issue') return 'Public Route Issue';
  if (clean === 'damaged footpath') return 'Damaged Footpath';
  if (clean === 'no major issue' || clean === 'no_major_issue') return 'No Major Issue';
  return clean.replace(/\b\w/g, c => c.toUpperCase());
}

// Simulates toComplaint deserialization in services/complaintService.ts
function simulateToComplaint(data, id) {
  const defaultIssue = 'Pothole';
  const canonicalName = data.displayIssueName
    ? formatDisplayIssueName(data.displayIssueName)
    : formatDisplayIssueName(data.issueType || data.detectedIssue || defaultIssue);

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

  return {
    id,
    complaintId: data.complaintId,
    displayIssueName: canonicalName,
    issueType: canonicalName,
    predictedClass: data.predictedClass ?? canonicalName,
    confidence: normalizedConfidence,
    confidenceRaw: normalizedConfidenceRaw,
    confidenceType: data.confidenceType || 'vision_assessment',
    priority: canonicalPriority,
    severity: canonicalPriority,
    priorityReason: data.priorityReason,
    predictionState: data.predictionState,
    department: data.department,
    departmentCode: data.departmentCode,
    modelVersion: data.modelVersion || 'CivicEye-Vision-Engine-v3',
  };
}

async function runCanonicalPredictionSubmissionTests() {
  console.log('========================================================================');
  console.log('🎯 CIVICEYE E2E TEST: CANONICAL PREDICTION SUBMISSION & FIRESTORE DATA');
  console.log('Target Firebase Project: civiceye-c127c');
  console.log('========================================================================\n');

  console.log('Authenticating test runner as officer.pwd@civiceye.demo...');
  const userCred = await signInWithEmailAndPassword(auth, 'officer.pwd@civiceye.demo', 'Password@123');
  console.log(`Authenticated as UID: ${userCred.user.uid}\n`);

  const tests = [];
  function record(num, title, passed, details) {
    tests.push({ num, title, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${mark}] Test #${num}: ${title}`);
    console.log(`       Details: ${details}\n`);
    if (!passed) throw new Error(`Assertion failed in test #${num}: ${details}`);
  }

  // -------------------------------------------------------------------------
  // TEST SUITE 1: ALLIGATOR CRACKING IMAGE E2E LIFECYCLE
  // -------------------------------------------------------------------------
  console.log('--- TEST SUITE 1: Alligator Cracking Submission Lifecycle ---');
  const alligatorImagePath = path.join(process.cwd(), 'AI', 'test_images', 'alligator_cracking', 'a4.jpg');

  // Stage 1: AI Inference Response
  const aiResult = await sendAnalyzeRequest(alligatorImagePath, 'Severe alligator cracking across the pavement');
  const expectedPriority = aiResult.priority;
  record(
    1,
    'Stage 1 (Inference): AI detects Alligator Cracking with valid canonical fields',
    aiResult.ok === true &&
    aiResult.displayIssueName === 'Alligator Cracking' &&
    aiResult.confidence === 95 &&
    aiResult.predictionState === 'VALID_ISSUE' &&
    ['LOW', 'MEDIUM', 'HIGH'].includes(aiResult.priority) &&
    aiResult.departmentCode === 'ROAD',
    `Issue: "${aiResult.displayIssueName}", Conf: ${aiResult.confidence}%, Priority: "${aiResult.priority}", State: "${aiResult.predictionState}"`
  );

  // Stage 2: Issue Summary Representation (app/report.tsx)
  const summaryIssueName = aiResult.displayIssueName || formatDisplayIssueName(aiResult.issueType);
  const summaryConfidence = aiResult.confidence;
  const summaryPriority = aiResult.priority;
  const summaryReason = aiResult.priorityReason;
  const summaryDept = aiResult.department;
  record(
    2,
    'Stage 2 (Issue Summary): Card displays exact prediction without recalculation or resets',
    summaryIssueName === 'Alligator Cracking' &&
    summaryConfidence === 95 &&
    summaryPriority === expectedPriority &&
    summaryDept.includes('Road Maintenance') &&
    typeof summaryReason === 'string' && summaryReason.includes('alligator cracking'),
    `Summary: Name="${summaryIssueName}", Conf=${summaryConfidence}%, Priority="${summaryPriority}", Dept="${summaryDept}", Reason="${summaryReason}"`
  );

  // Stage 3: Client Submission Payload (handleSubmit in app/report.tsx)
  const canonicalDisplayIssue = summaryIssueName;
  const submissionPayload = {
    citizenId: userCred.user.uid,
    citizenEmail: 'officer.pwd@civiceye.demo',
    imageUri: 'https://res.cloudinary.com/civiceye/image/upload/v1/test_alligator.jpg',
    description: 'Severe alligator cracking across the pavement',
    latitude: 11.0168,
    longitude: 76.9672,
    region: 'Gandhipuram',
    issueType: canonicalDisplayIssue,
    displayIssueName: canonicalDisplayIssue,
    predictedClass: aiResult.predictedClass || canonicalDisplayIssue,
    confidence: summaryConfidence,
    confidenceRaw: aiResult.confidenceRaw ?? 0.95,
    confidenceType: aiResult.confidenceType || 'vision_assessment',
    predictionState: aiResult.predictionState || 'VALID_ISSUE',
    priority: summaryPriority,
    severity: summaryPriority,
    priorityReason: summaryReason,
    modelVersion: aiResult.modelVersion || 'CivicEye-Vision-Engine-v3',
    department: summaryDept,
    departmentCode: aiResult.departmentCode || 'ROAD',
    status: 'Submitted',
  };
  record(
    3,
    'Stage 3 (Submission Payload): Payload mirrors Issue Summary exactly',
    submissionPayload.issueType === 'Alligator Cracking' &&
    submissionPayload.displayIssueName === 'Alligator Cracking' &&
    submissionPayload.confidence === 95 &&
    submissionPayload.priority === expectedPriority &&
    submissionPayload.severity === expectedPriority &&
    submissionPayload.priorityReason === summaryReason,
    `Payload: issueType="${submissionPayload.issueType}", conf=${submissionPayload.confidence}, priority="${submissionPayload.priority}"`
  );

  // Stage 4 & 5: Backend / Service Persistence into Firestore (services/complaintService.ts submitComplaint)
  // Allocate a clean test complaint ID
  const testComplaintId = `CE-20261022-CANONICAL-001`;
  const testDocId = `test_canonical_alligator_doc`;
  const testDocRef = doc(db, 'complaints', testDocId);

  // Direct persistence following submitComplaint logic
  const firestoreRecord = {
    complaintId: testComplaintId,
    clientSubmissionId: 'test_sub_canonical_001',
    predictedClass: submissionPayload.predictedClass,
    displayIssueName: submissionPayload.displayIssueName,
    predictionState: submissionPayload.predictionState,
    priorityReason: submissionPayload.priorityReason,
    confidence: submissionPayload.confidence,
    confidenceRaw: submissionPayload.confidenceRaw,
    confidenceType: submissionPayload.confidenceType,
    modelVersion: submissionPayload.modelVersion,
    issueType: submissionPayload.displayIssueName,
    priority: submissionPayload.priority,
    severity: submissionPayload.severity,
    citizenId: submissionPayload.citizenId,
    citizenEmail: submissionPayload.citizenEmail,
    email: submissionPayload.citizenEmail,
    imageUri: submissionPayload.imageUri,
    imageUrl: submissionPayload.imageUri,
    description: submissionPayload.description,
    latitude: submissionPayload.latitude,
    longitude: submissionPayload.longitude,
    lat: submissionPayload.latitude,
    long: submissionPayload.longitude,
    region: submissionPayload.region,
    department: submissionPayload.department,
    departmentCode: submissionPayload.departmentCode,
    status: submissionPayload.status,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await setDoc(testDocRef, firestoreRecord);

  // Read back directly from Firestore
  const readBackSnap = await getDoc(testDocRef);
  const savedData = readBackSnap.data();

  const checks = {
    exists: readBackSnap.exists(),
    displayIssueName: savedData.displayIssueName === 'Alligator Cracking',
    issueType: savedData.issueType === 'Alligator Cracking',
    predictedClass: savedData.predictedClass === 'Alligator Cracking',
    confidence: savedData.confidence === 95,
    confidenceRaw: savedData.confidenceRaw === submissionPayload.confidenceRaw,
    confidenceType: savedData.confidenceType === submissionPayload.confidenceType,
    priority: savedData.priority === expectedPriority,
    severity: savedData.severity === expectedPriority,
    priorityReason: savedData.priorityReason === summaryReason,
    predictionState: savedData.predictionState === 'VALID_ISSUE',
    department: savedData.department?.includes('Road Maintenance'),
    modelVersion: savedData.modelVersion === 'CivicEye-Vision-Engine-v3',
  };
  console.log('Stage 4/5 Field Checks:', JSON.stringify(checks, null, 2));
  console.log('savedData.priorityReason:', JSON.stringify(savedData.priorityReason));
  console.log('summaryReason:', JSON.stringify(summaryReason));

  record(
    4,
    'Stage 4 & 5 (Firestore Document): Saved document retains exact canonical prediction fields',
    Object.values(checks).every(Boolean),
    `Firestore: displayIssueName="${savedData.displayIssueName}", conf=${savedData.confidence}%, priority="${savedData.priority}", version="${savedData.modelVersion}"`
  );

  // Stage 6: Citizen's Submitted-Complaint View & Past Complaints Deserialization
  const deserializedComplaint = simulateToComplaint(savedData, testDocId);

  // ComplaintCard render values
  const cardIssue = formatDisplayIssueName(deserializedComplaint.displayIssueName || deserializedComplaint.issueType);
  const cardConfStr = `${Math.round(deserializedComplaint.confidence > 0 && deserializedComplaint.confidence <= 1 ? deserializedComplaint.confidence * 100 : deserializedComplaint.confidence)}%`;
  const cardPriority = deserializedComplaint.priority;

  // ComplaintDetail render values
  const detailIssue = deserializedComplaint.displayIssueName || formatDisplayIssueName(deserializedComplaint.issueType);
  const detailConfStr = `${Math.round(deserializedComplaint.confidence > 1 ? deserializedComplaint.confidence : deserializedComplaint.confidence * 100)}%`;
  const detailPriority = deserializedComplaint.priority;
  const detailReason = deserializedComplaint.priorityReason;

  record(
    5,
    'Stage 6 (Citizen Views): Card & Detail view render identical issue name, confidence, and priority',
    cardIssue === 'Alligator Cracking' &&
    cardConfStr === '95%' &&
    cardPriority === expectedPriority &&
    detailIssue === 'Alligator Cracking' &&
    detailConfStr === '95%' &&
    detailPriority === expectedPriority &&
    detailReason === summaryReason,
    `Citizen: CardIssue="${cardIssue}", CardConf="${cardConfStr}", CardPriority="${cardPriority}" | DetailReason="${detailReason}"`
  );

  // Stage 7: Officer & Field Inspector Views
  const officerHeaderIssue = deserializedComplaint.displayIssueName || formatDisplayIssueName(deserializedComplaint.issueType);
  const officerConfStr = `${Math.round(deserializedComplaint.confidence > 1 ? deserializedComplaint.confidence : deserializedComplaint.confidence * 100)}%`;
  const officerPriority = deserializedComplaint.priority;
  const inspectorDefectClass = deserializedComplaint.displayIssueName || formatDisplayIssueName(deserializedComplaint.issueType);

  record(
    6,
    'Stage 7 (Officer & Inspector Views): Officer dashboard and inspection screen render canonical fields',
    officerHeaderIssue === 'Alligator Cracking' &&
    officerConfStr === '95%' &&
    officerPriority === expectedPriority &&
    inspectorDefectClass === 'Alligator Cracking',
    `Officer: Header="${officerHeaderIssue}", Conf="${officerConfStr}", Priority="${officerPriority}"`
  );

  // Test Suite 1B: Alligator cracking with standard description (MEDIUM priority)
  console.log('--- TEST SUITE 1B: Alligator Cracking with MEDIUM Priority ---');
  const aiResultMed = await sendAnalyzeRequest(alligatorImagePath, 'alligator cracking visible on road surface');
  record(
    7,
    'Alligator Cracking (Medium): Assesses MEDIUM priority and preserves canonical name across submission',
    aiResultMed.ok === true &&
    aiResultMed.displayIssueName === 'Alligator Cracking' &&
    aiResultMed.confidence === 95 &&
    aiResultMed.priority === 'MEDIUM',
    `Issue: "${aiResultMed.displayIssueName}", Conf: ${aiResultMed.confidence}%, Priority: "${aiResultMed.priority}"`
  );

  // -------------------------------------------------------------------------
  // TEST SUITE 2: POTHOLE DEFECT E2E CONSISTENCY
  // -------------------------------------------------------------------------
  console.log('--- TEST SUITE 2: Pothole Image Consistency ---');
  const potholeImagePath = path.join(process.cwd(), 'AI', 'test_images', 'pothole', '360_F_706673828_mMCBil00TIR5IMYIA2zoUemEszNVFT4h.jpg');
  const potholeResult = await sendAnalyzeRequest(potholeImagePath, 'Deep dangerous pothole on the roadway');

  record(
    8,
    'Pothole Detection: Valid issue detected with genuine detector confidence',
    potholeResult.ok === true &&
    potholeResult.predictionState === 'VALID_ISSUE' &&
    (potholeResult.displayIssueName === 'Pothole' || potholeResult.issueType === 'pothole') &&
    potholeResult.confidence >= 50 &&
    (potholeResult.priority === 'HIGH' || potholeResult.priority === 'MEDIUM'),
    `Pothole: Name="${potholeResult.displayIssueName}", Conf=${potholeResult.confidence}%, Priority="${potholeResult.priority}"`
  );

  // -------------------------------------------------------------------------
  // TEST SUITE 3: UNRELATED FLOWER IMAGE SAFETY & REJECTION
  // -------------------------------------------------------------------------
  console.log('--- TEST SUITE 3: Unrelated Image Rejection Safety ---');
  const flowerImagePath = path.join(process.cwd(), 'AI', 'test_images', 'flowers_plants', 'close-up-full-bloom-flower_23-2151921043.jpg');
  const flowerResult = await sendAnalyzeRequest(flowerImagePath, 'Beautiful red rose in garden');

  record(
    9,
    'Unrelated Image Rejection: Flower is rejected as INVALID_IMAGE, not falsely submitted as road defect',
    flowerResult.predictionState === 'INVALID_IMAGE' &&
    flowerResult.hasDamage === false &&
    flowerResult.priority === 'NONE' &&
    flowerResult.confidence >= 50,
    `Flower: State="${flowerResult.predictionState}", hasDamage=${flowerResult.hasDamage}, Priority="${flowerResult.priority}", Conf=${flowerResult.confidence}%`
  );

  // Cleanup test document
  await deleteDoc(testDocRef);
  console.log('Cleaned up test document from Firestore.\n');

  console.log('========================================================================');
  console.log(`📊 ALL ${tests.length} TEST STAGES COMPLETED WITH 100% SUCCESS!`);
  console.log('========================================================================');
  process.exit(0);
}

runCanonicalPredictionSubmissionTests().catch(err => {
  console.error('\n❌ TEST RUNNER ERROR:', err);
  process.exit(1);
});
