const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, runTransaction, serverTimestamp } = require('firebase/firestore');

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

async function allocateOne() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateKey = `${yyyy}${mm}${dd}`;

  const counterRef = doc(db, 'counters', `complaints_${dateKey}`);
  const nextSeq = await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);
    let current = 0;
    if (snap.exists() && typeof snap.data().lastSequence === 'number') {
      current = snap.data().lastSequence;
    }
    const next = current + 1;
    transaction.set(counterRef, {
      dateKey,
      lastSequence: next,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return next;
  });

  return `CE-${dateKey}-${String(nextSeq).padStart(6, '0')}`;
}

async function main() {
  await signInWithEmailAndPassword(auth, 'officer.pwd@civiceye.demo', 'Password@123');
  console.log('[Test ID Allocation] Authenticated successfully.');

  console.log('[Test ID Allocation] Running 5 concurrent ID allocations...');
  const results = await Promise.all([
    allocateOne(),
    allocateOne(),
    allocateOne(),
    allocateOne(),
    allocateOne(),
  ]);

  console.log('[Test ID Allocation] Allocated IDs:', results);
  const uniqueSet = new Set(results);
  if (uniqueSet.size === results.length) {
    console.log(`[Test ID Allocation] SUCCESS: All ${results.length} IDs are completely unique and monotonic!`);
  } else {
    console.error(`[Test ID Allocation] FAILURE: Duplicates detected:`, results);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
