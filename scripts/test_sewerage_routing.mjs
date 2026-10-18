// Sewerage Department Routing Verification Test Suite
import { classifyDepartmentFromDescription, DEPARTMENTS_CONFIG, isRoadDepartment } from '../services/departmentMapping.ts';

let passed = 0;
let failed = 0;

function assert(description, condition) {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failed++;
  }
}

console.log('================================================================');
console.log('🧪 RUNNING SEWERAGE DEPARTMENT ROUTING VERIFICATION SUITE');
console.log('================================================================\n');

// -------------------------------------------------------------
// Test Suite 1: Specific User Prompt Test Cases (Section 10)
// -------------------------------------------------------------
console.log('Test Suite 1: Specific User Prompt Test Cases (Section 10)');

// Test Case 1 — Sewer blockage
{
  const desc = 'The sewer line near my house is completely blocked.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    'Test Case 1: "The sewer line near my house is completely blocked." -> Sewerage',
    result.department === 'Sewerage' &&
    result.departmentCode === 'SEWER' &&
    result.departmentSource === 'description' &&
    result.routingStatus === 'Moved to Sewerage' &&
    result.routingMessage === 'Your complaint has been moved to the Sewerage Department for further action.' &&
    result.isMoved === true &&
    isRoadDepartment({ department: result.department, departmentCode: result.departmentCode, routingStatus: result.routingStatus }) === false
  );
}

// Test Case 2 — Sewage overflow
{
  const desc = 'Sewage water is overflowing from the manhole onto the street.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    'Test Case 2: "Sewage water is overflowing from the manhole onto the street." -> Sewerage',
    result.department === 'Sewerage' &&
    result.departmentCode === 'SEWER' &&
    result.routingStatus === 'Moved to Sewerage' &&
    result.isMoved === true &&
    isRoadDepartment({ department: result.department, departmentCode: result.departmentCode, routingStatus: result.routingStatus }) === false
  );
}

// Test Case 3 — Sewage leakage
{
  const desc = 'There is sewage leakage from the damaged sewer pipe.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    'Test Case 3: "There is sewage leakage from the damaged sewer pipe." -> Sewerage',
    result.department === 'Sewerage' &&
    result.departmentCode === 'SEWER' &&
    result.routingStatus === 'Moved to Sewerage' &&
    result.isMoved === true &&
    isRoadDepartment({ department: result.department, departmentCode: result.departmentCode, routingStatus: result.routingStatus }) === false
  );
}

// Test Case 4 — Stormwater must remain Stormwater
{
  const desc = 'Rainwater is overflowing because the storm water drain is blocked.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    'Test Case 4: "Rainwater is overflowing because the storm water drain is blocked." -> Stormwater / Drainage (NOT Sewerage)',
    result.department === 'Stormwater / Drainage' &&
    result.departmentCode === 'DRAIN' &&
    result.routingStatus === 'Moved to Stormwater / Drainage' &&
    result.isMoved === true
  );
}

// Test Case 5 — SWD must remain SWD
{
  const desc = 'Garbage and waste are dumped near the road.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    'Test Case 5: "Garbage and waste are dumped near the road." -> Solid Waste Management (NOT Sewerage)',
    result.department === 'Solid Waste Management' &&
    result.departmentCode === 'SWM' &&
    result.routingStatus === 'Moved to Solid Waste Management' &&
    result.isMoved === true
  );
}

// Test Case 6 — Road Maintenance
{
  const desc = 'There is a large pothole on the road.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    'Test Case 6: "There is a large pothole on the road." -> Road Maintenance',
    result.department === 'Road Maintenance' &&
    result.departmentCode === 'ROAD' &&
    result.routingStatus === 'Direct' &&
    result.isMoved === false &&
    isRoadDepartment({ department: result.department, departmentCode: result.departmentCode, routingStatus: result.routingStatus }) === true
  );
}

// -------------------------------------------------------------
// Test Suite 2: Prompt Example Sentences (Section 3)
// -------------------------------------------------------------
console.log('\nTest Suite 2: Prompt Example Sentences (Section 3)');

const promptExamples = [
  'The sewer line is blocked.',
  'There is sewage water overflowing from the manhole.',
  'Sewage is leaking onto the road.',
  'The sewer pipe is damaged.',
  'The manhole is overflowing with sewage.',
  'There is a sewage blockage near my house.',
  'Sewerage water is leaking onto the street.',
];

promptExamples.forEach((desc, idx) => {
  const result = classifyDepartmentFromDescription(desc);
  assert(
    `Prompt Example ${idx + 1}: "${desc}" -> Sewerage (SEWER)`,
    result.department === 'Sewerage' &&
    result.departmentCode === 'SEWER' &&
    result.routingStatus === 'Moved to Sewerage' &&
    result.isMoved === true
  );
});

// -------------------------------------------------------------
// Test Suite 3: All Required Sewerage Keywords (Section 3)
// -------------------------------------------------------------
console.log('\nTest Suite 3: All Required Sewerage Keywords & Variations');

