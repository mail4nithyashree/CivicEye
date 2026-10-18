import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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

async function testCitizenQuery() {
  const testEmail = `testcitizenofficer${Date.now()}@example.com`;
  const testPass = 'Password@123';
  
  console.log(`Creating test citizen: ${testEmail}`);
  const cred = await createUserWithEmailAndPassword(auth, testEmail, testPass);
  console.log(`Citizen UID: ${cred.user.uid}`);

  console.log('\nQuerying collection users for role == main_officer:');
  try {
    const q = query(collection(db, 'users'), where('role', '==', 'main_officer'));
    const snapshot = await getDocs(q);
    console.log(`Query SUCCESS! Documents returned: ${snapshot.size}`);
    snapshot.forEach(doc => {
      console.log(`Doc ID: ${doc.id} =>`, doc.data());
    });
  } catch (err) {
    console.error('Query FAILED with error:', err.code, err.message);
  }

  console.log('\nQuerying all documents in users collection:');
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    console.log(`All users count: ${snapshot.size}`);
    snapshot.forEach(doc => {
      console.log(`User ID: ${doc.id}, Role: ${doc.data().role}, Name: ${doc.data().fullName || doc.data().name || doc.data().displayName}`);
    });
  } catch (err) {
    console.error('All users query FAILED:', err.code, err.message);
  }
}

testCitizenQuery().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
