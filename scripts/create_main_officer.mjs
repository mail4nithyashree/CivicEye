import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
} from 'firebase/firestore';

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

const targetEmail = process.argv[2] || 'main@civiceye.gov';
const targetPassword = process.argv[3] || 'Officer@123';
const targetName = process.argv[4] || 'Main Officer';
const targetDepartment = 'Road Maintenance';

async function setupMainOfficer() {
  console.log(`\n======================================================`);
  console.log(`CivicEye Main Officer Setup Utility`);
  console.log(`======================================================`);
  console.log(`Target Email:      ${targetEmail}`);
  console.log(`Target Name:       ${targetName}`);
  console.log(`Role:              main_officer`);
  console.log(`Department:        ${targetDepartment}`);
  console.log(`------------------------------------------------------`);

  let user;

  try {
    console.log(`Creating Firebase Auth user...`);
    const cred = await createUserWithEmailAndPassword(auth, targetEmail, targetPassword);
    user = cred.user;
    console.log(`>>> Created new Firebase Auth account! UID: ${user.uid}`);
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      console.log(`Account ${targetEmail} already exists in Firebase Auth. Signing in to update Firestore document...`);
      try {
        const cred = await signInWithEmailAndPassword(auth, targetEmail, targetPassword);
        user = cred.user;
        console.log(`>>> Signed in successfully! UID: ${user.uid}`);
      } catch (signInErr) {
        console.error(`❌ Failed to sign in with password "${targetPassword}".`);
        console.error(`Error details:`, signInErr.message);
        console.log(`\nTip: If you forgot the password for ${targetEmail}, specify a new test email:`);
        console.log(`node scripts/create_main_officer.mjs main2@civiceye.gov Officer@123 "Main Officer"`);
        process.exit(1);
      }
    } else {
      console.error(`❌ Error creating user in Firebase Auth:`, error.message);
      process.exit(1);
    }
  }

  try {
    console.log(`Writing Firestore profile at users/${user.uid}...`);
    const userDocRef = doc(db, 'users', user.uid);
    const existingSnap = await getDoc(userDocRef);
    const isExisting = existingSnap.exists();

    await setDoc(
      userDocRef,
      {
        fullName: targetName,
        name: targetName,
        email: targetEmail,
        role: 'main_officer',
        department: targetDepartment,
        active: true,
        createdAt: isExisting ? existingSnap.data()?.createdAt || serverTimestamp() : serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`✅ SUCCESS! Main Officer profile successfully stored in Firestore.`);
    console.log(`\n======================================================`);
    console.log(`LOGIN CREDENTIALS SUMMARY`);
    console.log(`======================================================`);
    console.log(`Persona Option:    Officer`);
    console.log(`Email:             ${targetEmail}`);
    console.log(`Password:          ${targetPassword}`);
    console.log(`Role:              main_officer`);
    console.log(`Target Dashboard:  /officer/main-dashboard`);
    console.log(`======================================================\n`);

  } catch (dbErr) {
    console.error(`❌ Firestore write error:`, dbErr.message);
    process.exit(1);
  }
}

setupMainOfficer().then(() => process.exit(0));
