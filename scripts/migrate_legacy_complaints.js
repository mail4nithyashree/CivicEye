/**
 * CivicEye - Safe, Idempotent Legacy Complaint ID Migration
 *
 * Scans all documents in 'complaints' collection in Firestore civiceye-c127c.
 * For each document whose complaintId does NOT match 'CE-YYYYMMDD-######':
 * 1. Derives YYYYMMDD in Asia/Kolkata timezone from createdAt (or current system date).
 * 2. Uses atomic Firestore transaction on 'counters/complaints_YYYYMMDD' to allocate a canonical sequential ID.
 * 3. Updates complaint document with:
 *    - complaintId: 'CE-YYYYMMDD-######'
 *    - legacyComplaintId: old ID preserved for audit trail
 *    - migratedAt: server timestamp
 * 4. Finds all linked notifications matching doc.id or legacyComplaintId and updates their messages to use the new canonical ID.
 */

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore,
  collection,
  doc,
  getDocs,
  updateDoc,
  runTransaction,
  serverTimestamp,
  query,
  where,
} = require('firebase/firestore');

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

function getKolkataDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date).replace(/-/g, '');
}

async function allocateCanonicalId(dateKey) {
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

async function migrateComplaints() {
  console.log('--- Starting CivicEye Legacy Complaint ID Migration ---');
  await signInWithEmailAndPassword(auth, 'officer.pwd@civiceye.demo', 'Password@123');
  console.log('✓ Authenticated as Officer in civiceye-c127c');

  const complaintsSnap = await getDocs(collection(db, 'complaints'));
  console.log(`Found ${complaintsSnap.size} complaint documents in Firestore.`);

  const canonicalRegex = /^CE-\d{8}-\d{6}$/;
  const migrationMap = new Map(); // oldId/docId -> newCanonicalId

  // Sort complaints by creation date to maintain historical order
  const docsList = [];
  complaintsSnap.forEach(d => {
    const data = d.data();
    let createdDate = new Date();
    if (data.createdAt) {
      if (typeof data.createdAt.toDate === 'function') {
        createdDate = data.createdAt.toDate();
      } else if (data.createdAt instanceof Date) {
        createdDate = data.createdAt;
      } else if (typeof data.createdAt === 'string') {
        const parsed = new Date(data.createdAt);
        if (!isNaN(parsed.getTime())) createdDate = parsed;
      }
    }
    docsList.push({ id: d.id, data, createdDate });
  });

  docsList.sort((a, b) => a.createdDate.getTime() - b.createdDate.getTime());

  for (const item of docsList) {
    const currentId = item.data.complaintId;
    if (currentId && canonicalRegex.test(currentId)) {
      console.log(`✓ Complaint ${item.id} already has canonical ID: ${currentId}. Preserving.`);
      continue;
    }

    const dateKey = getKolkataDateKey(item.createdDate);
    const newCanonicalId = await allocateCanonicalId(dateKey);

    console.log(`→ Migrating Complaint ${item.id}: [${currentId || 'MISSING'}] ==> ${newCanonicalId} (DateKey: ${dateKey})`);

    const updatePayload = {
      complaintId: newCanonicalId,
      legacyComplaintId: currentId || null,
      migratedAt: serverTimestamp(),
    };

    // Update status history if remarks referenced the old ID
    if (Array.isArray(item.data.statusHistory)) {
      updatePayload.statusHistory = item.data.statusHistory.map(h => {
        let remarks = h.remarks || '';
        if (currentId && remarks.includes(currentId)) {
          remarks = remarks.replace(new RegExp(`#?${currentId}`, 'g'), newCanonicalId);
        }
        return { ...h, remarks };
      });
    }

    await updateDoc(doc(db, 'complaints', item.id), updatePayload);

    migrationMap.set(item.id, { oldId: currentId, newId: newCanonicalId });
    if (currentId) {
      migrationMap.set(currentId, { oldId: currentId, newId: newCanonicalId });
    }
  }

  console.log(`\n--- Migrating linked notifications (${migrationMap.size} complaint mappings) ---`);
  const notifsSnap = await getDocs(collection(db, 'notifications'));
  let updatedNotifsCount = 0;

  for (const notifDoc of notifsSnap.docs) {
    const notif = notifDoc.data();
    let changed = false;
    let newMsg = notif.message || '';
    let newTitle = notif.title || '';

    for (const [key, mapping] of migrationMap.entries()) {
      const oldId = mapping.oldId;
      const newId = mapping.newId;

      if (oldId && newMsg.includes(oldId)) {
        newMsg = newMsg.replace(new RegExp(`\\(#?${oldId}\\)`, 'g'), `(${newId})`);
        newMsg = newMsg.replace(new RegExp(`#?${oldId}`, 'g'), newId);
        changed = true;
      }
      if (oldId && newTitle.includes(oldId)) {
        newTitle = newTitle.replace(new RegExp(`#?${oldId}`, 'g'), newId);
        changed = true;
      }
    }

    // Also remove any stray '#' before complaint IDs
    if (newMsg.includes('#CE-')) {
      newMsg = newMsg.replace(/#CE-/g, 'CE-');
      changed = true;
    }

    if (changed) {
      await updateDoc(doc(db, 'notifications', notifDoc.id), {
        message: newMsg,
        title: newTitle,
        updatedAt: serverTimestamp(),
      });
      updatedNotifsCount++;
      console.log(`Updated notification ${notifDoc.id}: ${newMsg.substring(0, 80)}...`);
    }
  }

  console.log(`\n✓ Migration Complete! Updated ${docsList.length} complaints and ${updatedNotifsCount} notifications.`);
}

migrateComplaints().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
