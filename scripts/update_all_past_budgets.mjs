import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { calculatePracticalBudget } from '../constants/coimbatoreRoads.ts';

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

const DEFAULT_DEMO_PASSWORD = 'Password@123';

function cleanDocData(obj) {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      if (val && typeof val === 'object' && !(val instanceof Timestamp) && !(val instanceof Date)) {
        result[key] = cleanDocData(val);
      } else {
        result[key] = val;
      }
    }
  }
  return result;
}

async function authenticateOfficer() {
  try {
    const cred = await signInWithEmailAndPassword(auth, 'officer.pwd@civiceye.demo', DEFAULT_DEMO_PASSWORD);
    return cred.user;
  } catch (err) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
      try {
        const cred = await createUserWithEmailAndPassword(auth, 'officer.pwd@civiceye.demo', DEFAULT_DEMO_PASSWORD);
        return cred.user;
      } catch (createErr) {
        if (createErr.code === 'auth/email-already-in-use') {
          const cred = await signInWithEmailAndPassword(auth, 'officer.pwd@civiceye.demo', DEFAULT_DEMO_PASSWORD);
          return cred.user;
        }
        throw createErr;
      }
    }
    throw err;
  }
}

export async function updateAllPastBudgets() {
  console.log('========================================================================');
  console.log('💰 CIVICEYE MIGRATION: RECALCULATING PRACTICAL BUDGETS FOR ALL PAST ISSUES');
  console.log('========================================================================\n');

  console.log('1. Authenticating as Municipal Engineer...');
  const officerUser = await authenticateOfficer();
  console.log(`   ✅ Authenticated as: ${officerUser.email} (UID: ${officerUser.uid})\n`);

  console.log('2. Fetching all existing complaints from Firestore `complaints` collection...');
  const complaintsSnapshot = await getDocs(collection(db, 'complaints'));
  console.log(`   Found ${complaintsSnapshot.size} total complaint records in database.\n`);

  if (complaintsSnapshot.empty) {
    console.log('   ⚠️ No complaint documents found to update.');
    return { success: true, count: 0 };
  }

  let updatedCount = 0;
  let errorCount = 0;

  console.log('3. Computing practical itemized budgets (Materials, Labor, Machinery) & Updating...\n');

  for (const docSnap of complaintsSnapshot.docs) {
    const data = docSnap.data();
    const complaintId = data.complaintId || docSnap.id;
    const issueType = data.inspectionDetails?.verifiedIssue || data.issueType || data.detectedIssue || 'pothole';
    const severity = data.inspectionDetails?.severity || data.priority || data.severity || 'MEDIUM';
    const oldBudget = data.estimatedBudget ?? (data.inspectionDetails?.estimatedBudget ?? 'N/A');

    try {
      const practical = calculatePracticalBudget(issueType, severity);

      const updatePayload = {
        estimatedBudget: practical.budget,
        estimatedBudgetDesc: practical.description,
        budgetBreakdown: practical,
        updatedAt: serverTimestamp(),
      };

      if (data.inspectionDetails) {
        updatePayload.inspectionDetails = {
          ...data.inspectionDetails,
          estimatedBudget: practical.budget,
          estimatedBudgetDesc: practical.description,
          budgetBreakdown: practical,
        };
      }

      await updateDoc(doc(db, 'complaints', docSnap.id), cleanDocData(updatePayload));
      updatedCount++;

      console.log(`   ✅ [${updatedCount}/${complaintsSnapshot.size}] #${complaintId} (${issueType.toUpperCase()} - ${severity})`);
      console.log(`      Old Budget: ₹${oldBudget} ──▶ New Practical Budget: ₹${practical.budget.toLocaleString('en-IN')}`);
      console.log(`      • Defect Dimensions : ${practical.defectDimensions}`);
      console.log(`      • Labor Cost        : ₹${practical.laborCost.toLocaleString('en-IN')} (${practical.workersCount} workers × ${practical.estimatedDays} days @ ₹${practical.dailyWagePerWorker}/day)`);
      console.log(`      • Material Cost     : ₹${practical.materialCost.toLocaleString('en-IN')}`);
      console.log(`      • Machinery/Equip   : ₹${practical.machineryCost.toLocaleString('en-IN')}`);
      console.log(`      • Overhead/Safety   : ₹${practical.overheadCost.toLocaleString('en-IN')}`);
      console.log(`      • Scope Description : "${practical.description}"\n`);
    } catch (err) {
      errorCount++;
      console.error(`   ❌ Failed to update complaint #${complaintId}:`, err.message);
    }
  }

  await signOut(auth).catch(() => {});

  console.log('========================================================================');
  console.log(`📊 MIGRATION COMPLETE: ${updatedCount} Complaints Updated, ${errorCount} Errors`);
  console.log('========================================================================\n');

  return { success: errorCount === 0, count: updatedCount, errors: errorCount };
}

if (process.argv[1] && process.argv[1].endsWith('update_all_past_budgets.mjs')) {
  updateAllPastBudgets()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
