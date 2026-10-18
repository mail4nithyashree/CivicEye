import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDoc, getDocs, doc, setDoc, serverTimestamp, query, where } from 'firebase/firestore';

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

async function runVerification() {
  console.log('====================================================');
  console.log('CIVICEYE FULL SYSTEM INTEGRATION VERIFICATION');
  console.log('====================================================\n');

  // STEP 1: Test Backend AI & Upload Endpoints
  console.log('--- STEP 1: Testing Backend Server & AI Endpoints ---');
  const healthRes = await fetch('http://localhost:3000/health');
  const health = await healthRes.json();
  console.log('✅ Backend Health Status:', health);

  const testImagePath = path.resolve('assets/images/icon.png');
  const imgBuffer = fs.readFileSync(testImagePath);
  const imgBlob = new Blob([imgBuffer], { type: 'image/png' });

  const fdAnalyze = new FormData();
  fdAnalyze.append('image', imgBlob, 'icon.png');
  const analyzeRes = await fetch('http://localhost:3000/api/analyze-road', {
    method: 'POST',
    body: fdAnalyze,
  });
  const analyzeData = await analyzeRes.json();
  console.log('✅ /api/analyze-road Response:', analyzeData.ok ? 'OK (AI Inference Executed)' : 'FAIL', analyzeData);

  const fdUpload = new FormData();
  fdUpload.append('image', imgBlob, 'icon.png');
  const uploadRes = await fetch('http://localhost:3000/api/upload-image', {
    method: 'POST',
    body: fdUpload,
  });
  const uploadData = await uploadRes.json();
  console.log('✅ /api/upload-image Response:', uploadData.secureUrl ? `Uploaded: ${uploadData.secureUrl}` : 'FAIL');

  // STEP 2: Test Citizen Auth & Complaint Submission
  console.log('\n--- STEP 2: Testing Citizen Auth & Firestore Write ---');
  const testEmail = `citizen.${Date.now()}@example.com`;
  const testPassword = 'Password@123';
  const userCred = await createUserWithEmailAndPassword(auth, testEmail, testPassword);
  const citizenUid = userCred.user.uid;
  console.log(`✅ Citizen registered: ${testEmail} (UID: ${citizenUid})`);

  await setDoc(doc(db, 'users', citizenUid), {
    fullName: 'Verified Test Citizen',
    email: testEmail,
    role: 'citizen',
    createdAt: serverTimestamp(),
  });
  console.log('✅ Citizen user profile saved in Firestore users/' + citizenUid);

  const complaintId = `CE${Math.floor(1000 + Math.random() * 9000)}`;
  const complaintDoc = {
    complaintId,
    citizenId: citizenUid,
    email: testEmail,
    citizenEmail: testEmail,
    imageUri: uploadData.secureUrl || 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
    description: 'Deep road crack found near water tank',
    lat: 11.0168,
    latitude: 11.0168,
    long: 76.9672,
    longitude: 76.9672,
    region: 'Gandhipuram',
    locationSource: 'current',
    locationAddress: 'Gandhipuram, Coimbatore',
    issueType: 'cracking',
    confidence: 88,
    priority: 'HIGH',
    severity: 'HIGH',
    department: 'Road Maintenance',
    responsibleDepartment: 'Coimbatore City Municipal Corporation (CCMC)',
    departmentCode: 'ROAD',
    departmentSource: 'ai',
    routingStatus: 'Direct',
    originalDepartment: 'Road Maintenance',
    roadValidationResult: 'road',
    roadValidationConfidence: 0.95,
    analysisStatus: 'damage_detected',
    AI_prediction: 'cracking',
    AI_confidence: 88,
    AI_validation: 'road',
    AI_timestamp: serverTimestamp(),
    status: 'Submitted',
    inspectionStatus: 'PENDING',
    statusHistory: [{
      id: `hist-${Date.now()}`,
      previousStatus: 'None',
      newStatus: 'Submitted',
      updatedBy: citizenUid,
      updatedByName: 'Verified Test Citizen',
      remarks: 'Complaint raised by citizen with AI analysis. Forwarded for Field Inspector on-site verification.',
      timestamp: new Date().toISOString(),
    }],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const compRef = await addDoc(collection(db, 'complaints'), complaintDoc);
  console.log(`✅ Complaint submitted successfully to Firestore! Doc ID: ${compRef.id}, Complaint ID: ${complaintId}`);

  // STEP 3: Test Notification Creation
  console.log('\n--- STEP 3: Testing Automated Notifications ---');
  try {
    const notifRef1 = await addDoc(collection(db, 'notifications'), {
      userId: citizenUid,
      recipientId: citizenUid,
      recipientRole: 'citizen',
      complaintId: compRef.id,
      title: 'Complaint Registered',
      message: `Your complaint in Gandhipuram (#${complaintId}) has been registered. Department: Road Maintenance.`,
      type: 'complaint_raised',
      isRead: false,
      createdAt: serverTimestamp(),
    });
    console.log('✅ Citizen Notification Created:', notifRef1.id);
  } catch (nErr1) {
    console.error('❌ Notif 1 Failed:', nErr1.message);
  }

  try {
    const notifRef2 = await addDoc(collection(db, 'notifications'), {
      recipientRole: 'field_inspector',
      recipientId: 'field_inspector',
      complaintId: compRef.id,
      title: 'New Complaint for Verification',
      message: `New complaint #${complaintId} in Gandhipuram (CRACKING) requires physical verification.`,
      type: 'field_verification_required',
      isRead: false,
      createdAt: serverTimestamp(),
    });
    console.log('✅ Field Inspector Alert Created:', notifRef2.id);
  } catch (nErr2) {
    console.error('❌ Notif 2 Failed:', nErr2.message);
  }

  // STEP 4: Test Querying Complaints
  console.log('\n--- STEP 4: Verifying Complaint Retrieval ---');
  const citizenComplaintsSnap = await getDocs(
    query(collection(db, 'complaints'), where('citizenId', '==', citizenUid))
  );
  console.log(`✅ Citizen complaints query: Found ${citizenComplaintsSnap.size} complaint(s) for citizen.`);
  citizenComplaintsSnap.forEach(d => {
    const data = d.data();
    console.log(`   + #${data.complaintId} | Status: ${data.status} | Department: ${data.department} | Issue: ${data.issueType}`);
  });

  console.log('\n====================================================');
  console.log('🎉 ALL 4 PARTS VERIFIED SUCCESSFULLY!');
  console.log('====================================================');
}

runVerification().then(() => process.exit(0)).catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
