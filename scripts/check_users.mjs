import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';

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

const passwordsToTry = ['123456', 'password', 'password123', 'admin123', 'civiceye', 'civiceye123', 'CivicEye@123', '12345678'];

async function tryAuth(email) {
  console.log(`\n========================================`);
  console.log(`Testing Account: ${email}`);
  for (const pwd of passwordsToTry) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pwd);
      const user = userCredential.user;
      console.log(`>>> Authentication SUCCESS with password: "${pwd}"`);
      console.log(`AUTH EMAIL: ${user.email}`);
      console.log(`AUTH UID: ${user.uid}`);

      const userDocRef = doc(db, 'users', user.uid);
      console.log(`FIRESTORE DOCUMENT PATH: users/${user.uid}`);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        console.log(`FIRESTORE ROLE: ${data.role}`);
        console.log(`FIRESTORE FULL DATA:`, JSON.stringify(data, null, 2));

        let targetRoute = '/(tabs)';
        if (data.role === 'main_officer') targetRoute = '/officer/main-dashboard';
        console.log(`TARGET ROUTE: ${targetRoute}`);
      } else {
        console.log(`FIRESTORE DOCUMENT DOES NOT EXIST for UID ${user.uid}!`);
      }
      return user;
    } catch (err) {
      if (err.code !== 'auth/invalid-credential' && err.code !== 'auth/wrong-password') {
        console.log(`Error with ${email} (pwd: ${pwd}):`, err.code, err.message);
      }
    }
  }
  console.log(`Could not sign in with common passwords for ${email}`);
}

async function run() {
  const mainUser = await tryAuth('main@civiceye.gov');
  const inspUser = await tryAuth('inspector@civiceye.gov');

  if (mainUser) {
    console.log('\n--- Checking all users in Firestore using authenticated session ---');
    const snap = await getDocs(collection(db, 'users'));
    console.log(`Total users found: ${snap.size}`);
    snap.forEach(d => {
      console.log(`Doc ID: ${d.id} => email: ${d.data().email}, role: ${d.data().role}, name: ${d.data().fullName || d.data().name}`);
    });
  }
}

run().then(() => process.exit(0));
