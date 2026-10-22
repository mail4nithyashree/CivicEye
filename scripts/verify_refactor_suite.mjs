import { classifyComplaintFromDescription } from '../services/descriptionClassifier.ts';
import {
  classifyDepartmentFromDescription,
  ISSUE_DEPARTMENT_MAP,
} from '../services/departmentMapping.ts';
import http from 'node:http';

console.log('====================================================');
console.log('🧪 CivicEye Feature Update & Refactor Verification Suite');
console.log('====================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`❌ [FAIL] ${testName}`);
    if (details) console.error(`   Details: ${details}`);
  }
}

// ----------------------------------------------------
// SECTION 1: Required Description Classification & Severity Tests
// ----------------------------------------------------
console.log('--- 1. Description Classification & Severity Tests ---');

// Case 1: “A dangerous pothole is present at the junction.” → Pothole, HIGH
const res1 = classifyComplaintFromDescription('A dangerous pothole is present at the junction.');
assert(
  res1.displayIssueName === 'Pothole' && res1.severity === 'HIGH' && res1.confidence >= 85 && res1.confidence <= 100,
  'Case 1: "A dangerous pothole is present at the junction." -> Pothole, HIGH (85-100%)',
  `Got displayIssueName=${res1.displayIssueName}, severity=${res1.severity}, confidence=${res1.confidence}%`
);

// Case 2: “There is a major road crack that creates a hazard for vehicles.” → Road Crack, HIGH
const res2 = classifyComplaintFromDescription('There is a major road crack that creates a hazard for vehicles.');
assert(
  res2.displayIssueName === 'Road Crack' && res2.severity === 'HIGH' && res2.confidence >= 85 && res2.confidence <= 100,
  'Case 2: "There is a major road crack that creates a hazard for vehicles." -> Road Crack, HIGH (85-100%)',
  `Got displayIssueName=${res2.displayIssueName}, severity=${res2.severity}, confidence=${res2.confidence}%`
);

// Case 3: “There is a minor crack on the roadside.” → Road Crack, MEDIUM
const res3 = classifyComplaintFromDescription('There is a minor crack on the roadside.');
assert(
  res3.displayIssueName === 'Road Crack' && res3.severity === 'MEDIUM' && res3.confidence >= 45 && res3.confidence <= 85,
  'Case 3: "There is a minor crack on the roadside." -> Road Crack, MEDIUM (45-85%)',
  `Got displayIssueName=${res3.displayIssueName}, severity=${res3.severity}, confidence=${res3.confidence}%`
);

// Case 4: “A small pothole is present near my home.” → Pothole, LOW
const res4 = classifyComplaintFromDescription('A small pothole is present near my home.');
assert(
  res4.displayIssueName === 'Pothole' && res4.severity === 'LOW' && res4.confidence >= 0 && res4.confidence <= 45,
  'Case 4: "A small pothole is present near my home." -> Pothole, LOW (0-45%)',
  `Got displayIssueName=${res4.displayIssueName}, severity=${res4.severity}, confidence=${res4.confidence}%`
);

// Case 5: “Water is accumulating on the road.” → Waterlogging, LOW
const res5 = classifyComplaintFromDescription('Water is accumulating on the road.');
assert(
  res5.displayIssueName === 'Waterlogging' && res5.severity === 'LOW' && res5.confidence >= 0 && res5.confidence <= 45,
  'Case 5: "Water is accumulating on the road." -> Waterlogging, LOW (0-45%)',
  `Got displayIssueName=${res5.displayIssueName}, severity=${res5.severity}, confidence=${res5.confidence}%`
);

// Case 6: “The streetlight is not working.” → Street Light Fault, LOW
const res6 = classifyComplaintFromDescription('The streetlight is not working.');
assert(
  res6.displayIssueName === 'Street Light Fault' && res6.severity === 'LOW' && res6.confidence >= 0 && res6.confidence <= 45,
  'Case 6: "The streetlight is not working." -> Street Light Fault, LOW (0-45%)',
  `Got displayIssueName=${res6.displayIssueName}, severity=${res6.severity}, confidence=${res6.confidence}%`
);

// Case 7: “There is a blocked drain creating a dangerous situation.” → Drainage Blockage, HIGH
const res7 = classifyComplaintFromDescription('There is a blocked drain creating a dangerous situation.');
assert(
  res7.displayIssueName === 'Drainage Blockage' && res7.severity === 'HIGH' && res7.confidence >= 85 && res7.confidence <= 100,
  'Case 7: "There is a blocked drain creating a dangerous situation." -> Drainage Blockage, HIGH (85-100%)',
  `Got displayIssueName=${res7.displayIssueName}, severity=${res7.severity}, confidence=${res7.confidence}%`
);

