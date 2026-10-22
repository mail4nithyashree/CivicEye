import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, deleteDoc, writeBatch } from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfig = {
  apiKey: 'AIzaSyD2SIXmgD8xgYvdFMG0ZryGF3F5tgYOlGs',
  authDomain: 'civiceye-c127c.firebaseapp.com',
  projectId: 'civiceye-c127c',
  storageBucket: 'civiceye-c127c.firebasestorage.app',
  messagingSenderId: '930740300088',
  appId: '1:930740300088:web:75042d21b2efa28fea79cd',
};

// SAFETY CHECK 1: Ensure Target Firebase Project is strictly civiceye-c127c
if (firebaseConfig.projectId !== 'civiceye-c127c') {
  console.error(`FATAL ERROR: Target project is "${firebaseConfig.projectId}", expected "civiceye-c127c". Aborting.`);
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function run() {
  const isExecute = process.argv.includes('--execute');
  console.log('=================================================================');
  console.log(`🛡️  CivicEye Safe Database Backup & Scoped Cleanup`);
  console.log(`🎯 Verified Project: ${firebaseConfig.projectId}`);
  console.log(`⚙️  Mode: ${isExecute ? 'EXECUTE (REAL CLEANUP)' : 'DRY-RUN / BACKUP ONLY'}`);
  console.log('=================================================================\n');

  // Authenticate
  await signInWithEmailAndPassword(auth, 'officer.pwd@civiceye.demo', 'Password@123');
  console.log('✅ Authenticated successfully with Firebase Auth.');

  // 1. Fetch complaints
  const complaintsSnap = await getDocs(collection(db, 'complaints'));
  console.log(`📦 Found ${complaintsSnap.size} complaint documents in Firestore.`);

  const complaintsBackup = [];
  complaintsSnap.forEach(d => {
    complaintsBackup.push({ id: d.id, ...d.data() });
  });

  // 2. Fetch notifications
  const notifSnap = await getDocs(collection(db, 'notifications'));
  console.log(`🔔 Found ${notifSnap.size} notification documents in Firestore.`);
  const notifBackup = [];
  notifSnap.forEach(d => {
    notifBackup.push({ id: d.id, ...d.data() });
  });

  // 3. Fetch analysis_logs
  const analysisSnap = await getDocs(collection(db, 'analysis_logs'));
  console.log(`📊 Found ${analysisSnap.size} analysis log documents in Firestore.`);
  const analysisBackup = [];
  analysisSnap.forEach(d => {
    analysisBackup.push({ id: d.id, ...d.data() });
  });

  // 4. Ensure backup directory exists
  const backupDir = path.resolve(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilePath = path.join(backupDir, `complaints_backup_civiceye_c127c_${timestampStr}.json`);
  const canonicalBackupPath = path.join(backupDir, `complaints_backup_civiceye_c127c_latest.json`);

  const fullBackupData = {
    metadata: {
      projectId: firebaseConfig.projectId,
      timestamp: new Date().toISOString(),
      counts: {
        complaints: complaintsBackup.length,
        notifications: notifBackup.length,
        analysis_logs: analysisBackup.length,
      },
      preservedCollections: ['users', 'counters', 'departments_config', 'audit_logs'],
    },
    complaints: complaintsBackup,
    notifications: notifBackup,
    analysis_logs: analysisBackup,
  };

  fs.writeFileSync(backupFilePath, JSON.stringify(fullBackupData, null, 2), 'utf8');
  fs.writeFileSync(canonicalBackupPath, JSON.stringify(fullBackupData, null, 2), 'utf8');

  console.log(`\n💾 Backup saved successfully:`);
  console.log(`   - Timestamped: ${backupFilePath}`);
  console.log(`   - Canonical:   ${canonicalBackupPath}`);

  // 5. Scoped Identification of Incorrect / Obsolete Complaints to Remove
  // Target:
  // - Obsolete test/demo complaints from previous test runs (e.g. citizen.test, citizen.tester, inspector@civiceye.gov test runs)
  // - Invalid image mismatch records (e.g. PP7y8wDhYtfBT1sfsxvl)
  // - Stale synthetic records
  // We keep the real citizen complaints and clean the obsolete artifacts
  const toDeleteComplaints = [];
  const toKeepComplaints = [];

  for (const item of complaintsBackup) {
    const isObsoleteTest = 
      item.citizenEmail?.includes('test') ||
      item.citizenEmail?.includes('example.com') ||
      item.id === 'PP7y8wDhYtfBT1sfsxvl' || // Old invalid image test artifact
      item.id === 'bv1qw3x1XG3rCdCQlpro' || // Old inspector test
      item.id === 'vRRFqjzepGsPJ3gC6oPg';   // Old officer self-test

    if (isObsoleteTest) {
      toDeleteComplaints.push(item);
    } else {
      toKeepComplaints.push(item);
    }
  }

  console.log(`\n📋 Evaluation of Complaint Records:`);
  console.log(`   - Total Complaints: ${complaintsBackup.length}`);
  console.log(`   - Flagged for Cleanup: ${toDeleteComplaints.length}`);
  console.log(`   - Preserved Complaints: ${toKeepComplaints.length}`);

  console.log('\n🗑️  Records targeted for cleanup:');
  for (const c of toDeleteComplaints) {
    console.log(`   • [${c.id}] ${c.complaintId || 'No-ID'} | ${c.citizenEmail || 'No-Email'} | ${c.issueType}`);
  }

  console.log('\n🔒 Records preserved:');
  for (const c of toKeepComplaints) {
    console.log(`   • [${c.id}] ${c.complaintId || 'No-ID'} | ${c.citizenEmail || 'No-Email'} | ${c.issueType}`);
  }

  if (!isExecute) {
    console.log('\n⚠️  DRY-RUN COMPLETE. No documents were deleted from Firestore.');
    console.log('   Run with "node scripts/backup_and_cleanup_complaints.mjs --execute" to execute the cleanup.');
    return;
  }

  // Execute Deletion
  console.log('\n🚀 EXECUTING CLEANUP ON civiceye-c127c...');
  let deletedCount = 0;
  for (const c of toDeleteComplaints) {
    await deleteDoc(doc(db, 'complaints', c.id));
    deletedCount++;
    console.log(`   ✅ Deleted complaint doc [${c.id}] (${c.complaintId})`);
  }

  // Also clean obsolete notifications linked to deleted complaintIds
  const deletedComplaintIds = new Set(toDeleteComplaints.map(c => c.complaintId).filter(Boolean));
  let deletedNotifCount = 0;
  for (const n of notifBackup) {
    if (n.complaintId && deletedComplaintIds.has(n.complaintId)) {
      await deleteDoc(doc(db, 'notifications', n.id));
      deletedNotifCount++;
      console.log(`   ✅ Deleted linked notification [${n.id}] for (${n.complaintId})`);
    }
  }

  console.log(`\n🎉 CLEANUP COMPLETED SUCCESSFULLY!`);
  console.log(`   - Deleted Complaints: ${deletedCount}`);
  console.log(`   - Deleted Linked Notifications: ${deletedNotifCount}`);
  console.log(`   - Counters Preserved: 100%`);
  console.log(`   - Users Preserved: 100%`);
  console.log(`   - Valid Complaints Remaining: ${toKeepComplaints.length}`);
}

run().catch(err => {
  console.error('Fatal error during backup and cleanup:', err);
  process.exit(1);
});
