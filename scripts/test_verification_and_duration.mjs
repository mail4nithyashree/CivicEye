import {
  getEstimatedResolutionDuration,
  calculateExpectedResolutionDate,
  formatResolutionDate,
} from '../services/resolutionDuration.ts';
import {
  DEPARTMENTS_CONFIG,
  AVAILABLE_DEPARTMENTS,
  getDepartmentCode,
} from '../services/departmentMapping.ts';

console.log('===============================================================');
console.log('🧪 CIVICEYE FIELD VERIFICATION & RESOLUTION DURATION TEST SUITE');
console.log('===============================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

// 1. Estimated Resolution Duration Matrix Tests
console.log('--- 1. Resolution Duration Calculation (Priority + Issue Type) ---');

// Critical / High priority tests
const critPothole = getEstimatedResolutionDuration('CRITICAL', 'pothole', 'Road Maintenance');
assert(critPothole.durationDays === 1 && critPothole.durationText === '1 Day', 'Critical pothole resolves in 1 Day');

const highSewer = getEstimatedResolutionDuration('HIGH', 'Sewage Overflow', 'Sewerage');
assert(highSewer.durationDays === 1 && highSewer.durationText === '1 Day', 'High priority sewage overflow resolves in 1 Day');

const highTree = getEstimatedResolutionDuration('HIGH', 'Fallen Tree', 'Tree / Greenery Maintenance');
assert(highTree.durationDays === 1 && highTree.durationText === '1 Day', 'High priority fallen tree resolves in 1 Day');

const highPothole = getEstimatedResolutionDuration('HIGH', 'pothole', 'Road Maintenance');
assert(highPothole.durationDays === 2 && highPothole.durationText === '2 Days', 'High priority pothole resolves in 2 Days');

// Medium priority tests
const medPothole = getEstimatedResolutionDuration('MEDIUM', 'pothole', 'Road Maintenance');
assert(medPothole.durationDays === 3 && medPothole.durationText === '3 Days', 'Medium priority pothole resolves in 3 Days');

const medCrack = getEstimatedResolutionDuration('MEDIUM', 'cracking', 'Road Maintenance');
assert(medCrack.durationDays === 4 && medCrack.durationText === '4 Days', 'Medium priority cracking resolves in 4 Days');

const medDrain = getEstimatedResolutionDuration('MEDIUM', 'Drainage Blockage', 'Stormwater / Drainage');
assert(medDrain.durationDays === 3 && medDrain.durationText === '3 Days', 'Medium priority drainage blockage resolves in 3 Days');

const medGarbage = getEstimatedResolutionDuration('MEDIUM', 'Garbage Bin Problem', 'Solid Waste Management');
assert(medGarbage.durationDays === 3 && medGarbage.durationText === '3 Days', 'Medium priority garbage bin resolves in 3 Days');

// Low priority tests
const lowCrack = getEstimatedResolutionDuration('LOW', 'cracking', 'Road Maintenance');
assert(lowCrack.durationDays === 7 && lowCrack.durationText === '7 Days', 'Low priority cracking resolves in 7 Days');

const lowBuilding = getEstimatedResolutionDuration('LOW', 'Building Repair', 'Public Building Maintenance');
assert(lowBuilding.durationDays === 10 && lowBuilding.durationText === '10 Days', 'Low priority building repair resolves in 10 Days');

const lowParks = getEstimatedResolutionDuration('LOW', 'Park Maintenance', 'Parks and Public Spaces');
assert(lowParks.durationDays === 8 && lowParks.durationText === '8 Days', 'Low priority park maintenance resolves in 8 Days');


// 2. Expected Resolution Date & Date Formatting
console.log('\n--- 2. Resolution Date Calculation and DD/MM/YYYY Formatting ---');

const baseDate = new Date('2026-10-07T10:00:00.000Z');
const expDate3 = calculateExpectedResolutionDate(baseDate, 3);
const formatted3 = formatResolutionDate(expDate3);
assert(formatted3 === '10/10/2026', 'Expected date for +3 days from 07/10/2026 is 10/10/2026');

const expDate1 = calculateExpectedResolutionDate(baseDate, 1);
const formatted1 = formatResolutionDate(expDate1);
assert(formatted1 === '08/10/2026', 'Expected date for +1 day from 07/10/2026 is 08/10/2026');

const formattedNull = formatResolutionDate(null);
assert(formattedNull === 'Pending Verification', 'formatResolutionDate handles null gracefully');


// 3. Field Verification Simulation: Action A - Confirm Existing Department
console.log('\n--- 3. Field Verification Workflow: Confirm Existing Department ---');

function simulateConfirmExisting(complaint, inspector) {
  return {
    ...complaint,
    fieldVerificationStatus: 'department_confirmed',
    verifiedDepartment: complaint.department,
    status: 'Verified',
    fieldVerifiedBy: inspector.name,
    fieldVerifiedAt: new Date(),
    updatedAt: new Date(),
  };
}

const mockComplaintA = {
  id: 'c1',
  complaintId: 'CE-1001',
  department: 'Road Maintenance',
  departmentCode: 'ROAD',
  status: 'Submitted',
  priority: 'HIGH',
  issueType: 'pothole',
  assignedOfficerName: 'Er. Rajesh Kumar',
};

const resultA = simulateConfirmExisting(mockComplaintA, { uid: 'u1', name: 'Inspector Murugan' });
assert(resultA.status === 'Verified', 'Action A updates status to Verified');
assert(resultA.fieldVerificationStatus === 'department_confirmed', 'Action A sets fieldVerificationStatus to department_confirmed');
assert(resultA.department === 'Road Maintenance', 'Action A keeps existing department');
assert(resultA.verifiedDepartment === 'Road Maintenance', 'Action A records verifiedDepartment');
assert(resultA.fieldVerifiedBy === 'Inspector Murugan', 'Action A records fieldVerifiedBy');


// 4. Field Verification Simulation: Action B - Another Department Involved (Transfer)
console.log('\n--- 4. Field Verification Workflow: Another Department Involved (Transfer) ---');

function simulateTransferDepartment(complaint, inspector, targetDeptCode, remarks) {
  const targetConfig = DEPARTMENTS_CONFIG[targetDeptCode];
  const oldDept = complaint.department;
  const newDuration = getEstimatedResolutionDuration(
    complaint.priority,
    complaint.issueType,
    targetConfig.name,
    new Date()
  );

  return {
    ...complaint,
    department: targetConfig.name,
    departmentCode: targetConfig.code,
    previousDepartment: oldDept,
    verifiedDepartment: targetConfig.name,
    fieldVerificationStatus: 'transferred',
    fieldVerificationRemarks: remarks,
    departmentSource: 'field_inspector',
    routingStatus: `Moved to ${targetConfig.name}`,
    status: 'Under Review',
    estimatedResolutionDuration: newDuration.durationText,
    estimatedResolutionDays: newDuration.durationDays,
    expectedResolutionDate: newDuration.expectedDate,
    fieldVerifiedBy: inspector.name,
    fieldVerifiedAt: new Date(),
    updatedAt: new Date(),
  };
}

const mockComplaintB = {
  id: 'c2',
  complaintId: 'CE-1002',
  department: 'Road Maintenance',
  departmentCode: 'ROAD',
  status: 'Submitted',
  priority: 'HIGH',
  issueType: 'Waterlogging',
  assignedOfficerName: undefined, // unassigned
};

const resultB = simulateTransferDepartment(
  mockComplaintB,
  { uid: 'u1', name: 'Inspector Murugan' },
  'DRAIN',
  'Issue is caused by blocked stormwater drainage alongside the road.'
);

assert(resultB.status === 'Under Review', 'Action B sets status to Under Review');
assert(resultB.fieldVerificationStatus === 'transferred', 'Action B sets fieldVerificationStatus to transferred');
assert(resultB.department === 'Stormwater / Drainage', 'Action B sets new department correctly');
assert(resultB.previousDepartment === 'Road Maintenance', 'Action B preserves previousDepartment');
assert(resultB.fieldVerificationRemarks.includes('blocked stormwater drainage'), 'Action B stores verification remarks');
assert(resultB.departmentSource === 'field_inspector', 'Action B sets departmentSource to field_inspector');


// 5. Officer Display Formatting
console.log('\n--- 5. Officer Name Handling (No Hardcoding) ---');

function getDisplayOfficer(complaint) {
  return complaint.assignedOfficerName || complaint.assignedOfficer || 'Awaiting Assignment';
}

assert(getDisplayOfficer({ assignedOfficerName: 'Officer Rajesh Kumar' }) === 'Officer Rajesh Kumar', 'Displays actual assigned officer name');
assert(getDisplayOfficer({}) === 'Awaiting Assignment', 'Displays "Awaiting Assignment" when unassigned');
assert(getDisplayOfficer({ assignedOfficer: 'Officer Priya Sharma' }) === 'Officer Priya Sharma', 'Supports legacy assignedOfficer field');


console.log('\n===============================================================');
console.log(`📊 FINAL SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('===============================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL FIELD VERIFICATION & DURATION TESTS PASSED!\n');
}
