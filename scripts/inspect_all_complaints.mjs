import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD2SIXmgD8xgYvdFMG0ZryGF3F5tgYOlGs',
  authDomain: 'civiceye-c127c.firebaseapp.com',
  projectId: 'civiceye-c127c',
  storageBucket: 'civiceye-c127c.firebasestorage.app',
  messagingSenderId: '930740300088',
  appId: '1:930740300088:web:75042d21b2efa28fea79cd',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  await signInWithEmailAndPassword(auth, 'officer.pwd@civiceye.demo', 'Password@123');
  const snap = await getDocs(collection(db, 'complaints'));
  console.log(`Total complaints: ${snap.size}`);
  snap.forEach(d => {
    const data = d.data();
    console.log(`- DocID: ${d.id} | complaintId: ${data.complaintId} | citizen: ${data.citizenEmail || data.citizenId} | issue: ${data.issueType} | status: ${data.status} | isDemo: ${!!data.isDemo} | isDeleted: ${!!data.isDeleted}`);
  });
}

main().catch(console.error);
