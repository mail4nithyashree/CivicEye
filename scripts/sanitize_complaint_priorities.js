const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, collection, getDocs, doc, updateDoc } = require('firebase/firestore');

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

function shouldBeNonePriority(data) {
  const status = (data.status || '').toLowerCase();
  const issue = (data.issueType || '').toLowerCase();
  const analysisStatus = (data.analysisStatus || '').toLowerCase();
  const rejType = (data.rejectionType || '').toLowerCase();

  if (status.includes('dissimilar') || status.includes('invalid') || status.includes('rejected')) return true;
  if (analysisStatus === 'no_major_issue' || analysisStatus === 'dissimilar_image' || analysisStatus === 'unclear_image') return true;
  if (issue.includes('no supported issue') || issue.includes('invalid') || issue.includes('dissimilar')) return true;
  if (rejType === 'image_mismatch' || rejType === 'invalid_image') return true;
  return false;
}

async function sanitize() {
  console.log('[Sanitize] Authenticating with Firebase...');
  await signInWithEmailAndPassword(auth, 'officer.pwd@civiceye.demo', 'Password@123');
  const snap = await getDocs(collection(db, 'complaints'));
  console.log(`[Sanitize] Inspecting ${snap.size} complaint documents...`);

  let updatedCount = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (shouldBeNonePriority(data)) {
      if (data.priority !== 'NONE' || data.severity !== 'NONE') {
        console.log(`[Sanitize] Updating doc ${docSnap.id} (ID: ${data.complaintId}, Status: ${data.status}) from Priority: ${data.priority}, Severity: ${data.severity} -> NONE`);
        await updateDoc(doc(db, 'complaints', docSnap.id), {
          priority: 'NONE',
          severity: 'NONE',
        });
        updatedCount++;
      }
    }
  }

  console.log(`[Sanitize] Completed. Updated ${updatedCount} documents to Priority/Severity NONE.`);
}

sanitize().catch(err => {
  console.error('[Sanitize] Error:', err);
  process.exit(1);
});