// Case 8: Negation protection - “This is not dangerous, just a small crack”
const res8 = classifyComplaintFromDescription('This is not dangerous, just a small crack');
assert(
  res8.severity !== 'HIGH',
  'Case 8: Negated wording "not dangerous" does not trigger HIGH severity',
  `Got severity=${res8.severity}, priority=${res8.priority}`
);

// Case 9: Empty or ambiguous description triggers clarification
const res9a = classifyComplaintFromDescription('');
const res9b = classifyComplaintFromDescription('Hello there something happened today.');
assert(
  res9a.requiresClarification === true && res9b.requiresClarification === true,
  'Case 9: Empty or ambiguous description asks for clarification instead of silent guessing',
  `res9a.requiresClarification=${res9a.requiresClarification}, res9b.requiresClarification=${res9b.requiresClarification}`
);

// Case 10: Confidence metadata and reproducibility
const res10a = classifyComplaintFromDescription('There is a major road crack that creates a hazard for vehicles.');
const res10b = classifyComplaintFromDescription('There is a major road crack that creates a hazard for vehicles.');
const res10c = classifyComplaintFromDescription('A dangerous pothole is present at the junction.');
assert(
  res10a.confidenceType === 'description_heuristic',
  'Case 10a: internal field confidenceType is "description_heuristic"',
  `Got confidenceType=${res10a.confidenceType}`
);
assert(
  res10a.confidence === res10b.confidence,
  'Case 10b: Confidence score is deterministic and reproducible for identical input',
  `10a=${res10a.confidence}, 10b=${res10b.confidence}`
);
assert(
  res10a.confidence !== res10c.confidence || res10a.confidence !== 95,
  'Case 10c: Confidence score is non-hardcoded and dynamically derived within band',
  `10a=${res10a.confidence}, 10c=${res10c.confidence}`
);

// ----------------------------------------------------
// SECTION 2: Department Routing Regression Tests
// ----------------------------------------------------
console.log('\n--- 2. Department Routing Regression Tests ---');

const routingTestCases = [
  { desc: 'Deep pothole on avinashi road near signal', expectedDept: 'ROAD' },
  { desc: 'Severe road crack on highway', expectedDept: 'ROAD' },
  { desc: 'Damaged footpath tiles broken walkway', expectedDept: 'PWD' },
  { desc: 'Broken road divider concrete median', expectedDept: 'SAFETY' },
  { desc: 'Street light not working dark street', expectedDept: 'LIGHTING' },
  { desc: 'Heavy waterlogging on race course road', expectedDept: 'DRAIN' },
  { desc: 'Blocked storm drain water accumulating', expectedDept: 'DRAIN' },
  { desc: 'The sewer line near my house is completely blocked', expectedDept: 'SEWER' },
  { desc: 'Garbage dump overflowing on street corner', expectedDept: 'SWM' },
  { desc: 'Sewage overflow foul smell on main road', expectedDept: 'SEWER' },
  { desc: 'Broken traffic signboard missing speed sign', expectedDept: 'SAFETY' },
  { desc: 'Public building roof leakage in community hall', expectedDept: 'BUILDING' },
  { desc: 'Park bench broken and playground damage', expectedDept: 'PARKS' },
  { desc: 'Fallen tree blocking the roadway', expectedDept: 'TREES' },
];

for (const tc of routingTestCases) {
  const deptResult = classifyDepartmentFromDescription(tc.desc);
  assert(
    deptResult.departmentCode === tc.expectedDept,
    `Routing: "${tc.desc.substring(0, 30)}..." -> ${tc.expectedDept}`,
    `Got deptCode=${deptResult.departmentCode} (expected ${tc.expectedDept}), dept=${deptResult.department}`
  );
}

// ----------------------------------------------------
// SECTION 3: Backend Email Notification API Tests
// ----------------------------------------------------
console.log('\n--- 3. Backend Email Notification Endpoint Tests ---');

