/**
 * Test Suite: Public Building Maintenance Department Routing Verification
 *
 * Verifies:
 * 1. Prompt Examples (Examples 1-5)
 * 2. Keyword dictionary and phrase variations
 * 3. Avoiding false routing (Road defects near landmarks, contextual disambiguation)
 * 4. Non-interference with SWM, DRAIN, SEWER, and ROAD
 * 5. Data structures and isRoadDepartment helper behavior
 */

import {
  classifyDepartmentFromDescription,
  isRoadDepartment,
  DEPARTMENTS_CONFIG,
  ISSUE_DEPARTMENT_MAP,
} from '../services/departmentMapping.ts';

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${details ? `(${details})` : ''}`);
    failed++;
  }
}

console.log('🏛️ RUNNING PUBLIC BUILDING MAINTENANCE ROUTING VERIFICATION SUITE');

// =========================================================================
// TEST SUITE 1: PROMPT EXAMPLES (1 to 5)
// =========================================================================
console.log('\n--- Test Suite 1: Prompt Examples ---');

const promptExamples = [
  {
    desc: 'The wall of the government office is badly damaged.',
    expectedCode: 'BUILDING',
    expectedDept: 'Public Building Maintenance',
  },
  {
    desc: 'There is a roof leak in the municipal building.',
    expectedCode: 'BUILDING',
    expectedDept: 'Public Building Maintenance',
  },
  {
    desc: 'The ceiling of the public building is damaged.',
    expectedCode: 'BUILDING',
    expectedDept: 'Public Building Maintenance',
  },
  {
    desc: 'The door of the government office is broken.',
    expectedCode: 'BUILDING',
    expectedDept: 'Public Building Maintenance',
  },
  {
    desc: 'The floor inside the corporation building is damaged.',
    expectedCode: 'BUILDING',
    expectedDept: 'Public Building Maintenance',
  },
];

promptExamples.forEach((ex, idx) => {
  const result = classifyDepartmentFromDescription(ex.desc);
  assert(
    result.departmentCode === ex.expectedCode &&
    result.department === ex.expectedDept &&
    result.routingStatus === 'Moved to Public Building Maintenance' &&
    result.isMoved === true,
    `Prompt Example ${idx + 1}: "${ex.desc}" -> ${ex.expectedDept}`,
    `Got: ${result.department} (${result.departmentCode}), status: ${result.routingStatus}`
  );
});

// =========================================================================
// TEST SUITE 2: KEYWORD DICTIONARY & VARIATIONS
// =========================================================================
console.log('\n--- Test Suite 2: Public Building Keywords & Variations ---');

const keywordTests = [
  'public building',
  'government building',
  'government office',
  'public office',
  'municipal building',
  'corporation building',
  'government property',
  'public property',
  'government property damage',
  'building maintenance',
  'building repair',
  'building damage',
  'damaged building',
  'building wall',
  'damaged wall',
  'cracked wall',
  'wall crack',
  'building roof',
  'damaged roof',
  'roof leakage',
  'roof leak',
  'ceiling damage',
  'ceiling leakage',
  'ceiling leak',
  'broken ceiling',
  'damaged floor',
  'broken floor',
  'floor damage',
  'broken door',
  'damaged door',
  'broken window',
  'damaged window',
  'building door',
  'building window',
  'building maintenance issue',
  'building repair issue',
  'government building repair',
  'public building repair',
  'The government school building roof is leaking',
  'Municipal office wall has deep cracks',
  'Public toilet door is damaged',
  'Community hall floor damage reported',
  'Damaged windows in the public property',
];

keywordTests.forEach((desc, idx) => {
  const result = classifyDepartmentFromDescription(desc);
  assert(
    result.departmentCode === 'BUILDING' &&
    result.department === 'Public Building Maintenance' &&
    result.routingStatus === 'Moved to Public Building Maintenance' &&
    result.isMoved === true,
    `Keyword Test ${idx + 1}: "${desc}" -> Public Building Maintenance`,
    `Got: ${result.department} (${result.departmentCode})`
  );
});

// =========================================================================
// TEST SUITE 3: AVOID FALSE ROUTING (ROAD ISSUES NEAR LANDMARKS)
// =========================================================================
console.log('\n--- Test Suite 3: Avoid False Routing & Disambiguation ---');

const falseRoutingTests = [
  {
    desc: 'The road near the government building has a pothole.',
    expectedDept: 'Road Maintenance',
    expectedCode: 'ROAD',
    reason: 'Road defect (pothole) near government building landmark must remain Road Maintenance',
  },
  {
    desc: 'A wall beside the road is damaged.',
    expectedDept: 'Road Maintenance',
    expectedCode: 'ROAD',
    reason: 'Road defect context beside road without building context',
  },
  {
    desc: 'There is a large pothole in front of the municipal building.',
    expectedDept: 'Road Maintenance',
    expectedCode: 'ROAD',
    reason: 'Pothole in front of municipal building landmark -> Road Maintenance',
  },
  {
    desc: 'Alligator cracking on the tar road opposite the government office.',
    expectedDept: 'Road Maintenance',
    expectedCode: 'ROAD',
    reason: 'Alligator cracking on road near government office -> Road Maintenance',
  },
  {
    desc: 'Huge crater in road near the corporation building.',
    expectedDept: 'Road Maintenance',
    expectedCode: 'ROAD',
    reason: 'Crater in road near corporation building -> Road Maintenance',
  },
  {
    desc: 'Broken road surface near public building.',
    expectedDept: 'Road Maintenance',
    expectedCode: 'ROAD',
    reason: 'Broken road near public building -> Road Maintenance',
  },
];

falseRoutingTests.forEach((test, idx) => {
  const result = classifyDepartmentFromDescription(test.desc);
  assert(
    result.departmentCode === test.expectedCode &&
    result.department === test.expectedDept &&
    result.isMoved === false,
    `False Routing Prevention ${idx + 1}: "${test.desc}" -> ${test.expectedDept}`,
    `Got: ${result.department} (${result.departmentCode}). Reason: ${test.reason}`
  );
});

// =========================================================================
// TEST SUITE 4: NON-INTERFERENCE WITH OTHER DEPARTMENTS
// =========================================================================
console.log('\n--- Test Suite 4: Non-Interference with SWM, DRAIN, SEWER, ROAD ---');

const otherDeptTests = [
  {
    desc: 'Garbage is overflowing near the municipal building',
    expectedCode: 'SWM',
    expectedDept: 'Solid Waste Management',
  },
  {
    desc: 'Blocked stormwater drain near the government office',
    expectedCode: 'DRAIN',
    expectedDept: 'Stormwater / Drainage',
  },
  {
    desc: 'Sewage water leaking from manhole outside the public building',
    expectedCode: 'SEWER',
    expectedDept: 'Sewerage',
  },
  {
    desc: 'Deep pothole on main road',
    expectedCode: 'ROAD',
    expectedDept: 'Road Maintenance',
  },
];

otherDeptTests.forEach((test, idx) => {
  const result = classifyDepartmentFromDescription(test.desc);
  assert(
    result.departmentCode === test.expectedCode &&
    result.department === test.expectedDept,
    `Non-interference ${idx + 1}: "${test.desc}" -> ${test.expectedDept}`,
    `Got: ${result.department} (${result.departmentCode})`
  );
});

// =========================================================================
// TEST SUITE 5: isRoadDepartment HELPER & CONFIG INTEGRITY
// =========================================================================
console.log('\n--- Test Suite 5: isRoadDepartment and Config Integrity ---');

// isRoadDepartment tests
const roadComplaint = { department: 'Road Maintenance', departmentCode: 'ROAD', routingStatus: 'Direct' };
const buildingComplaint = { department: 'Public Building Maintenance', departmentCode: 'BUILDING', routingStatus: 'Moved to Public Building Maintenance' };
const swmComplaint = { department: 'Solid Waste Management', departmentCode: 'SWM', routingStatus: 'Moved to Solid Waste Management' };
const drainComplaint = { department: 'Stormwater / Drainage', departmentCode: 'DRAIN', routingStatus: 'Moved to Stormwater / Drainage' };
const sewerComplaint = { department: 'Sewerage', departmentCode: 'SEWER', routingStatus: 'Moved to Sewerage' };

assert(isRoadDepartment(roadComplaint) === true, 'isRoadDepartment(roadComplaint) === true');
assert(isRoadDepartment(buildingComplaint) === false, 'isRoadDepartment(buildingComplaint) === false');
assert(isRoadDepartment(swmComplaint) === false, 'isRoadDepartment(swmComplaint) === false');
assert(isRoadDepartment(drainComplaint) === false, 'isRoadDepartment(drainComplaint) === false');
assert(isRoadDepartment(sewerComplaint) === false, 'isRoadDepartment(sewerComplaint) === false');

// Config tests
assert(!!DEPARTMENTS_CONFIG['BUILDING'], 'DEPARTMENTS_CONFIG has BUILDING entry');
assert(DEPARTMENTS_CONFIG['BUILDING'].name === 'Public Building Maintenance', 'BUILDING name is Public Building Maintenance');
assert(DEPARTMENTS_CONFIG['BUILDING'].code === 'BUILDING', 'BUILDING code is BUILDING');
assert(ISSUE_DEPARTMENT_MAP['Building Damage']?.code === 'BUILDING', 'ISSUE_DEPARTMENT_MAP["Building Damage"] is BUILDING');
assert(ISSUE_DEPARTMENT_MAP['Wall Damage']?.code === 'BUILDING', 'ISSUE_DEPARTMENT_MAP["Wall Damage"] is BUILDING');
assert(ISSUE_DEPARTMENT_MAP['Roof Leakage']?.code === 'BUILDING', 'ISSUE_DEPARTMENT_MAP["Roof Leakage"] is BUILDING');
assert(ISSUE_DEPARTMENT_MAP['Ceiling Damage']?.code === 'BUILDING', 'ISSUE_DEPARTMENT_MAP["Ceiling Damage"] is BUILDING');
assert(ISSUE_DEPARTMENT_MAP['Door Damage']?.code === 'BUILDING', 'ISSUE_DEPARTMENT_MAP["Door Damage"] is BUILDING');
assert(ISSUE_DEPARTMENT_MAP['Window Damage']?.code === 'BUILDING', 'ISSUE_DEPARTMENT_MAP["Window Damage"] is BUILDING');
assert(ISSUE_DEPARTMENT_MAP['Floor Damage']?.code === 'BUILDING', 'ISSUE_DEPARTMENT_MAP["Floor Damage"] is BUILDING');

// =========================================================================
// SUMMARY
// =========================================================================
console.log('\n======================================================');
console.log(`📊 PUBLIC BUILDING TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
}
