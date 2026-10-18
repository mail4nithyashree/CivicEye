/**
 * Test Suite: Parks and Public Spaces Department Routing Verification
 *
 * Verifies:
 * 1. Prompt Examples (Examples 1-6)
 * 2. Test Cases (Test Cases 1-6)
 * 3. Keyword dictionary and phrase variations
 * 4. Avoiding false routing (Road defects near park, contextual disambiguation)
 * 5. Non-interference with SWM, DRAIN, SEWER, BUILDING, and ROAD
 * 6. Data structures and isRoadDepartment helper behavior
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

console.log('🌳 RUNNING PARKS AND PUBLIC SPACES ROUTING VERIFICATION SUITE');

// =========================================================================
// TEST SUITE 1: PROMPT EXAMPLES (1 to 6)
// =========================================================================
console.log('\n--- Test Suite 1: Prompt Examples ---');

const promptExamples = [
  {
    desc: "The children's park in our area is damaged.",
    expectedCode: 'PARKS',
    expectedDept: 'Parks and Public Spaces',
  },
  {
    desc: 'The swing in the public park is broken.',
    expectedCode: 'PARKS',
    expectedDept: 'Parks and Public Spaces',
  },
  {
    desc: 'The benches in the park are damaged.',
    expectedCode: 'PARKS',
    expectedDept: 'Parks and Public Spaces',
  },
  {
    desc: 'The playground equipment is broken.',
    expectedCode: 'PARKS',
    expectedDept: 'Parks and Public Spaces',
  },
  {
    desc: 'The public park is not maintained properly.',
    expectedCode: 'PARKS',
    expectedDept: 'Parks and Public Spaces',
  },
  {
    desc: 'The fence around the community park is damaged.',
    expectedCode: 'PARKS',
    expectedDept: 'Parks and Public Spaces',
  },
];

promptExamples.forEach((ex, idx) => {
  const result = classifyDepartmentFromDescription(ex.desc);
  assert(
    result.departmentCode === ex.expectedCode &&
    result.department === ex.expectedDept &&
    result.routingStatus === 'Moved to Parks and Public Spaces' &&
    result.isMoved === true,
    `Prompt Example ${idx + 1}: "${ex.desc}" -> ${ex.expectedDept}`,
    `Got: ${result.department} (${result.departmentCode}), status: ${result.routingStatus}`
  );
});

// =========================================================================
// TEST SUITE 2: TEST CASES (Section 11)
// =========================================================================
console.log('\n--- Test Suite 2: Section 11 Test Cases ---');

// Test Case 1 — Broken playground equipment
{
  const desc = 'The playground equipment in our local park is broken.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    result.departmentCode === 'PARKS' &&
    result.department === 'Parks and Public Spaces' &&
    result.routingStatus === 'Moved to Parks and Public Spaces' &&
    result.routingMessage === 'Your complaint has been moved to the Parks and Public Spaces Department.' &&
    result.isMoved === true,
    'Test Case 1: Broken playground equipment -> Parks and Public Spaces'
  );
}

// Test Case 2 — Damaged park bench
{
  const desc = 'The benches in the public park are damaged.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    result.departmentCode === 'PARKS' &&
    result.department === 'Parks and Public Spaces' &&
    result.routingStatus === 'Moved to Parks and Public Spaces' &&
    result.isMoved === true,
    'Test Case 2: Damaged park bench -> Parks and Public Spaces'
  );
}

// Test Case 3 — Damaged park fence
{
  const desc = 'The fence around the community park is broken.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    result.departmentCode === 'PARKS' &&
    result.department === 'Parks and Public Spaces' &&
    result.routingStatus === 'Moved to Parks and Public Spaces' &&
    result.isMoved === true,
    'Test Case 3: Damaged park fence -> Parks and Public Spaces'
  );
}

// Test Case 4 — Road issue near park
{
  const desc = 'There is a large pothole on the road near the park.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    result.departmentCode === 'ROAD' &&
    result.department === 'Road Maintenance' &&
    result.routingStatus === 'Direct' &&
    result.isMoved === false,
    'Test Case 4: "There is a large pothole on the road near the park." -> Road Maintenance'
  );
}

// Test Case 5 — Drainage issue inside park
{
  const desc = 'The stormwater drain inside the park is blocked.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    result.departmentCode === 'DRAIN' &&
    result.department === 'Stormwater / Drainage' &&
    result.routingStatus === 'Moved to Stormwater / Drainage' &&
    result.isMoved === true,
    'Test Case 5: "The stormwater drain inside the park is blocked." -> Stormwater / Drainage'
  );
}

// Test Case 6 — Sewerage issue near park
{
  const desc = 'Sewage is overflowing near the public park.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    result.departmentCode === 'SEWER' &&
    result.department === 'Sewerage' &&
    result.routingStatus === 'Moved to Sewerage' &&
    result.isMoved === true,
    'Test Case 6: "Sewage is overflowing near the public park." -> Sewerage'
  );
}

// Test Case 7 — SWD issue inside park
{
  const desc = 'Garbage is dumped all over the public park.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    result.departmentCode === 'SWM' &&
    result.department === 'Solid Waste Management' &&
    result.routingStatus === 'Moved to Solid Waste Management' &&
    result.isMoved === true,
    'Test Case 7: "Garbage is dumped all over the public park." -> Solid Waste Management'
  );
}

// =========================================================================
// TEST SUITE 3: KEYWORD DICTIONARY & VARIATIONS
// =========================================================================
console.log('\n--- Test Suite 3: Parks Keywords & Variations ---');

const keywordTests = [
  'park',
  'parks',
  'public park',
  'public parks',
  'playground',
  'play ground',
  "children's park",
  'children park',
  'kids park',
  'recreation area',
  'recreational area',
  'public space',
  'public spaces',
  'open public space',
  'community park',
  'community garden',
  'public garden',
  'park maintenance',
  'park issue',
  'park damage',
  'park damaged',
  'park cleanliness',
  'park facility',
  'park facilities',
  'park equipment',
  'playground equipment',
  'playground damage',
  'playground equipment damaged',
  'broken playground equipment',
  'broken swing',
  'damaged swing',
  'broken slide',
  'damaged slide',
  'broken bench',
  'damaged bench',
  'park bench',
  'public bench',
  'park fence',
  'damaged park fence',
  'broken park fence',
  'park gate',
  'damaged park gate',
  'broken park gate',
  'park lighting',
  'park light',
  'park pathway',
  'park walkway',
  'park path',
  'public space maintenance',
  'public space damage',
  'public space issue',
];

keywordTests.forEach(kw => {
  const result = classifyDepartmentFromDescription(`Report regarding ${kw} in our sector.`);
  assert(
    result.departmentCode === 'PARKS' && result.department === 'Parks and Public Spaces',
    `Keyword: "${kw}" -> Parks and Public Spaces`,
    `Got: ${result.department} (${result.departmentCode})`
  );
});

// =========================================================================
// TEST SUITE 4: AVOIDING FALSE ROUTING
// =========================================================================
console.log('\n--- Test Suite 4: Avoiding False Routing ---');

const falseRoutingTests = [
  {
    desc: 'The road beside the park has severe alligator cracking.',
    expectedCode: 'ROAD',
    expectedDept: 'Road Maintenance',
  },
  {
    desc: 'Deep crater in road outside the community park.',
    expectedCode: 'ROAD',
    expectedDept: 'Road Maintenance',
  },
  {
    desc: 'Broken speed breaker on the road leading to the public park.',
    expectedCode: 'ROAD',
    expectedDept: 'Road Maintenance',
  },
  {
    desc: 'Sewage water leaking from sewer pipe near the park entrance.',
    expectedCode: 'SEWER',
    expectedDept: 'Sewerage',
  },
  {
    desc: 'Stormwater drain is blocked with debris near the children park.',
    expectedCode: 'DRAIN',
    expectedDept: 'Stormwater / Drainage',
  },
  {
    desc: 'Overflowing dustbin and rotting waste dumped outside the public park.',
    expectedCode: 'SWM',
    expectedDept: 'Solid Waste Management',
  },
  {
    desc: 'Cracked wall and roof leak inside the public building near the park.',
    expectedCode: 'BUILDING',
    expectedDept: 'Public Building Maintenance',
  },
];

falseRoutingTests.forEach((t, idx) => {
  const result = classifyDepartmentFromDescription(t.desc);
  assert(
    result.departmentCode === t.expectedCode && result.department === t.expectedDept,
    `False routing test ${idx + 1}: "${t.desc}" -> ${t.expectedDept}`,
    `Got: ${result.department} (${result.departmentCode})`
  );
});

// =========================================================================
// TEST SUITE 5: DATA STRUCTURES & isRoadDepartment
// =========================================================================
console.log('\n--- Test Suite 5: Data Structures & Helper Verification ---');

const roadComplaint = { department: 'Road Maintenance', departmentCode: 'ROAD', routingStatus: 'Direct' };
const swmComplaint = { department: 'Solid Waste Management', departmentCode: 'SWM', routingStatus: 'Moved to Solid Waste Management' };
const drainComplaint = { department: 'Stormwater / Drainage', departmentCode: 'DRAIN', routingStatus: 'Moved to Stormwater / Drainage' };
const sewerComplaint = { department: 'Sewerage', departmentCode: 'SEWER', routingStatus: 'Moved to Sewerage' };
const buildingComplaint = { department: 'Public Building Maintenance', departmentCode: 'BUILDING', routingStatus: 'Moved to Public Building Maintenance' };
const parksComplaint = { department: 'Parks and Public Spaces', departmentCode: 'PARKS', routingStatus: 'Moved to Parks and Public Spaces' };

assert(isRoadDepartment(roadComplaint) === true, 'isRoadDepartment(roadComplaint) is true');
assert(isRoadDepartment(swmComplaint) === false, 'isRoadDepartment(swmComplaint) is false');
assert(isRoadDepartment(drainComplaint) === false, 'isRoadDepartment(drainComplaint) is false');
assert(isRoadDepartment(sewerComplaint) === false, 'isRoadDepartment(sewerComplaint) is false');
assert(isRoadDepartment(buildingComplaint) === false, 'isRoadDepartment(buildingComplaint) is false');
assert(isRoadDepartment(parksComplaint) === false, 'isRoadDepartment(parksComplaint) is false');

assert(DEPARTMENTS_CONFIG['PARKS'] !== undefined, 'DEPARTMENTS_CONFIG contains PARKS');
assert(DEPARTMENTS_CONFIG['PARKS'].name === 'Parks and Public Spaces', 'PARKS name is "Parks and Public Spaces"');
assert(DEPARTMENTS_CONFIG['PARKS'].code === 'PARKS', 'PARKS code is "PARKS"');
assert(ISSUE_DEPARTMENT_MAP['Park Maintenance']?.code === 'PARKS', 'ISSUE_DEPARTMENT_MAP maps Park Maintenance to PARKS');
assert(ISSUE_DEPARTMENT_MAP['Playground Damage']?.code === 'PARKS', 'ISSUE_DEPARTMENT_MAP maps Playground Damage to PARKS');

// =========================================================================
// SUMMARY
// =========================================================================
console.log('\n=============================================');
console.log(`TOTAL TESTS: ${passed + failed}`);
console.log(`PASSED: ${passed}`);
console.log(`FAILED: ${failed}`);
console.log('=============================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL PARKS AND PUBLIC SPACES ROUTING TESTS PASSED PERFECTLY!');
}
