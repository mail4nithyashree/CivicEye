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

async function test() {
  console.log('Signing in as main@civiceye.gov...');
  const userCred = await signInWithEmailAndPassword(auth, 'main@civiceye.gov', 'Officer@123');
  console.log('Signed in as UID:', userCred.user.uid);

  console.log('Attempting to query users where role == field_inspector...');
  try {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'field_inspector')
    );
    const snap = await getDocs(q);
    console.log(`SUCCESS! Found ${snap.size} field inspectors:`);
    snap.forEach(d => console.log(' -', d.id, d.data()));
  } catch (err) {
    console.error('FETCH FIELD INSPECTORS ERROR:', err);
  }
}

test().then(() => process.exit(0));
