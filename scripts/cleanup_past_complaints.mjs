import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

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

async function runCleanup() {
  await signInWithEmailAndPassword(auth, 'officer.pwd@civiceye.demo', 'Password@123');
  console.log('Authenticated with officer account.');

  // 1. Correct dhKGVs7LCsg6JxbKZ7ce
  const ref1 = doc(db, 'complaints', 'dhKGVs7LCsg6JxbKZ7ce');
  const snap1 = await getDoc(ref1);
  if (snap1.exists()) {
    const data1 = snap1.data();
    console.log(`Found ${snap1.id} (Complaint ${data1.complaintId}): issueType='${data1.issueType}', desc='${data1.description}'`);
    const existingHistory1 = Array.isArray(data1.statusHistory) ? data1.statusHistory : [];
    const auditHistoryItem1 = {
      id: `hist-${Date.now()}-audit`,
      previousStatus: data1.status || 'Submitted',
      newStatus: data1.status || 'Submitted',
      updatedBy: 'system-audit',
      updatedByName: 'System Auditor',
      remarks: 'Auditable Correction: Mislabeled generic "Road Issue" corrected to canonical "Road Divider Damage" with Medium priority based on citizen description evidence.',
      timestamp: new Date().toISOString(),
    };

    await updateDoc(ref1, {
      issueType: 'road divider damage',
      displayIssueName: 'Road Divider Damage',
      priority: 'MEDIUM',
      severity: 'MEDIUM',
      priorityReason: 'Medium: Broken or damaged road divider without immediate severe collision hazard.',
      department: 'Traffic / Road Safety Department',
      responsibleDepartment: 'Traffic / Road Safety Department',
      statusHistory: [...existingHistory1, auditHistoryItem1],
      updatedAt: serverTimestamp(),
    });
    console.log(`✅ Corrected dhKGVs7LCsg6JxbKZ7ce to 'Road Divider Damage' (MEDIUM priority).`);
  } else {
    console.warn('Doc dhKGVs7LCsg6JxbKZ7ce not found.');
  }

  // 2. Correct fnmNB09VPPyQ6c3j4FcQ
  const ref2 = doc(db, 'complaints', 'fnmNB09VPPyQ6c3j4FcQ');
  const snap2 = await getDoc(ref2);
  if (snap2.exists()) {
    const data2 = snap2.data();
    console.log(`Found ${snap2.id} (Complaint ${data2.complaintId}): issueType='${data2.issueType}', desc='${data2.description}'`);
    const existingHistory2 = Array.isArray(data2.statusHistory) ? data2.statusHistory : [];
    const auditHistoryItem2 = {
      id: `hist-${Date.now()}-audit`,
      previousStatus: data2.status || 'Submitted',
      newStatus: data2.status || 'Submitted',
      updatedBy: 'system-audit',
      updatedByName: 'System Auditor',
      remarks: 'Auditable Correction: Mislabeled generic "Road Issue" corrected to canonical "Road Divider Damage" with High priority based on crash hazard description.',
      timestamp: new Date().toISOString(),
    };

    await updateDoc(ref2, {
      issueType: 'road divider damage',
      displayIssueName: 'Road Divider Damage',
      priority: 'HIGH',
      severity: 'HIGH',
      priorityReason: 'High: Severe divider damage or accident risk (crash reported).',
      department: 'Traffic / Road Safety Department',
      responsibleDepartment: 'Traffic / Road Safety Department',
      statusHistory: [...existingHistory2, auditHistoryItem2],
      updatedAt: serverTimestamp(),
    });
    console.log(`✅ Corrected fnmNB09VPPyQ6c3j4FcQ to 'Road Divider Damage' (HIGH priority).`);
  } else {
    console.warn('Doc fnmNB09VPPyQ6c3j4FcQ not found.');
  }

  // 3. Ensure fpsEoglTYx04wtqUmrNF has canonical displayIssueName and priorityReason
  const ref3 = doc(db, 'complaints', 'fpsEoglTYx04wtqUmrNF');
  const snap3 = await getDoc(ref3);
  if (snap3.exists()) {
    await updateDoc(ref3, {
      displayIssueName: 'Pothole',
      priorityReason: 'Low: Small, limited defect with low immediate risk.',
      updatedAt: serverTimestamp(),
    });
    console.log(`✅ Updated fpsEoglTYx04wtqUmrNF with canonical displayIssueName and priorityReason.`);
  }

  console.log('Cleanup completed successfully.');
}

runCleanup().catch(console.error);
