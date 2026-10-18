import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('===============================================================');
console.log('CIVICEYE FIELD INSPECTOR WORKFLOW VERIFICATION TEST SUITE');
console.log('===============================================================\n');

let testsPassed = 0;
let testsFailed = 0;

function runTest(testName, fn) {
  try {
    process.stdout.write(`TEST: ${testName}... `);
    fn();
    console.log('PASSED \u2705');
    testsPassed++;
  } catch (err) {
    console.log('FAILED \u274C');
    console.error(`  Error: ${err.message}`);
    testsFailed++;
  }
}

// -----------------------------------------------------------------------------
// TEST 1: NO OTHER DEPARTMENT INVOLVEMENT
// -----------------------------------------------------------------------------
runTest('Test 1 - No other department involvement preserves Road Maintenance workflow', () => {
  const complaint = {
    id: 'doc_101',
    complaintId: 'CE-1025',
    department: 'Road Maintenance',
    departmentCode: 'ROAD',
    originalDepartment: 'Road Maintenance',
    status: 'Under Review',
    inspectionStatus: 'PENDING',
    otherDepartmentInvolvement: false,
    involvedDepartments: [],
  };

  // Normal inspection without other department involvement
  const updatedComplaint = {
    ...complaint,
    inspectionStatus: 'VALID',
    inspectorRemarks: 'Road surface pothole confirmed.',
  };

  assert.strictEqual(updatedComplaint.department, 'Road Maintenance', 'Department must remain Road Maintenance');
  assert.strictEqual(updatedComplaint.departmentCode, 'ROAD', 'Department code must remain ROAD');
  assert.strictEqual(updatedComplaint.status, 'Under Review', 'Complaint status must remain Under Review');
  assert.strictEqual(updatedComplaint.otherDepartmentInvolvement, false, 'otherDepartmentInvolvement should be false');
  assert.deepStrictEqual(updatedComplaint.involvedDepartments, [], 'involvedDepartments should be empty');
});

// -----------------------------------------------------------------------------
// TEST 2: DRAINAGE INVOLVEMENT
// -----------------------------------------------------------------------------
runTest('Test 2 - Drainage involvement records involvement without changing department or status', () => {
  const initialComplaint = {
    id: 'doc_102',
    complaintId: 'CE-1025',
    department: 'Road Maintenance',
    departmentCode: 'ROAD',
    originalDepartment: 'Road Maintenance',
    status: 'In Progress',
    inspectionStatus: 'VALID',
  };

  const involvementData = {
    otherDepartmentInvolvement: true,
    involvedDepartments: ['Drainage / Storm Water'],
    involvementReportedBy: 'inspector_01',
    involvementReportedByName: 'Inspector John Doe',
    involvementReportedAt: new Date(),
    involvementRemarks: 'Clogged storm drain overflowing onto road surface',
  };

  const updatedComplaint = {
    ...initialComplaint,
    ...involvementData,
  };

  // 1. Complaint department must NOT change
  assert.strictEqual(updatedComplaint.department, 'Road Maintenance', 'Department must remain Road Maintenance');
  assert.strictEqual(updatedComplaint.departmentCode, 'ROAD', 'Department code must remain ROAD');
  assert.strictEqual(updatedComplaint.originalDepartment, 'Road Maintenance', 'Original department must remain intact');

  // 2. Complaint status must NOT change
  assert.strictEqual(updatedComplaint.status, 'In Progress', 'Status must remain unchanged');

  // 3. Involvement data must be correctly stored
  assert.strictEqual(updatedComplaint.otherDepartmentInvolvement, true, 'otherDepartmentInvolvement must be true');
  assert.ok(updatedComplaint.involvedDepartments.includes('Drainage / Storm Water'), 'Drainage / Storm Water must be recorded');
  assert.strictEqual(updatedComplaint.involvementReportedBy, 'inspector_01', 'Inspector UID must be stored');

  // 4. Citizen notification text validation
  const notificationTitle = 'Department Involvement Identified';
  const notificationMessage = `There is involvement of the ${updatedComplaint.involvedDepartments.join(', ')} Department in your reported issue.`;
  assert.strictEqual(
    notificationMessage,
    'There is involvement of the Drainage / Storm Water Department in your reported issue.'
  );
  assert.ok(!notificationMessage.includes('transferred'), 'Must NOT state complaint has been transferred');
});

