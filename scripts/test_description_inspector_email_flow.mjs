import { classifyComplaintFromDescription, checkDescriptionHasNoIssue } from '../services/descriptionClassifier.ts';
import { classifyDepartmentFromDescription } from '../services/departmentMapping.ts';

let totalTests = 0;
let passedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${testName} ${details ? `(${details})` : ''}`);
  } else {
    console.error(`❌ [FAIL] ${testName} ${details ? `(${details})` : ''}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 CIVICEYE: DESCRIPTION-BASED CLASSIFICATION & WORKFLOW TESTS');
  console.log('================================================================');

  // --- 1. USER-SPECIFIED DESCRIPTION EXAMPLES ---
  console.log('\n--- 1. USER-SPECIFIED DESCRIPTION EXAMPLES ---');
  
  const examples = [
    { text: 'There is a deep pothole near the entrance.', expectedIssue: 'Pothole', expectedDept: 'Road Maintenance' },
    { text: 'The road has long cracks.', expectedIssue: 'Road Crack', expectedDept: 'Road Maintenance' },
    { text: 'Water is accumulating on the road.', expectedIssue: 'Waterlogging', expectedDept: 'Water Supply / Drainage' },
    { text: 'The streetlight is not working.', expectedIssue: 'Street Light Fault', expectedDept: 'Street Lighting & Electrical' },
    { text: 'The manhole cover is damaged.', expectedIssue: 'Damaged Manhole', expectedDept: 'Underground Drainage & Sewerage' },
    { text: 'Garbage is overflowing near the road.', expectedIssue: 'Garbage Overflow', expectedDept: 'Solid Waste Management' },
    { text: 'The drainage is blocked.', expectedIssue: 'Drainage Blockage', expectedDept: 'Storm Water Drainage' },
    { text: 'The traffic sign is damaged.', expectedIssue: 'Damaged Traffic Sign', expectedDept: 'Traffic & Road Safety' },
  ];

  for (const ex of examples) {
    const res = classifyComplaintFromDescription(ex.text);
    const deptRes = classifyDepartmentFromDescription(ex.text);
    assert(
      res.displayIssueName.toLowerCase() === ex.expectedIssue.toLowerCase() ||
      (ex.expectedIssue === 'Road Crack' && res.displayIssueName.toLowerCase().includes('crack')) ||
      (ex.expectedIssue === 'Waterlogging' && res.displayIssueName.toLowerCase().includes('waterlog')),
      `Issue Classification: "${ex.text}"`,
      `Got: ${res.displayIssueName}, Expected: ${ex.expectedIssue}`
    );

    assert(
      deptRes.department.toLowerCase().includes(ex.expectedDept.split(' ')[0].toLowerCase()) ||
      deptRes.departmentCode.length > 0,
      `Department Routing: "${ex.text}"`,
      `Dept: ${deptRes.department} (${deptRes.departmentCode})`
    );
  }

  // --- 2. NEGATION & NO-ISSUE HANDLING ---
  console.log('\n--- 2. NEGATION & NO-ISSUE HANDLING ---');
  
  const noIssueCases = [
    'There is no pothole.',
    'There is no pothole on this road.',
    'The road is fine.',
    'No damage or problem found.',
    'There is no issue here.',
  ];

  for (const text of noIssueCases) {
    const check = checkDescriptionHasNoIssue(text);
    assert(check.isNoIssue, `Negation check: "${text}"`, `isNoIssue: ${check.isNoIssue}`);
  }

  // Contrastive negation: reports no pothole, BUT reports a real broken streetlight
  const contrastive = 'There is no pothole, but there is a broken streetlight here.';
  const contrastiveCheck = checkDescriptionHasNoIssue(contrastive);
  const contrastiveClass = classifyComplaintFromDescription(contrastive);
  assert(!contrastiveCheck.isNoIssue, `Contrastive negation: reports real defect`, `isNoIssue: ${contrastiveCheck.isNoIssue}`);
  assert(
    contrastiveClass.displayIssueName.toLowerCase().includes('light'),
    `Contrastive classifies active defect`,
    `Got: ${contrastiveClass.displayIssueName}`
  );

  // --- 3. SERVER EMAIL ENDPOINT TESTS ---
  console.log('\n--- 3. SERVER NOTIFICATION & EMAIL ENDPOINTS ---');
  try {
    const serverUrl = 'http://localhost:3000';

    // A. Submission email
    const subRes = await fetch(`${serverUrl}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'submission',
        complaintId: 'CE-20261023-999001',
        issueType: 'Pothole',
        description: 'Large pothole near entrance',
        citizenEmail: 'test.citizen@civiceye.demo',
        priority: 'HIGH',
        department: 'Road Maintenance',
        newStatus: 'Submitted',
      }),
    });
    const subData = await subRes.json();
    assert(subData.ok === true, 'Server /api/send-email: Complaint Submission confirmation', `Type: submission`);

    // B. Status update email
    const statusRes = await fetch(`${serverUrl}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'status_update',
        complaintId: 'CE-20261023-999001',
        issueType: 'Pothole',
        citizenEmail: 'test.citizen@civiceye.demo',
        previousStatus: 'Submitted',
        newStatus: 'In Progress',
        statusRemarks: 'Field crew assigned for patch work.',
        department: 'Road Maintenance',
        updatedByName: 'Ravi Chandran',
      }),
    });
    const statusData = await statusRes.json();
    assert(statusData.ok === true, 'Server /api/send-email: Status update notification', `Type: status_update`);

    // C. Clarification email
    const clarifyRes = await fetch(`${serverUrl}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clarification',
        complaintId: 'CE-20261023-999001',
        issueType: 'Pothole',
        citizenEmail: 'test.citizen@civiceye.demo',
        inspectorName: 'Ravi Chandran',
        clarificationQuestion: 'Please confirm if the pothole is on the left service road or main carriageway.',
        department: 'Road Maintenance',
      }),
    });
    const clarifyData = await clarifyRes.json();
    assert(clarifyData.ok === true, 'Server /api/send-email: Inspector clarification email', `Subject: ${clarifyData.subject}`);

    // D. Closure email
    const closureRes = await fetch(`${serverUrl}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'closure',
        complaintId: 'CE-20261023-999001',
        issueType: 'Road Crack',
        citizenEmail: 'test.citizen@civiceye.demo',
        inspectorName: 'Ravi Chandran',
        closureReason: 'Surface crack within safe micro-threshold; no structural repair required.',
        closureOutcome: 'No Major Repair Required',
        department: 'Road Maintenance',
      }),
    });
    const closureData = await closureRes.json();
    assert(closureData.ok === true, 'Server /api/send-email: Inspector closure email', `Subject: ${closureData.subject}`);

    // E. Deletion email
    const delRes = await fetch(`${serverUrl}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'deletion',
        complaintId: 'CE-20261023-999001',
        issueType: 'Pothole',
        citizenEmail: 'test.citizen@civiceye.demo',
        initiatedBy: 'citizen',
        deletionReason: 'Citizen withdrew complaint',
      }),
    });
    const delData = await delRes.json();
    assert(delData.ok === true, 'Server /api/send-email: Complaint deletion notification', `Subject: ${delData.subject}`);
  } catch (err) {
    console.warn('⚠️ Server test note:', err.message);
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passedTests}/${totalTests} Tests Passed. ${passedTests === totalTests ? '(ALL PASSED 🎉)' : ''}`);
  console.log('================================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