const requiredKeywords = [
  'Sewer problem reported',
  'Sewage everywhere on road',
  'Sewerage system failure',
  'Sewage water pooling here',
  'Severe sewage leakage observed',
  'Sewer leakage outside the house',
  'Sewage leak near market',
  'Sewer leak from the main',
  'Sewer line broken',
  'Sewage line disconnected',
  'Sewer pipe needs repair',
  'Sewage pipe crack',
  'Sewer blockage causing problem',
  'Sewage blockage in the area',
  'Blocked sewer near junction',
  'Blocked sewage line',
  'Clogged sewer is backed up',
  'Sewage overflow on pedestrian pathway',
  'Sewer overflow near gate',
  'Sewage water overflow into lane',
  'Sewer manhole is open',
  'Sewage manhole is broken',
  'Manhole overflow on main road',
  'Manhole blockage in colony',
  'Broken sewer pipe leaking water',
  'Damaged sewer pipe needs urgent attention',
  'Sewage drainage is overflowing',
  'Wastewater leakage into the open',
  'Waste water leakage from the sewage connection',
];

requiredKeywords.forEach((desc, idx) => {
  const result = classifyDepartmentFromDescription(desc);
  assert(
    `Keyword Test ${idx + 1}: "${desc}" -> Sewerage (SEWER)`,
    result.department === 'Sewerage' &&
    result.departmentCode === 'SEWER' &&
    result.routingStatus === 'Moved to Sewerage' &&
    result.isMoved === true
  );
});

// -------------------------------------------------------------
// Test Suite 4: Avoid False Routing (Section 4)
// -------------------------------------------------------------
console.log('\nTest Suite 4: Avoid False Routing (Section 4)');

const falseRoutingCases = [
  { desc: 'Drinking water supply is not available.', expectedDept: 'Road Maintenance' },
  { desc: 'Drinking water problem in our sector', expectedDept: 'Road Maintenance' },
  { desc: 'Low water pressure in municipal pipeline', expectedDept: 'Road Maintenance' },
  { desc: 'Water pipe leak in kitchen', expectedDept: 'Road Maintenance' },
  { desc: 'Water supply is disconnected', expectedDept: 'Road Maintenance' },
  { desc: 'Rainwater drain is blocked.', expectedDept: 'Stormwater / Drainage' },
  { desc: 'Blocked drain on the side of the road', expectedDept: 'Stormwater / Drainage' },
  { desc: 'Waterlogging on the road after rain', expectedDept: 'Stormwater / Drainage' },
];

falseRoutingCases.forEach((item, idx) => {
  const result = classifyDepartmentFromDescription(item.desc);
  assert(
    `False Routing Prevention ${idx + 1}: "${item.desc}" -> NOT Sewerage (Got: ${result.department})`,
    result.department !== 'Sewerage' &&
    result.departmentCode !== 'SEWER' &&
    result.department === item.expectedDept
  );
});

// -------------------------------------------------------------
// Test Suite 5: SWM & Stormwater Regression Tests
// -------------------------------------------------------------
console.log('\nTest Suite 5: SWM & Stormwater Regression Tests');

const regressionCases = [
  { desc: 'Garbage overflow near college gate', expectedDept: 'Solid Waste Management', expectedCode: 'SWM' },
  { desc: 'Overflowing dustbin near hospital', expectedDept: 'Solid Waste Management', expectedCode: 'SWM' },
  { desc: 'Uncollected waste dumped near market', expectedDept: 'Solid Waste Management', expectedCode: 'SWM' },
  { desc: 'The storm water drain near my street is blocked.', expectedDept: 'Stormwater / Drainage', expectedCode: 'DRAIN' },
  { desc: 'There is severe waterlogging because the drainage is blocked.', expectedDept: 'Stormwater / Drainage', expectedCode: 'DRAIN' },
  { desc: 'Rainwater is overflowing from the roadside drain.', expectedDept: 'Stormwater / Drainage', expectedCode: 'DRAIN' },
  { desc: 'The drain cover is broken and the open drain is dangerous.', expectedDept: 'Stormwater / Drainage', expectedCode: 'DRAIN' },
];

regressionCases.forEach((item, idx) => {
  const result = classifyDepartmentFromDescription(item.desc);
  assert(
    `Regression ${idx + 1}: "${item.desc}" -> ${item.expectedDept}`,
    result.department === item.expectedDept &&
    result.departmentCode === item.expectedCode &&
    result.isMoved === true
  );
});

// -------------------------------------------------------------
// Test Suite 6: Routing-Only / No Tracking Verification
// -------------------------------------------------------------
console.log('\nTest Suite 6: Routing-Only Verification (No Tracking / Lifecycle)');

const sewerComplaint = {
  department: 'Sewerage',
  departmentCode: 'SEWER',
  routingStatus: 'Moved to Sewerage',
};

const swmComplaint = {
  department: 'Solid Waste Management',
  departmentCode: 'SWM',
  routingStatus: 'Moved to Solid Waste Management',
};

const drainComplaint = {
  department: 'Stormwater / Drainage',
  departmentCode: 'DRAIN',
  routingStatus: 'Moved to Stormwater / Drainage',
};

const roadComplaint = {
  department: 'Road Maintenance',
  departmentCode: 'ROAD',
  routingStatus: 'Direct',
};

assert('Sewerage is NOT a managed road department (isRoadDepartment === false)', isRoadDepartment(sewerComplaint) === false);
assert('SWD is NOT a managed road department (isRoadDepartment === false)', isRoadDepartment(swmComplaint) === false);
assert('Stormwater / Drainage is NOT a managed road department (isRoadDepartment === false)', isRoadDepartment(drainComplaint) === false);
assert('Road Maintenance IS a managed road department (isRoadDepartment === true)', isRoadDepartment(roadComplaint) === true);

// -------------------------------------------------------------
// Summary
// -------------------------------------------------------------
console.log('\n================================================================');
console.log(`📊 SEWERAGE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
