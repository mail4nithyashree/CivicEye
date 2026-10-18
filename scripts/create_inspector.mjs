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

// Configurable via CLI args: node scripts/create_inspector.mjs [email] [password] [fullName]
const targetEmail = process.argv[2] || 'inspector@civiceye.gov';
const targetPassword = process.argv[3] || 'Inspector@123';
const targetName = process.argv[4] || 'Field Inspector (Coimbatore North)';
const targetDepartment = 'Road Maintenance';

async function setupFieldInspector() {
  console.log(`\n======================================================`);
  console.log(`CivicEye Field Inspector Setup Utility`);
  console.log(`======================================================`);
  console.log(`Target Email:      ${targetEmail}`);
  console.log(`Target Name:       ${targetName}`);
  console.log(`Role:              field_inspector`);
  console.log(`Department:        ${targetDepartment}`);
  console.log(`------------------------------------------------------`);

  let user;

  // 1. Attempt to create the user in Firebase Authentication
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
        console.log(`\nTip: If you forgot the password for ${targetEmail}, you can specify a new test email:`);
        console.log(`node scripts/create_inspector.mjs inspector2@civiceye.gov Inspector@123 "Inspector Name"`);
        process.exit(1);
      }
    } else {
      console.error(`❌ Error creating user in Firebase Auth:`, error.message);
      process.exit(1);
    }
  }

  // 2. Create/Update Firestore users/{uid} document with field_inspector role
  try {
    console.log(`Writing Firestore profile at users/${user.uid}...`);
    const userDocRef = doc(db, 'users', user.uid);
    
    // Check existing
    const existingSnap = await getDoc(userDocRef);
    const isExisting = existingSnap.exists();

    await setDoc(
      userDocRef,
      {
        fullName: targetName,
        name: targetName,
        email: targetEmail,
        role: 'field_inspector',
        department: targetDepartment,
        active: true,
        createdAt: isExisting ? existingSnap.data()?.createdAt || serverTimestamp() : serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`✅ SUCCESS! Field Inspector profile successfully stored in Firestore.`);
    console.log(`\n======================================================`);
    console.log(`LOGIN CREDENTIALS SUMMARY`);
    console.log(`======================================================`);
    console.log(`Persona Option:    Officer`);
    console.log(`Email:             ${targetEmail}`);
    console.log(`Password:          ${targetPassword}`);
    console.log(`Role:              field_inspector`);
    console.log(`Target Dashboard:  /officer/field-dashboard`);
    console.log(`======================================================\n`);

  } catch (dbErr) {
    console.error(`❌ Firestore write error:`, dbErr.message);
    process.exit(1);
  }
}

setupFieldInspector().then(() => process.exit(0));