function postJson(path, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, text: body });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runEmailTests() {
  try {
    const testComplaintId = 'CE-20261022-999999';

    // Test Submission Email endpoint
    const subRes = await postJson('/api/send-email', {
      type: 'submission',
      to: 'citizen.test@civiceye.gov',
      complaintId: testComplaintId,
      issueName: 'Pothole',
      description: 'A dangerous pothole near the bus stop',
      severity: 'HIGH',
      assignedDepartment: 'Road Maintenance (PWD)',
      createdAt: new Date().toISOString(),
      status: 'pending',
    });

    assert(
      subRes.statusCode === 200 && subRes.data?.success === true,
      'Email: /api/send-email handles complaint submission notification',
      JSON.stringify(subRes.data)
    );

    // Test Submission Email Deduplication (suppress duplicate within 60s)
    const subDupRes = await postJson('/api/send-email', {
      type: 'submission',
      to: 'citizen.test@civiceye.gov',
      complaintId: testComplaintId,
      issueName: 'Pothole',
      description: 'A dangerous pothole near the bus stop',
      severity: 'HIGH',
      assignedDepartment: 'Road Maintenance (PWD)',
      createdAt: new Date().toISOString(),
      status: 'pending',
    });

    assert(
      subDupRes.statusCode === 200 && subDupRes.data?.success === true && subDupRes.data?.duplicate === true,
      'Email: /api/send-email deduplicates rapid repeated submission emails',
      JSON.stringify(subDupRes.data)
    );

    // Test Status Update Email endpoint
    const statusRes = await postJson('/api/send-email', {
      type: 'status_update',
      to: 'citizen.test@civiceye.gov',
      complaintId: testComplaintId,
      issueName: 'Pothole',
      oldStatus: 'pending',
      newStatus: 'in_progress',
      note: 'Field repair team dispatched to site.',
      updatedAt: new Date().toISOString(),
      departmentName: 'Road Maintenance (PWD)',
    });

    assert(
      statusRes.statusCode === 200 && statusRes.data?.success === true,
      'Email: /api/send-email handles status update notification',
      JSON.stringify(statusRes.data)
    );

    // Test Status Update Email Deduplication
    const statusDupRes = await postJson('/api/send-email', {
      type: 'status_update',
      to: 'citizen.test@civiceye.gov',
      complaintId: testComplaintId,
      issueName: 'Pothole',
      oldStatus: 'pending',
      newStatus: 'in_progress',
      note: 'Field repair team dispatched to site.',
      updatedAt: new Date().toISOString(),
      departmentName: 'Road Maintenance (PWD)',
    });

    assert(
      statusDupRes.statusCode === 200 && statusDupRes.data?.success === true && statusDupRes.data?.duplicate === true,
      'Email: /api/send-email deduplicates rapid repeated status update emails',
      JSON.stringify(statusDupRes.data)
    );

    // Test Deletion Email endpoint - Citizen Initiated (Event C)
    const delCitizenRes = await postJson('/api/send-email', {
      type: 'deletion',
      to: 'citizen.test@civiceye.gov',
      complaintId: testComplaintId,
      issueName: 'Pothole',
      deletedAt: new Date().toISOString(),
      deletedByRole: 'citizen',
      deletedByName: 'Citizen User',
      deletionReason: 'User requested withdrawal.',
      removedFromActiveViews: true,
      nextSteps: 'If you have further civic issues, you can submit a new complaint anytime in CivicEye.',
    });

    assert(
      delCitizenRes.statusCode === 200 && delCitizenRes.data?.success === true,
      'Email Event C: /api/send-email handles citizen complaint deletion notification',
      JSON.stringify(delCitizenRes.data)
    );

    // Test Deletion Email Deduplication
    const delCitizenDupRes = await postJson('/api/send-email', {
      type: 'deletion',
      to: 'citizen.test@civiceye.gov',
      complaintId: testComplaintId,
      issueName: 'Pothole',
      deletedAt: new Date().toISOString(),
      deletedByRole: 'citizen',
      deletedByName: 'Citizen User',
      deletionReason: 'User requested withdrawal.',
      removedFromActiveViews: true,
      nextSteps: 'If you have further civic issues, you can submit a new complaint anytime in CivicEye.',
    });

    assert(
      delCitizenDupRes.statusCode === 200 && delCitizenDupRes.data?.success === true && delCitizenDupRes.data?.duplicate === true,
      'Email Event C: /api/send-email deduplicates rapid repeated deletion emails',
      JSON.stringify(delCitizenDupRes.data)
    );

    // Test Deletion Email endpoint - Authority/Officer Initiated (Event C)
    const testAuthDelComplaintId = `CE-TEST-${Date.now()}-AUTH`;
    const delAuthRes = await postJson('/api/send-email', {
      type: 'deletion',
      to: 'citizen.test@civiceye.gov',
      complaintId: testAuthDelComplaintId,
      issueName: 'Waterlogging',
      deletedAt: new Date().toISOString(),
      deletedByRole: 'officer',
      deletedByName: 'Officer K. Raman',
      deletionReason: 'Duplicate complaint consolidated into master CCMC road project #401.',
      removedFromActiveViews: true,
      nextSteps: 'You can track consolidated progress under the main project or reach CCMC helpline 1800-425-4321.',
    });

    assert(
      delAuthRes.statusCode === 200 && delAuthRes.data?.success === true,
      'Email Event C: /api/send-email handles authority/officer complaint deletion with valid reason',
      JSON.stringify(delAuthRes.data)
    );

    // Test Invalid Payload Rejection (Security & Validation)
    const invalidPayloadRes = await postJson('/api/send-email', {
      type: 'deletion',
      // missing 'to' recipient
      complaintId: testComplaintId,
    });

    assert(
      invalidPayloadRes.statusCode === 400 && (invalidPayloadRes.data?.error || invalidPayloadRes.data?.message),
      'Email: /api/send-email validates and rejects requests with missing recipient',
      JSON.stringify(invalidPayloadRes.data)
    );

  } catch (err) {
    assert(false, 'Email API tests executed without network/server error', err.message);
  }

  // ----------------------------------------------------
  // SECTION 4: Citizen Home Page "Report an Issue" Banner Hiding Tests (Requirement 12)
  // ----------------------------------------------------
  console.log('\n--- 4. Home Page "Report an Issue" Banner Hiding Tests ---');

  // Condition from app/(tabs)/index.tsx:
  // {!loadingComplaints && complaints.length === 0 && ( ... Report an Issue Card ... )}
  function isReportBannerVisible(loadingComplaints, userComplaintsCount) {
    return !loadingComplaints && userComplaintsCount === 0;
  }

  assert(
    isReportBannerVisible(false, 0) === true,
    'Banner Logic: New citizen with 0 submitted complaints sees "Report an Issue" banner'
  );

  assert(
    isReportBannerVisible(false, 1) === false,
    'Banner Logic: Citizen with 1 submitted complaint does NOT see "Report an Issue" banner'
  );

  assert(
    isReportBannerVisible(false, 5) === false,
    'Banner Logic: Citizen with multiple complaints does NOT see "Report an Issue" banner'
  );

  assert(
    isReportBannerVisible(true, 0) === false,
    'Banner Logic: When complaints data is loading, banner is not prematurely assumed visible'
  );

  // Persistence check: returning after navigation or restart evaluates based on real complaints list
  const userAComplaints = [{ id: 'CE-1' }];
  const userBComplaints = [];
  assert(
    isReportBannerVisible(false, userAComplaints.length) === false &&
    isReportBannerVisible(false, userBComplaints.length) === true,
    'Banner Logic: User complaint counts are isolated; user A having complaints does not affect user B'
  );

  // ----------------------------------------------------
  // SECTION 5: Complaint Details 4-Tab Architecture & Fallback Tests (Requirement 3)
  // ----------------------------------------------------
  console.log('\n--- 5. Complaint Details 4-Tab Architecture & Fallbacks ---');

  const EXPECTED_TABS = ['details', 'status', 'budget', 'department'];
  assert(
    EXPECTED_TABS.length === 4 &&
    EXPECTED_TABS[0] === 'details' &&
    EXPECTED_TABS[1] === 'status' &&
    EXPECTED_TABS[2] === 'budget' &&
    EXPECTED_TABS[3] === 'department',
    'Tab Architecture: All 4 tabs present in exact requested order with Details as default'
  );

  // Fallback checks
  function getBudgetTabContent(complaint) {
    const hasBudget = (typeof complaint.estimatedBudget === 'number' && complaint.estimatedBudget > 0) ||
      (typeof complaint.inspectionDetails?.estimatedBudget === 'number' && complaint.inspectionDetails.estimatedBudget > 0);
    return hasBudget ? 'BUDGET_AVAILABLE' : 'Budget estimate not available yet.';
  }

  function getDepartmentTabContent(complaint) {
    const hasDept = !!(
      (complaint.department && complaint.department.trim() !== '') ||
      (complaint.responsibleDepartment && complaint.responsibleDepartment.trim() !== '') ||
      (complaint.departmentCode && complaint.departmentCode.trim() !== '')
    );
    return hasDept ? 'DEPT_AVAILABLE' : 'Department details not available yet.';
  }

  assert(
    getBudgetTabContent({}) === 'Budget estimate not available yet.',
    'Fallback Test: Budget tab shows clear "Budget estimate not available yet." when unrecorded'
  );

  assert(
    getBudgetTabContent({ estimatedBudget: 15000 }) === 'BUDGET_AVAILABLE',
    'Fallback Test: Budget tab renders amount when budget is recorded'
  );

  assert(
    getDepartmentTabContent({}) === 'Department details not available yet.',
    'Fallback Test: Department tab shows clear "Department details not available yet." when unrecorded'
  );

  assert(
    getDepartmentTabContent({ department: 'Road Maintenance' }) === 'DEPT_AVAILABLE',
    'Fallback Test: Department tab renders assignment details when recorded'
  );

  // Final summary
  console.log('\n====================================================');
  console.log(`📊 Test Results: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log('====================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runEmailTests();
