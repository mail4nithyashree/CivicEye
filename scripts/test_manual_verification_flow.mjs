import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, updateDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';

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

async function testManualVerificationFlow() {
  console.log('--- Testing Full Manual Issue Verification & Auto-Update Lifecycle ---');

  // 1. Sign in as Field Inspector (Durai)
  console.log('1. Signing in as Inspector: inspector@civiceye.gov');
  const inspectorCred = await signInWithEmailAndPassword(auth, 'inspector@civiceye.gov', 'Test123456');
  console.log('   Inspector UID:', inspectorCred.user.uid);

  // 2. Create a fresh test complaint with status = "Submitted"
  const testComplaintId = `CE-MANUAL-${Math.floor(1000 + Math.random() * 9000)}`;
  const complaintDocRef = await addDoc(collection(db, 'complaints'), {
    complaintId: testComplaintId,
    citizenId: inspectorCred.user.uid,
    citizenEmail: 'inspector@civiceye.gov',
    issueType: 'pothole',
    confidence: 91,
    priority: 'HIGH',
    severity: 'HIGH',
    description: 'Deep pothole on Avinashi Road near flyover',
    latitude: 11.0168,
    longitude: 76.9672,
    region: 'Gandhipuram',
    department: 'Road Maintenance',
    responsibleDepartment: 'Tamil Nadu State Highways Department (C&M)',
    departmentCode: 'ROAD',
    status: 'Submitted',
    inspectionStatus: 'PENDING',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    statusHistory: [{
      id: `hist-${Date.now()}`,
      previousStatus: 'None',
      newStatus: 'Submitted',
      updatedBy: 'test-citizen-uid',
      updatedByName: 'Citizen Test',
      remarks: 'Complaint raised by citizen with AI analysis. Forwarded for Officer verification.',
      timestamp: new Date().toISOString(),
    }],
  });
  console.log(`2. Created fresh complaint #${testComplaintId} with status="Submitted" (Doc ID: ${complaintDocRef.id})`);

  // 3. Officer manually inspects & verifies the complaint
  console.log('3. Officer performs manual on-site verification via backend verification service...');
  const res = await fetch('http://localhost:3000/api/verify-complaint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      complaintId: complaintDocRef.id,
      verification: {
        isIssuePresent: true,
        verifiedIssue: 'pothole',
        severity: 'HIGH',
        estimatedResolutionDays: 3,
        estimatedBudget: 35000,
        roadName: 'Avinashi Road',
        roadType: 'State Highway',
        region: 'Gandhipuram',
        maintenanceAuthority: 'Tamil Nadu State Highways Department (C&M) - Coimbatore Division',
        departmentName: 'Roads & Infrastructure Department',
        isOtherDeptInvolved: false,
        inspectorRemarks: 'Manual on-site verification confirmed genuine deep pothole defect requiring urgent bituminous patch repair.',
        inspectorId: inspectorCred.user.uid,
        inspectorName: 'Durai (Field Inspector)',
      }
    })
  });
  const proxyResult = await res.json();
  console.log('   Verification service response:', proxyResult);

  // 4. Verify Firestore document reflects "Verified" status
  const updatedSnap = await getDoc(doc(db, 'complaints', complaintDocRef.id));
  const updatedData = updatedSnap.data();
  console.log(`4. Verified Status Auto-Update in Database:`);
  console.log(`   - Status: ${updatedData.status} (Expected: Verified)`);
  console.log(`   - Inspection Status: ${updatedData.inspectionStatus} (Expected: VALID)`);
  console.log(`   - Verified Issue: ${updatedData.inspectionDetails?.verifiedIssue}`);
  console.log(`   - Road: ${updatedData.roadName}`);
  console.log(`   - Maintained By: ${updatedData.maintenanceAuthority}`);
  console.log(`   - Est. Budget: ₹${updatedData.estimatedBudget}`);
  console.log(`   - Inspector Remarks: "${updatedData.inspectionDetails?.inspectorRemarks}"`);

  if (updatedData.status === 'Verified' && updatedData.inspectionStatus === 'VALID') {
    console.log('✅ MANUAL VERIFICATION & AUTO-UPDATE TEST PASSED SUCCESSFULLY!');
  } else {
    throw new Error('Verification status mismatch!');
  }
}

testManualVerificationFlow().then(() => process.exit(0)).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
