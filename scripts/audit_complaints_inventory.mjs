import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function auditComplaints() {
  await signInWithEmailAndPassword(auth, 'officer.pwd@civiceye.demo', 'Password@123');
  const snap = await getDocs(collection(db, 'complaints'));
  console.log(`Total complaints: ${snap.size}`);

  const rows = [];
  snap.forEach(docSnap => {
    const d = docSnap.data();
    rows.push({
      docId: docSnap.id,
      complaintId: d.complaintId || 'NO_ID',
      citizenEmail: d.citizenEmail || d.citizenId || 'N/A',
      issueType: d.issueType,
      status: d.status,
      priority: d.priority,
      department: d.department || d.responsibleDepartment,
      description: (d.description || '').slice(0, 50),
      imageUri: (d.imageUri || '').slice(0, 45),
      rejectionType: d.rejectionType,
      rejectionReason: d.rejectionReason,
      isDemo: d.isDemo,
    });
  });

  console.table(rows);
}

auditComplaints().catch(console.error);
