import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { autoSplitBudget } from '../constants/coimbatoreRoads.ts';

const firebaseConfig = {
  apiKey: 'AIzaSyD2SIXmgD8xgYvdFMG0ZryGF3F5tgYOlGs',
  authDomain: 'civiceye-c127c.firebaseapp.com',
  projectId: 'civiceye-c127c',
  storageBucket: 'civiceye-c127c.firebasestorage.app',
  messagingSenderId: '930740300088',
  appId: '1:930740300088:web:aa1eb5f0cc91edd068a919',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function runE2ETest() {
  console.log('================================================================');
  console.log('🚀 TESTING END-TO-END BUDGET SPLIT & VERIFICATION CONFIRMATION');
  console.log('================================================================');

  try {
    // 1. Sign in as officer/inspector
    console.log('\n--- 1. Authenticating as Officer ---');
    const officerCred = await signInWithEmailAndPassword(auth, 'officer.pwd@civiceye.demo', 'Password@123');
    console.log('✅ Signed in Officer UID:', officerCred.user.uid);

    // 2. Create a test complaint in Firestore
    console.log('\n--- 2. Creating Test Complaint ---');
    const newComplaintRef = await addDoc(collection(db, 'complaints'), {
      complaintId: `TEST-CBE-${Date.now()}`,
      citizenId: officerCred.user.uid,
      citizenName: 'Citizen Tester',
      citizenEmail: 'citizen.test@example.com',
      issueType: 'pothole',
      department: 'Road Maintenance',
      responsibleDepartment: 'Road Maintenance',
      departmentCode: 'ROAD',
      priority: 'HIGH',
      severity: 'HIGH',
      status: 'Submitted',
      address: 'Dr. Nanjappa Road, Gandhipuram, Coimbatore',
      region: 'Gandhipuram',
      latitude: 11.0168,
      longitude: 76.9672,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const complaintId = newComplaintRef.id;
    console.log('✅ Created test complaint ID:', complaintId);

    // 3. Test Confirm Existing Department via Server Workflow Proxy
    console.log('\n--- 3. Testing Confirm Existing Department via /api/verify-workflow ---');
    const confirmRes = await fetch('http://localhost:3000/api/verify-workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complaintId,
        params: {
          action: 'confirm_existing',
          inspectorId: officerCred.user.uid,
          inspectorName: 'Er. Nithya Field Inspector',
          remarks: 'Confirmed road defect on-site. Belongs strictly to Road Maintenance.',
        },
      }),
    });

    const confirmJson = await confirmRes.json();
    console.log('Confirm existing response:', confirmJson);
    if (!confirmJson.ok) {
      throw new Error(`Confirm existing failed: ${confirmJson.message}`);
    }

    // Verify in Firestore
    const snapAfterConfirm = await getDoc(doc(db, 'complaints', complaintId));
    const dataAfterConfirm = snapAfterConfirm.data();
    console.log('✅ Verified Firestore status:', dataAfterConfirm.status, '| fieldVerificationStatus:', dataAfterConfirm.fieldVerificationStatus);
    if (dataAfterConfirm.status !== 'Verified' || dataAfterConfirm.fieldVerificationStatus !== 'department_confirmed') {
      throw new Error('Firestore data does not reflect department confirmation!');
    }

    // 4. Test Field Inspector 4-Pillar Budget Estimation
    console.log('\n--- 4. Testing 4-Pillar Budget Estimation (₹35,000) ---');
    const customBudget = 35000;
    const split4Pillars = autoSplitBudget(customBudget, 'pothole', 'HIGH');
    console.log('Auto-split calculation:');
    console.log(`• Total Budget: ₹${split4Pillars.budget.toLocaleString('en-IN')}`);
    console.log(`• Material Cost (45%): ₹${split4Pillars.materialCost.toLocaleString('en-IN')}`);
    console.log(`• Labour Charge (30%): ₹${split4Pillars.laborCost.toLocaleString('en-IN')}`);
    console.log(`• Machinery & Safety (15%): ₹${split4Pillars.machineryCost.toLocaleString('en-IN')}`);
    console.log(`• Overhead Expenses (10%): ₹${split4Pillars.overheadCost.toLocaleString('en-IN')}`);

    // Submit verification with budget split
    console.log('\n--- 5. Submitting Field Verification via /api/verify-complaint ---');
    const verifyComplaintRes = await fetch('http://localhost:3000/api/verify-complaint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complaintId,
        verification: {
          inspectorId: officerCred.user.uid,
          inspectorName: 'Er. Nithya Field Inspector',
          verifiedIssue: 'pothole',
          severity: 'HIGH',
          estimatedResolutionDays: 3,
          estimatedBudget: customBudget,
          budgetBreakdown: split4Pillars,
          roadName: 'Dr. Nanjappa Road (Gandhipuram Commercial Corridor)',
          roadType: 'Commercial Corridor',
          region: 'Gandhipuram',
          maintenanceAuthority: 'Coimbatore City Municipal Corporation (CCMC)',
          departmentName: 'Roads & Infrastructure Department',
          isOtherDeptInvolved: false,
          inspectorRemarks: 'Asphalt surface depth measured 65mm. Bituminous premix patch and vibratory compaction required.',
        },
      }),
    });

    const verifyComplaintJson = await verifyComplaintRes.json();
    console.log('Verify complaint response:', verifyComplaintJson);
    if (!verifyComplaintJson.ok) {
      throw new Error(`Verify complaint failed: ${verifyComplaintJson.message}`);
    }

    // Verify in Firestore
    const snapAfterVerify = await getDoc(doc(db, 'complaints', complaintId));
    const dataAfterVerify = snapAfterVerify.data();
    console.log('✅ Status after inspection verification:', dataAfterVerify.status);
    console.log('✅ Estimated Budget in Firestore:', dataAfterVerify.estimatedBudget);
    console.log('✅ Inspection details budget breakdown material cost:', dataAfterVerify.inspectionDetails?.budgetBreakdown?.materialCost);
    console.log('✅ Inspection details budget breakdown labour cost:', dataAfterVerify.inspectionDetails?.budgetBreakdown?.laborCost);
    console.log('✅ Inspection details budget breakdown machinery cost:', dataAfterVerify.inspectionDetails?.budgetBreakdown?.machineryCost);
    console.log('✅ Inspection details budget breakdown overhead cost:', dataAfterVerify.inspectionDetails?.budgetBreakdown?.overheadCost);

    if (
      (dataAfterVerify.status !== 'In Progress' && dataAfterVerify.status !== 'Verified') ||
      dataAfterVerify.estimatedBudget !== 35000 ||
      dataAfterVerify.inspectionDetails?.budgetBreakdown?.materialCost !== 15750 ||
      dataAfterVerify.inspectionDetails?.budgetBreakdown?.laborCost !== 10500 ||
      dataAfterVerify.inspectionDetails?.budgetBreakdown?.machineryCost !== 5250 ||
      dataAfterVerify.inspectionDetails?.budgetBreakdown?.overheadCost !== 3500
    ) {
      throw new Error('Firestore verification data mismatch!');
    }

    console.log('\n================================================================');
    console.log('🎉 END-TO-END VALIDATION PASSED 100% PERFECTLY!');
    console.log('================================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ E2E TEST ERROR:', err);
    process.exit(1);
  }
}

runE2ETest();
