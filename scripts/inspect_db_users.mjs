import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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
