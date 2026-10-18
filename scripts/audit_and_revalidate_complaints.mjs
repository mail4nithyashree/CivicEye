import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
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

const DEFAULT_DEMO_PASSWORD = 'Password@123';
const BACKEND_URL = 'http://localhost:3000';

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

async function analyzeComplaintImage(imageUri) {
  if (!imageUri) {
    return { status: 'no_image', isDissimilar: false, isClear: false };
  }

  // If it's a data URL or base64
  let base64 = imageUri;
  if (imageUri.startsWith('data:image')) {
    base64 = imageUri.split(',')[1];
  } else if (imageUri.startsWith('file:') || imageUri.startsWith('http')) {
    // If it's a remote/local file URI, we can check basic metadata or fetch if reachable
    return { status: 'external_uri', isDissimilar: false, isClear: true };
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/analyze-road`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64 }),
    });
    if (!response.ok) {
      return { status: 'server_error', isDissimilar: false, isClear: false };
    }
    return await response.json();
  } catch (err) {
    return { status: 'fetch_failed', error: err.message };
  }
}

async function runAudit() {
  const isApply = process.argv.includes('--apply');
  console.log('================================================================');
  console.log('      CIVICEYE HISTORICAL COMPLAINT AUDIT & REVALIDATION        ');
  console.log('================================================================');
  console.log(`Execution Mode: ${isApply ? '⚠️  APPLY (LIVE UPDATES)' : '🔍 PREVIEW ONLY (DRY RUN - SAFE)'}`);
  console.log('----------------------------------------------------------------\n');

  console.log('1. Authenticating officer credentials...');
  await authenticateOfficer();
  console.log('✓ Authenticated successfully.\n');

  console.log('2. Fetching historical complaints from Firestore...');
  const snapshot = await getDocs(collection(db, 'complaints'));
  console.log(`✓ Retrieved ${snapshot.size} complaint records.\n`);

  const summary = {
    total: snapshot.size,
    alreadyRejectedMismatch: 0,
    validRoadDefects: 0,
    validNoIssue: 0,
    uncertainManualReview: 0,
    proposedForMismatchRejection: 0,
    nonRoadDepartments: 0,
    skipped: 0,
  };

  const previewTable = [];

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const id = docSnap.id;
    const complaintId = data.complaintId || id.slice(0, 8);
    const currentStatus = data.status || 'Submitted';
    const dept = data.department || data.responsibleDepartment || 'Road Maintenance';
    const issueType = data.issueType || 'pothole';

    // If already rejected as invalid image / mismatch
    if (currentStatus === 'Invalid Issue image, raise the complaint with the appropriate image!' || currentStatus === 'Dissimilar Image to the Issue' || data.rejectionType === 'IMAGE_MISMATCH') {
      summary.alreadyRejectedMismatch++;
      previewTable.push({
        id: complaintId,
        dept,
        issueType,
        currentStatus,
        finding: 'Already Rejected (Invalid Image)',
        proposedAction: '[NO ACTION] Retain Inactive Greyed-out State',
        confidence: data.confidence ? `${data.confidence}%` : 'N/A',
      });
      continue;
    }

    // Check if complaint has image data to analyze
    if (data.imageUri && (data.imageUri.startsWith('data:image') || data.imageUri.length > 500)) {
      const analysis = await analyzeComplaintImage(data.imageUri);

      if (analysis.status === 'dissimilar_image' || analysis.isDissimilar === true) {
        summary.proposedForMismatchRejection++;
        previewTable.push({
          id: complaintId,
          dept,
          issueType,
          currentStatus,
          finding: '❌ Confirmed Invalid Image (Unrelated / Flower / Pet / Food / Portrait)',
          proposedAction: isApply
            ? '⚡ REJECT -> Invalid Issue image, raise the complaint with the appropriate image!'
            : '⚠️ [FLAG FOR REJECTION] Status -> Invalid Issue image, raise the complaint with the appropriate image!',
          confidence: `${analysis.detectionConfidence || 0}%`,
          reason: analysis.invalidReason || 'Image is unrelated or incompatible with civic infrastructure',
        });

        if (isApply) {
          await updateDoc(doc(db, 'complaints', id), {
            status: 'Invalid Issue image, raise the complaint with the appropriate image!',
            inspectionStatus: 'INVALID',
            rejectionType: 'IMAGE_MISMATCH',
            rejectionReason: 'Invalid Issue image, raise the complaint with the appropriate image!',
            confidence: 0,
            priority: 'NONE',
            severity: 'NONE',
            updatedAt: serverTimestamp(),
          });
        }
      } else if (analysis.status === 'unclear_image' || analysis.isClear === false) {
        summary.uncertainManualReview++;
        previewTable.push({
          id: complaintId,
          dept,
          issueType,
          currentStatus,
          finding: '⚠️ Uncertain / Low Quality Image',
          proposedAction: '[PRESERVE] Keep in manual review queue (Do NOT auto-reject)',
          confidence: `${analysis.detectionConfidence || 0}%`,
        });
      } else if (analysis.status === 'valid_road_no_issue') {
        summary.validNoIssue++;
        previewTable.push({
          id: complaintId,
          dept,
          issueType,
          currentStatus,
          finding: '✓ Clear Road Surface (No Defect)',
          proposedAction: '[PRESERVE] Retain current workflow / citizen review',
          confidence: `${analysis.detectionConfidence || 0}%`,
        });
      } else if (analysis.status === 'valid_road_defect') {
        summary.validRoadDefects++;
        previewTable.push({
          id: complaintId,
          dept,
          issueType,
          currentStatus,
          finding: '✓ Valid Defect Detections',
          proposedAction: '[PRESERVE] Active in maintenance queue',
          confidence: `${analysis.detectionConfidence || 0}%`,
        });
      } else {
        summary.skipped++;
        previewTable.push({
          id: complaintId,
          dept,
          issueType,
          currentStatus,
          finding: `Other (${analysis.status || 'OK'})`,
          proposedAction: '[PRESERVE]',
          confidence: 'N/A',
        });
      }
    } else {
      // Non-road or reference records without base64 images
      if (dept !== 'Road Maintenance') {
        summary.nonRoadDepartments++;
      } else {
        summary.skipped++;
      }
      previewTable.push({
        id: complaintId,
        dept,
        issueType,
        currentStatus,
        finding: 'Preserved (External / Demo URI)',
        proposedAction: '[PRESERVE] Keep current status',
        confidence: 'N/A',
      });
    }
  }

  console.log('----------------------------------------------------------------');
  console.log('AUDIT PREVIEW RESULTS:');
  console.log('----------------------------------------------------------------');
  console.table(previewTable.map(item => ({
    'Complaint ID': item.id,
    'Department': item.dept,
    'Issue Type': item.issueType,
    'Current Status': item.currentStatus,
    'Revalidation Finding': item.finding,
    'Proposed Action': item.proposedAction,
  })));

  console.log('\n----------------------------------------------------------------');
  console.log('AUDIT & REVALIDATION SUMMARY:');
  console.log('----------------------------------------------------------------');
  console.log(`Total Historical Records Scanned:          ${summary.total}`);
  console.log(`Already Inactive (Invalid Image):          ${summary.alreadyRejectedMismatch}`);
  console.log(`Proposed for Invalid Image Rejection:      ${summary.proposedForMismatchRejection}`);
  console.log(`Uncertain / Preserved for Manual Review:   ${summary.uncertainManualReview}`);
  console.log(`Valid Road Defects Preserved:              ${summary.validRoadDefects}`);
  console.log(`Valid Clear Road Surfaces (No Defect):     ${summary.validNoIssue}`);
  console.log(`Other / Non-Road / Demo Records:           ${summary.nonRoadDepartments + summary.skipped}`);
  console.log('----------------------------------------------------------------');

  if (!isApply) {
    console.log('\n🔒 SAFEGUARD ACTIVE: No records were modified in Firestore.');
    console.log('To apply these revalidation updates, run with the `--apply` flag:');
    console.log('  node scripts/audit_and_revalidate_complaints.mjs --apply\n');
  } else {
    console.log('\n⚡ LIVE UPDATE COMPLETE: Records updated to `Invalid Issue image, raise the complaint with the appropriate image!` in Firestore.\n');
  }
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