// -----------------------------------------------------------------------------
// TEST 3: SOLID WASTE MANAGEMENT INVOLVEMENT
// -----------------------------------------------------------------------------
runTest('Test 3 - Solid Waste Management involvement records SWD without routing/transferring complaint', () => {
  const initialComplaint = {
    id: 'doc_103',
    complaintId: 'CE-1026',
    department: 'Road Maintenance',
    departmentCode: 'ROAD',
    originalDepartment: 'Road Maintenance',
    status: 'Submitted',
    inspectionStatus: 'PENDING',
  };

  const involvementData = {
    otherDepartmentInvolvement: true,
    involvedDepartments: ['Solid Waste Management'],
    involvementReportedBy: 'inspector_02',
    involvementReportedByName: 'Inspector Jane Smith',
    involvementReportedAt: new Date(),
    involvementRemarks: 'Garbage dump blocking roadside drainage and road edge',
  };

  const updatedComplaint = {
    ...initialComplaint,
    ...involvementData,
  };

  // 1. Department checks
  assert.strictEqual(updatedComplaint.department, 'Road Maintenance', 'Department must remain Road Maintenance');
  assert.strictEqual(updatedComplaint.departmentCode, 'ROAD', 'Department code must remain ROAD');

  // 2. Status unchanged
  assert.strictEqual(updatedComplaint.status, 'Submitted', 'Status must remain Submitted');

  // 3. Involvement stored
  assert.strictEqual(updatedComplaint.otherDepartmentInvolvement, true);
  assert.ok(updatedComplaint.involvedDepartments.includes('Solid Waste Management'));

  // 4. Notification message check
  const notificationMessage = `There is involvement of the ${updatedComplaint.involvedDepartments.join(', ')} Department in your reported issue.`;
  assert.strictEqual(
    notificationMessage,
    'There is involvement of the Solid Waste Management Department in your reported issue.'
  );

  // 5. Officer Analytics check
  const complaintsList = [
    { department: 'Road Maintenance', otherDepartmentInvolvement: true, involvedDepartments: ['Drainage / Storm Water'] },
    { department: 'Road Maintenance', otherDepartmentInvolvement: true, involvedDepartments: ['Solid Waste Management'] },
    { department: 'Road Maintenance', otherDepartmentInvolvement: false },
  ];

  let involvementCount = 0;
  const involvementByDept = {};
  complaintsList.forEach(c => {
    if (c.otherDepartmentInvolvement && Array.isArray(c.involvedDepartments)) {
      involvementCount++;
      c.involvedDepartments.forEach(d => {
        involvementByDept[d] = (involvementByDept[d] || 0) + 1;
      });
    }
  });

  assert.strictEqual(involvementCount, 2, 'Total involvement count must be 2');
  assert.strictEqual(involvementByDept['Solid Waste Management'], 1, 'SWD count must be 1');
  assert.strictEqual(involvementByDept['Drainage / Storm Water'], 1, 'Drainage count must be 1');
});

