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

async function inspect() {
  try {
    console.log('Signing in as officer@civiceye.gov...');
    const userCred = await signInWithEmailAndPassword(auth, 'officer@civiceye.gov', 'Officer@123');
    console.log('Logged in UID:', userCred.user.uid);

    console.log('\n--- Fetching all users in Firestore ---');
    const snapshot = await getDocs(collection(db, 'users'));
    console.log(`Total users in DB: ${snapshot.size}`);
    snapshot.forEach(doc => {
      console.log(`User UID: ${doc.id}`);
      console.log('Data:', JSON.stringify(doc.data(), null, 2));
      console.log('-------------------------------------------');
    });
  } catch (err) {
    console.error('Error:', err);
  }
}

inspect().then(() => process.exit(0));
