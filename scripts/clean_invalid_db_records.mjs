import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
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

const OFFICER_EMAIL = 'officer.pwd@civiceye.demo';
const DEFAULT_PASSWORD = 'Password@123';

async function cleanup() {
  console.log('--- Cleaning Up Database of Invalid/Flower/Wrong Prediction Test Records ---');
  await signInWithEmailAndPassword(auth, OFFICER_EMAIL, DEFAULT_PASSWORD);
  console.log('Authenticated successfully as officer.');

  const snapshot = await getDocs(collection(db, 'complaints'));
  console.log(`Total complaints found: ${snapshot.size}`);

  let updatedCount = 0;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const id = docSnap.id;
    const desc = (data.description || '').toLowerCase();
    const img = (data.imageUri || '').toLowerCase();
    const issue = (data.issueType || '').toLowerCase();
    const status = (data.status || '').toLowerCase();

    // Check if it's a test/mock flower record or test animal record or temporary test dummy with wrong predictions
    const isFlowerOrInvalidRecord =
      desc.includes('flower') ||
      img.includes('flower') ||
      desc.includes('animal') ||
      img.includes('animal') ||
      desc.includes('old complaint previously predicted') ||
      desc.includes('test pothole reported with animal') ||
      status.includes('invalid issue image') ||
      status.includes('dissimilar image') ||
      issue.includes('invalid issue image') ||
      data.rejectionType === 'IMAGE_MISMATCH';

    if (isFlowerOrInvalidRecord) {
      console.log(`⚡ Updating invalid/flower test record to exact message: ${id} (desc: "${data.description?.substring(0, 40)}")`);
      await updateDoc(doc(db, 'complaints', id), {
        status: 'Invalid Image, give valid Issue Image!',
        issueType: 'Invalid Image, give valid Issue Image!',
        rejectionType: 'IMAGE_MISMATCH',
        rejectionReason: 'Invalid Image, give valid Issue Image!',
        confidence: 0,
        priority: 'NONE',
        severity: 'NONE',
        inspectionStatus: 'INVALID',
        fieldVerificationStatus: 'rejected',
      });
      updatedCount++;
    }
  }

  console.log(`\nCleanup Complete! Updated ${updatedCount} invalid/flower test records to "Invalid Image, give valid Issue Image!".`);
}

cleanup()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Error during cleanup:', err);
    process.exit(1);
  });
