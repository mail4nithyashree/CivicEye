import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { checkDescriptionHasNoIssue } from '../services/descriptionClassifier.ts';

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

const BASE_URL = 'http://127.0.0.1:3000';

async function sendValidateRequest(filePath, description = '') {
  let fileBuffer = Buffer.alloc(0);
  let filename = 'test.jpg';
  if (filePath && typeof filePath === 'string' && fs.existsSync(filePath)) {
    fileBuffer = fs.readFileSync(filePath);
    filename = path.basename(filePath);
  } else if (filePath && Buffer.isBuffer(filePath)) {
    fileBuffer = filePath;
  }

  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const pre = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
    `Content-Type: image/jpeg\r\n\r\n`
  );
  const postDesc = Buffer.from(
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="description"\r\n\r\n` +
    `${description}\r\n--${boundary}--\r\n`
  );

  const body = Buffer.concat([pre, fileBuffer, postDesc]);

  const response = await fetch(`${BASE_URL}/api/validate-complaint`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length.toString(),
    },
    body: body,
  });

  return await response.json();
}

async function runComprehensiveValidationTests() {
  console.log('================================================================');
  console.log('🧪 CIVICEYE: IMAGE & DESCRIPTION VALIDATION TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      passed++;
      console.log(`✅ [PASS] ${testName}`);
      if (details) console.log(`   ${details}`);
    } else {
      failed++;
      console.error(`❌ [FAIL] ${testName}`);
      if (details) console.error(`   Details: ${details}`);
    }
  }

  // Authenticate to read complaints
  try {
    await signInWithEmailAndPassword(auth, 'officer.pwd@civiceye.demo', 'Password@123');
  } catch (authErr) {
    console.warn('Auth note:', authErr.message);
  }

  // Count existing complaints in Firestore before test runs
  let initialComplaintCount = 0;
  try {
    const snap = await getDocs(collection(db, 'complaints'));
    initialComplaintCount = snap.size;
    console.log(`ℹ️ [BASELINE] Existing complaints in Firestore: ${initialComplaintCount}\n`);
  } catch (err) {
    console.warn('Could not read baseline complaints count:', err.message);
  }

  console.log('--- 1. POSITIVE CASES: MATCHING RELEVANT ISSUE & DESCRIPTION (ALLOW) ---');

  // Positive Case 1: Matching pothole image & description
  try {
    const res = await sendValidateRequest(
      'AI/test_images/pothole/360_F_706673828_mMCBil00TIR5IMYIA2zoUemEszNVFT4h.jpg',
      'Dangerous pothole on the main road'
    );
    assert(
      res.isValid === true && res.outcome === 'ALLOW' && res.detectedIssue === 'Pothole',
      'Case 1: Pothole image + pothole description -> ALLOW',
      `Outcome: ${res.outcome}, Detected: ${res.detectedIssue}`
    );
  } catch (e) {
    assert(false, 'Case 1: Pothole image + pothole description -> ALLOW', e.message);
  }

  // Positive Case 2: Matching road crack image & description
  try {
    const res = await sendValidateRequest(
      'AI/test_images/alligator_cracking/a4.jpg',
      'Extensive road cracking on the asphalt'
    );
    assert(
      res.isValid === true && res.outcome === 'ALLOW' && (res.detectedIssue === 'Alligator Cracking' || res.detectedIssue === 'Road Cracking' || res.detectedIssue === 'Road Crack'),
      'Case 2: Road-crack image + crack description -> ALLOW',
      `Outcome: ${res.outcome}, Detected: ${res.detectedIssue}`
    );
  } catch (e) {
    assert(false, 'Case 2: Road-crack image + crack description -> ALLOW', e.message);
  }

  // Positive Case 3: Matching streetlight fault image & description
  try {
    const res = await sendValidateRequest(
      'AI/test_images/street_light_fault/detail-shot-broken-street-lamp-260nw-334237046.jpg',
      'Broken streetlight hanging dangerous wire'
    );
    assert(
      res.isValid === true && res.outcome === 'ALLOW',
      'Case 3: Streetlight image + streetlight description -> ALLOW',
      `Outcome: ${res.outcome}, Detected: ${res.detectedIssue}`
    );
  } catch (e) {
    assert(false, 'Case 3: Streetlight image + streetlight description -> ALLOW', e.message);
  }

  // Positive Case 4: Contrastive description ("There is no pothole, but there is a broken streetlight") + streetlight image
  try {
    const res = await sendValidateRequest(
      'AI/test_images/street_light_fault/detail-shot-broken-street-lamp-260nw-334237046.jpg',
      'There is no pothole, but there is a broken streetlight on this road'
    );
    assert(
      res.isValid === true && res.outcome === 'ALLOW',
      'Case 4: "There is no pothole, but there is a broken streetlight" + streetlight image -> ALLOW',
      `Outcome: ${res.outcome}, Detected: ${res.detectedIssue}`
    );
  } catch (e) {
    assert(false, 'Case 4: Contrastive description + streetlight image -> ALLOW', e.message);
  }

  console.log('\n--- 2. NEGATIVE CASES: UNRELATED IMAGES (BLOCK - Outcome B) ---');

  // Negative Case 5: Flower image + pothole description
  try {
    const res = await sendValidateRequest(
      'AI/test_images/flowers_plants/close-up-full-bloom-flower_23-2151921043.jpg',
      'Dangerous pothole crater on the road'
    );
    assert(
      res.isValid === false &&
      res.outcome === 'BLOCK_UNRELATED_IMAGE' &&
      res.title === 'Invalid Issue Image' &&
      res.message.includes('The uploaded image does not match the reported civic issue'),
      'Case 5: Flower image with pothole description -> BLOCK (Invalid Issue Image)',
      `Title: "${res.title}", Message: "${res.message}"`
    );
  } catch (e) {
    assert(false, 'Case 5: Flower image with pothole description -> BLOCK', e.message);
  }

  // Negative Case 6: Animal/pet image + infrastructure description
  try {
    const res = await sendValidateRequest(
      'AI/test_images/animals/animal-4917802_640.jpg',
      'Broken asphalt road damage'
    );
    assert(
      res.isValid === false &&
      res.outcome === 'BLOCK_UNRELATED_IMAGE' &&
      res.title === 'Invalid Issue Image',
      'Case 6: Animal/pet image with infrastructure description -> BLOCK (Invalid Issue Image)',
      `Outcome: ${res.outcome}, Title: "${res.title}"`
    );
  } catch (e) {
    assert(false, 'Case 6: Animal/pet image with infrastructure description -> BLOCK', e.message);
  }

  console.log('\n--- 3. NEGATIVE CASES: NORMAL ROAD / NO ISSUE EVIDENCE (BLOCK - Outcome C) ---');

  // Negative Case 7: Clean road image with no visible issue
  try {
    const res = await sendValidateRequest(
      'AI/test_images/valid_road_no_issue/images.jpg',
      'Clean road surface with no problem'
    );
    assert(
      res.isValid === false &&
      (res.outcome === 'BLOCK_NORMAL_ROAD' || res.outcome === 'BLOCK_NO_ISSUE_DESC') &&
      res.title === 'No Issue Found',
      'Case 7: Clean road image with no visible issue -> BLOCK (No Issue Found)',
      `Outcome: ${res.outcome}, Title: "${res.title}", Message: "${res.message}"`
    );
  } catch (e) {
    assert(false, 'Case 7: Clean road image -> BLOCK', e.message);
  }

  // Positive Case 8: Road image where defect is difficult to see / 0 boxes + pothole description (Authoritative description allows submission)
  try {
    const res = await sendValidateRequest(
      'AI/test_images/valid_road_no_issue/images.jpg',
      'Pothole on this road'
    );
    assert(
      res.isValid === true &&
      res.outcome === 'ALLOW' &&
      res.detectedIssue === 'Pothole',
      'Case 8: Road image with 0 detector boxes + valid pothole description -> ALLOW (Authoritative Description)',
      `Outcome: ${res.outcome}, Issue: "${res.detectedIssue}"`
    );
  } catch (e) {
    assert(false, 'Case 8: Road image with 0 detector boxes + valid pothole description -> ALLOW', e.message);
  }

  console.log('\n--- 4. NEGATIVE CASES: DESCRIPTION INDICATES NO ISSUE (BLOCK - Outcome D) ---');

  // Negative Case 9: "There is no pothole on this road"
  try {
    const res = await sendValidateRequest(
      'AI/test_images/pothole/360_F_706673828_mMCBil00TIR5IMYIA2zoUemEszNVFT4h.jpg',
      'There is no pothole on this road.'
    );
    assert(
      res.isValid === false &&
      res.outcome === 'BLOCK_NO_ISSUE_DESC' &&
      res.title === 'No Issue Found' &&
      res.message.includes('Your description does not report a civic problem'),
      'Case 9: "There is no pothole on this road." -> BLOCK (No Issue Found)',
      `Outcome: ${res.outcome}, Message: "${res.message}"`
    );
  } catch (e) {
    assert(false, 'Case 9: Negated pothole description -> BLOCK', e.message);
  }

  // Negative Case 10: "The road is fine."
  try {
    const res = await sendValidateRequest(
      'AI/test_images/valid_road_no_issue/images.jpg',
      'The road is fine.'
    );
    assert(
      res.isValid === false &&
      res.outcome === 'BLOCK_NO_ISSUE_DESC' &&
      res.title === 'No Issue Found',
      'Case 10: "The road is fine." -> BLOCK (No Issue Found)',
      `Outcome: ${res.outcome}`
    );
  } catch (e) {
    assert(false, 'Case 10: "The road is fine." -> BLOCK', e.message);
  }

  // Negative Case 11: "No damage or problem found."
  try {
    const res = await sendValidateRequest(
      'AI/test_images/valid_road_no_issue/images.jpg',
      'No damage or problem found.'
    );
    assert(
      res.isValid === false &&
      res.outcome === 'BLOCK_NO_ISSUE_DESC' &&
      res.title === 'No Issue Found',
      'Case 11: "No damage or problem found." -> BLOCK (No Issue Found)',
      `Outcome: ${res.outcome}`
    );
  } catch (e) {
    assert(false, 'Case 11: "No damage or problem found." -> BLOCK', e.message);
  }

  // Negative Case 12: "There is no issue here."
  try {
    const res = await sendValidateRequest(
      'AI/test_images/valid_road_no_issue/images.jpg',
      'There is no issue here.'
    );
    assert(
      res.isValid === false &&
      res.outcome === 'BLOCK_NO_ISSUE_DESC' &&
      res.title === 'No Issue Found',
      'Case 12: "There is no issue here." -> BLOCK (No Issue Found)',
      `Outcome: ${res.outcome}`
    );
  } catch (e) {
    assert(false, 'Case 12: "There is no issue here." -> BLOCK', e.message);
  }

  console.log('\n--- 5. NEGATIVE CASES: CONFLICT & CORRUPTED IMAGES (BLOCK - Outcomes E & F) ---');

  // Negative Case 13: Image shows streetlight, description reports pothole (Conflict)
  try {
    const res = await sendValidateRequest(
      'AI/test_images/street_light_fault/detail-shot-broken-street-lamp-260nw-334237046.jpg',
      'Deep pothole crater on this road'
    );
    assert(
      res.isValid === false &&
      (res.outcome === 'BLOCK_CONFLICT' || res.outcome === 'BLOCK_UNRELATED_IMAGE'),
      'Case 13: Streetlight image + pothole description -> BLOCK (Conflict)',
      `Outcome: ${res.outcome}, Title: "${res.title}"`
    );
  } catch (e) {
    assert(false, 'Case 13: Streetlight image + pothole description -> BLOCK', e.message);
  }

  // Negative Case 14: Corrupted / unreadable image
  try {
    const corruptBuffer = Buffer.alloc(80, 0x00);
    const res = await sendValidateRequest(corruptBuffer, 'Pothole on the road');
    assert(
      res.isValid === false &&
      res.outcome === 'BLOCK_UNREADABLE_IMAGE' &&
      res.title === 'Unreadable Image',
      'Case 14: Corrupted / empty image buffer -> BLOCK (Unreadable Image)',
      `Outcome: ${res.outcome}, Title: "${res.title}"`
    );
  } catch (e) {
    assert(false, 'Case 14: Corrupted image buffer -> BLOCK', e.message);
  }

  console.log('\n--- 6. ZERO SIDE EFFECTS & PRE-PERSISTENCE ENFORCEMENT ---');

  // Negative Case 15: Direct checkDescriptionHasNoIssue on no-issue descriptions
  const descCheck1 = checkDescriptionHasNoIssue('The road is fine.');
  const descCheck2 = checkDescriptionHasNoIssue('There is no pothole on this road.');
  const descCheck3 = checkDescriptionHasNoIssue('There is no pothole, but there is a broken streetlight');
  assert(
    descCheck1.isNoIssue === true && descCheck2.isNoIssue === true && descCheck3.isNoIssue === false,
    'Case 15: checkDescriptionHasNoIssue accurately gates no-issue vs contrastive civic defects',
    `Check 1: ${descCheck1.isNoIssue}, Check 2: ${descCheck2.isNoIssue}, Check 3 (contrastive): ${descCheck3.isNoIssue}`
  );

  // Verification 16: Verify Firestore complaints count did NOT increase
  try {
    const snapAfter = await getDocs(collection(db, 'complaints'));
    const finalCount = snapAfter.size;
    assert(
      finalCount === initialComplaintCount,
      `Case 16: Zero Firestore pollution: complaint count remains exactly ${initialComplaintCount} (No records created during negative tests)`,
      `Initial: ${initialComplaintCount}, Final: ${finalCount}`
    );
  } catch (e) {
    assert(false, 'Case 16: Complaint count integrity check', e.message);
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed}/${passed + failed} Tests Passed. (${failed === 0 ? 'ALL PASSED 🎉' : 'FAILURES DETECTED'})`);
  console.log('================================================================');
}

runComprehensiveValidationTests().catch(console.error);
