import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

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

function isInvalidImageComplaint(statusOrComplaint) {
  if (!statusOrComplaint) return false;
  const s = statusOrComplaint.status;
  const insp = statusOrComplaint.inspectionStatus;
  const rejType = statusOrComplaint.rejectionType;
  const issue = statusOrComplaint.issueType;
  const predState = statusOrComplaint.predictionState;
  const valStatus = statusOrComplaint.validationStatus;
  return s === 'Invalid Image, give valid Issue Image!' ||
         s === 'Invalid Issue image, raise the complaint with the appropriate image!' ||
         s === 'Dissimilar Image to the Issue' ||
         s === 'Rejected' ||
         insp === 'INVALID' ||
         rejType === 'IMAGE_MISMATCH' ||
         rejType === 'INVALID_IMAGE' ||
         predState === 'INVALID_IMAGE' ||
         valStatus === 'unrelated_image' ||
         (typeof issue === 'string' && issue.includes('Invalid'));
}

async function verifyCitizenPastComplaints() {
  await signInWithEmailAndPassword(auth, 'officer.pwd@civiceye.demo', 'Password@123');

  const q = query(collection(db, 'complaints'), where('citizenEmail', '==', 'mail4nithyashree@gmail.com'));
  const snap = await getDocs(q);

  console.log(`Total complaints in DB for mail4nithyashree@gmail.com: ${snap.size}`);

  const citizenVisible = [];
  const excludedInvalid = [];

  snap.forEach(d => {
    const data = d.data();
    if (isInvalidImageComplaint(data)) {
      excludedInvalid.push({
        id: d.id,
        complaintId: data.complaintId,
        issueType: data.issueType,
        status: data.status,
        rejectionType: data.rejectionType
      });
    } else {
      citizenVisible.push({
        id: d.id,
        complaintId: data.complaintId,
        issueType: data.issueType,
        displayIssueName: data.displayIssueName,
        priority: data.priority,
        priorityReason: data.priorityReason,
        status: data.status
      });
    }
  });

  console.log('\n--- Excluded from citizen past complaints (rejected/invalid) ---');
  console.table(excludedInvalid);

  console.log('\n--- Visible in citizen past complaints ---');
  console.table(citizenVisible);
}

verifyCitizenPastComplaints().catch(console.error);