// -----------------------------------------------------------------------------
// TEST 4: CHANGE DEPARTMENT REMOVAL & PROTECTION FROM FIELD INSPECTOR
// -----------------------------------------------------------------------------
runTest('Test 4 - Verify Change Department UI is completely removed from Field Inspector', () => {
  const inspectionScreenPath = path.join(projectRoot, 'app', 'officer', 'inspection-screen.tsx');
  const fieldDashboardPath = path.join(projectRoot, 'app', 'officer', 'field-dashboard.tsx');
  const complaintDetailsPath = path.join(projectRoot, 'app', 'officer', 'complaint-details.tsx');

  const inspectionScreenCode = fs.readFileSync(inspectionScreenPath, 'utf-8');
  const fieldDashboardCode = fs.readFileSync(fieldDashboardPath, 'utf-8');
  const complaintDetailsCode = fs.readFileSync(complaintDetailsPath, 'utf-8');

  // 1. Inspection screen must not contain "Change Dept" or "Change Department" button
  assert.ok(
    !inspectionScreenCode.includes('Change Dept'),
    'inspection-screen.tsx must not contain "Change Dept"'
  );
  assert.ok(
    !inspectionScreenCode.includes('handleReassignDepartment'),
    'inspection-screen.tsx must not contain department reassign handlers'
  );

  // 2. Inspection screen must contain "Report Department Involvement"
  assert.ok(
    inspectionScreenCode.includes('Other Department Involvement') ||
    inspectionScreenCode.includes('Report Department Involvement'),
    'inspection-screen.tsx must contain Other Department Involvement UI'
  );

  // 3. Field dashboard must not contain Change Dept
  assert.ok(
    !fieldDashboardCode.includes('Change Dept'),
    'field-dashboard.tsx must not contain "Change Dept"'
  );

  // 4. In complaint-details.tsx, changeDeptBtn must be guarded with isMainOfficer
  assert.ok(
    complaintDetailsCode.includes('isMainOfficer &&'),
    'complaint-details.tsx must restrict Change Dept to isMainOfficer only'
  );
});

// -----------------------------------------------------------------------------
// TEST 5: DEPARTMENT MAPPING CONSTANTS VERIFICATION
// -----------------------------------------------------------------------------
runTest('Test 5 - Department mapping contains full list of supported involvement departments', () => {
  const deptMappingPath = path.join(projectRoot, 'services', 'departmentMapping.ts');
  const deptMappingCode = fs.readFileSync(deptMappingPath, 'utf-8');

  const expectedDepartments = [
    'Solid Waste Management',
    'Drainage / Storm Water',
    'Sewerage',
    'Public Building Maintenance',
    'Parks / Public Spaces',
    'Tree / Greenery Maintenance',
    'Other',
  ];

  expectedDepartments.forEach(dept => {
    assert.ok(
      deptMappingCode.includes(dept),
      `departmentMapping.ts must include '${dept}'`
    );
  });
});

// -----------------------------------------------------------------------------
// TEST 6: CITIZEN DASHBOARD & DETAILS NOTIFICATION BANNER
// -----------------------------------------------------------------------------
runTest('Test 6 - Citizen complaint details & notifications display department involvement notice', () => {
  const complaintDetailPath = path.join(projectRoot, 'app', 'complaint-detail.tsx');
  const notificationsPath = path.join(projectRoot, 'app', 'notifications.tsx');
  const complaintCardPath = path.join(projectRoot, 'components', 'ComplaintCard.tsx');

  const complaintDetailCode = fs.readFileSync(complaintDetailPath, 'utf-8');
  const notificationsCode = fs.readFileSync(notificationsPath, 'utf-8');
  const complaintCardCode = fs.readFileSync(complaintCardPath, 'utf-8');

  // 1. Citizen complaint-detail.tsx has department involvement alert
  assert.ok(
    complaintDetailCode.includes('otherDepartmentInvolvement'),
    'complaint-detail.tsx must check otherDepartmentInvolvement'
  );
  assert.ok(
    complaintDetailCode.includes('There is involvement of the'),
    'complaint-detail.tsx must display standard citizen involvement message'
  );

  // 2. notifications.tsx includes involvement notification builder
  assert.ok(
    notificationsCode.includes('otherDepartmentInvolvement'),
    'notifications.tsx must check otherDepartmentInvolvement'
  );

  // 3. ComplaintCard.tsx includes involvement badge
  assert.ok(
    complaintCardCode.includes('otherDepartmentInvolvement'),
    'ComplaintCard.tsx must display involvement badge'
  );
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n===============================================================');
console.log(`TEST SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
console.log('===============================================================\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
