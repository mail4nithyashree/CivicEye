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
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';

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
  console.log(`CivicEye Multi-Role Verification Test Suite`);
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

  // ========================================================
  // TEST 1: Field Inspector Authentication & Profile
  // ========================================================
  try {
    const inspectorCred = await signInWithEmailAndPassword(
      auth,
      'inspector@civiceye.gov',
      'Inspector@123'
    );
    const inspectorUid = inspectorCred.user.uid;
    const inspectorSnap = await getDoc(doc(db, 'users', inspectorUid));
    const inspectorData = inspectorSnap.data();

    assert('Field Inspector logs in with Firebase Auth', inspectorUid != null);
    assert('Field Inspector Firestore profile exists', inspectorSnap.exists());
    assert('Field Inspector role is "field_inspector"', inspectorData.role === 'field_inspector');
    assert('Field Inspector active status is true', inspectorData.active === true);

    // ========================================================
    // TEST 2: Main Officer Authentication & Profile
    // ========================================================
    const officerCred = await signInWithEmailAndPassword(
      auth,
      'officer@civiceye.gov',
      'Officer@123'
    );
    const officerUid = officerCred.user.uid;
    const officerSnap = await getDoc(doc(db, 'users', officerUid));
    const officerData = officerSnap.data();

    assert('Main Officer logs in with Firebase Auth', officerUid != null);
    assert('Main Officer Firestore profile exists', officerSnap.exists());
    assert('Main Officer role is "main_officer"', officerData.role === 'main_officer');

    // ========================================================
    // TEST 3: Create Sample Complaint & Assign to Field Inspector
    // ========================================================
    const testComplaintRef = await addDoc(collection(db, 'complaints'), {
      complaintId: `TEST${Math.floor(1000 + Math.random() * 9000)}`,
      citizenId: officerUid,
      citizenEmail: 'citizen.tester@example.com',
      imageUri: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      description: 'Automated test road damage issue',
      latitude: 11.0168,
      longitude: 76.9558,
      issueType: 'pothole',
      confidence: 92,
      priority: 'HIGH',
      severity: 'HIGH',
      responsibleDepartment: 'Road Maintenance',
      departmentCode: 'ROAD',
      status: 'Submitted',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const testDocId = testComplaintRef.id;
    assert('Test complaint created in Firestore', testDocId != null);

    // Assign to Field Inspector
    await updateDoc(doc(db, 'complaints', testDocId), {
      assignedInspectorId: inspectorUid,
      assignedInspectorName: inspectorData.name || 'Field Inspector (Coimbatore)',
      assignedAt: serverTimestamp(),
      assignedBy: officerUid,
      assignedByName: officerData.name || 'Main Officer',
      inspectionStatus: 'PENDING',
      status: 'Under Review',
      updatedAt: serverTimestamp(),
    });

    const assignedSnap = await getDoc(doc(db, 'complaints', testDocId));
    const assignedData = assignedSnap.data();
    assert('Complaint assigned to Field Inspector UID', assignedData.assignedInspectorId === inspectorUid);
    assert('Complaint status updated to "Under Review"', assignedData.status === 'Under Review');
    assert('Complaint inspectionStatus updated to "PENDING"', assignedData.inspectionStatus === 'PENDING');

    // ========================================================
    // TEST 4: Query Assigned Complaints for Field Inspector
    // ========================================================
    const assignedQuery = query(
      collection(db, 'complaints'),
      where('assignedInspectorId', '==', inspectorUid)
    );
    const assignedResults = await getDocs(assignedQuery);
    assert('Field Inspector assigned complaints query returns results', assignedResults.size >= 1);

    // ========================================================
    // TEST 5: Field Inspector Submits Genuine Verification
    // ========================================================
    await updateDoc(doc(db, 'complaints', testDocId), {
      inspectionStatus: 'VALID',
      inspectionResult: 'genuine',
      inspectorRemarks: 'Test on-site observation: Pothole confirmed at location.',
      inspectionEvidenceUrl: 'https://res.cloudinary.com/demo/image/upload/evidence_sample.jpg',
      inspectedBy: inspectorUid,
      inspectedByName: inspectorData.name || 'Field Inspector',
      inspectedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const verifiedSnap = await getDoc(doc(db, 'complaints', testDocId));
    const verifiedData = verifiedSnap.data();
    assert('Complaint inspectionStatus updated to "VALID"', verifiedData.inspectionStatus === 'VALID');
    assert('Complaint inspectionResult is "genuine"', verifiedData.inspectionResult === 'genuine');
    assert('Inspection evidence URL stored in Firestore', verifiedData.inspectionEvidenceUrl != null);
    assert('Inspection remarks recorded', verifiedData.inspectorRemarks.includes('Pothole confirmed'));

    // ========================================================
    // TEST 6: Field Inspector Submits Fake/Invalid Rejection
    // ========================================================
    await updateDoc(doc(db, 'complaints', testDocId), {
      status: 'Rejected',
      inspectionStatus: 'INVALID',
      inspectionResult: 'fake',
      rejectionType: 'FAKE_COMPLAINT',
      rejectionReason: 'No road damage found at specified location',
      inspectorRemarks: 'Inspected location. Asphalt surface is completely intact.',
      inspectedBy: inspectorUid,
      inspectedByName: inspectorData.name || 'Field Inspector',
      inspectedAt: serverTimestamp(),
      rejectedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const rejectedSnap = await getDoc(doc(db, 'complaints', testDocId));
    const rejectedData = rejectedSnap.data();
    assert('Complaint status updated to "Rejected"', rejectedData.status === 'Rejected');
    assert('Complaint inspectionStatus updated to "INVALID"', rejectedData.inspectionStatus === 'INVALID');
    assert('Complaint inspectionResult is "fake"', rejectedData.inspectionResult === 'fake');
    assert('Rejection reason recorded', rejectedData.rejectionReason === 'No road damage found at specified location');

    // Note: Deletions are forbidden by firestore.rules for audit integrity
    console.log(`\n Verified test complaint ${testDocId}`);

  } catch (err) {
    console.error(`❌ Test Suite Encountered Error:`, err);
  }

  console.log(`\n======================================================`);
  console.log(`TEST RESULTS: ${passCount} / ${testCount} Passed`);
  console.log(`======================================================\n`);
}

runTestSuite().then(() => process.exit(0));
