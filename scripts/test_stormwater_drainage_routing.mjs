// Stormwater / Drainage Department Routing Verification Test Suite
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
console.log('🧪 RUNNING STORMWATER / DRAINAGE ROUTING VERIFICATION SUITE');
console.log('================================================================\n');

// -------------------------------------------------------------
// Test Suite 1: Specific User Prompt Test Cases (Section 9)
// -------------------------------------------------------------
console.log('Test Suite 1: Specific User Prompt Test Cases (Section 9)');

// Test Case 1
{
  const desc = 'The storm water drain near my street is blocked.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    'Test Case 1: "The storm water drain near my street is blocked." -> Stormwater / Drainage',
    result.department === 'Stormwater / Drainage' &&
    result.departmentCode === 'DRAIN' &&
    result.departmentSource === 'description' &&
    result.routingStatus === 'Moved to Stormwater / Drainage' &&
    result.routingMessage === 'Your complaint has been moved to the Stormwater / Drainage Department for further action.' &&
    result.isMoved === true &&
    isRoadDepartment({ department: result.department, departmentCode: result.departmentCode, routingStatus: result.routingStatus }) === false
  );
}

// Test Case 2
{
  const desc = 'There is severe waterlogging because the drainage is blocked.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    'Test Case 2: "There is severe waterlogging because the drainage is blocked." -> Stormwater / Drainage',
    result.department === 'Stormwater / Drainage' &&
    result.departmentCode === 'DRAIN' &&
    result.routingStatus === 'Moved to Stormwater / Drainage' &&
    result.isMoved === true
  );
}

// Test Case 3
{
  const desc = 'Rainwater is overflowing from the roadside drain.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    'Test Case 3: "Rainwater is overflowing from the roadside drain." -> Stormwater / Drainage',
    result.department === 'Stormwater / Drainage' &&
    result.departmentCode === 'DRAIN' &&
    result.routingStatus === 'Moved to Stormwater / Drainage' &&
    result.isMoved === true
  );
}

// Test Case 4
{
  const desc = 'The drain cover is broken and the open drain is dangerous.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    'Test Case 4: "The drain cover is broken and the open drain is dangerous." -> Stormwater / Drainage',
    result.department === 'Stormwater / Drainage' &&
    result.departmentCode === 'DRAIN' &&
    result.routingStatus === 'Moved to Stormwater / Drainage' &&
    result.isMoved === true
  );
}

// Test Case 5 — Avoid False Routing (Must NOT route to Stormwater / Drainage)
{
  const desc = 'There is no drinking water supply in my street.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    'Test Case 5: "There is no drinking water supply in my street." -> NOT Stormwater / Drainage (Defaults to Road Maintenance)',
    result.department === 'Road Maintenance' &&
    result.departmentCode === 'ROAD' &&
    result.routingStatus === 'Direct' &&
    result.isMoved === false
  );
}

// Additional False Routing Checks
{
  const falseRoutingExamples = [
    'Drinking water problem',
    'Water supply problem',
    'Water pipe issue',
    'Low water pressure in municipal pipeline',
  ];

  falseRoutingExamples.forEach((desc, idx) => {
    const result = classifyDepartmentFromDescription(desc);
    assert(
      `False Routing Check ${idx + 1}: "${desc}" -> NOT Stormwater / Drainage`,
      result.department !== 'Stormwater / Drainage' && result.departmentCode !== 'DRAIN'
    );
  });
}

// Test Case 6 — SWD Must Continue Working
{
  const desc = 'Garbage is dumped near the road.';
  const result = classifyDepartmentFromDescription(desc);
  assert(
    'Test Case 6: "Garbage is dumped near the road." -> Solid Waste Management',
    result.department === 'Solid Waste Management' &&
    result.departmentCode === 'SWM' &&
    result.routingStatus === 'Moved to Solid Waste Management' &&
    result.routingMessage === 'Your complaint has been moved to the Solid Waste Management Department for further action.' &&
    result.isMoved === true &&
    isRoadDepartment({ department: result.department, departmentCode: result.departmentCode, routingStatus: result.routingStatus }) === false
  );
}

// -------------------------------------------------------------
// Test Suite 2: All Required Stormwater / Drainage Keywords (Section 3)
// -------------------------------------------------------------
console.log('\nTest Suite 2: All Required Stormwater / Drainage Keywords & Variations');

const naturalLanguageVariations = [
  'The storm water drain is blocked',
  'Drainage water is overflowing onto the road',
  'Rainwater is not flowing through the drain',
  'There is waterlogging near the road',
  'The drainage is clogged',
  'Open drain near my house',
  'Drain cover is damaged',
  'Stagnant water due to blocked drainage',
  'A broken drain near 5th avenue',
  'Damaged drain on the corner',
  'Missing drain cover on the sidewalk',
  'Drain blockage after yesterday rain',
  'Blocked drain causing flooded drain situation',
  'Clogged drain near the supermarket',
  'Drain overflow during heavy rain',
  'Overflowing drain with dirty water',
  'Drainage blockage creating water logging',
  'Major drainage problem in our ward',
  'Severe drainage issue near school',
  'Stagnant water accumulating on street',
  'Rainwater drainage is totally choked',
  'Storm drain overflowing into traffic lane',
  'Heavy stormwater flooding the intersection',
  'Flooding caused by blocked roadside drain',
  'Flooded drain in residential area',
];

naturalLanguageVariations.forEach((desc, idx) => {
  const result = classifyDepartmentFromDescription(desc);
  assert(
    `Keyword Test ${idx + 1}: "${desc}" -> Stormwater / Drainage`,
    result.department === 'Stormwater / Drainage' &&
    result.departmentCode === 'DRAIN' &&
    result.routingStatus === 'Moved to Stormwater / Drainage' &&
    result.isMoved === true
  );
});

// -------------------------------------------------------------
// Test Suite 3: Solid Waste Management (SWD) Regression Suite
// -------------------------------------------------------------
console.log('\nTest Suite 3: Solid Waste Management (SWD) Regression Suite');

const swmCases = [
  'Garbage overflow near college gate',
  'Overflowing dustbin near hospital',
  'Garbage bin problems in sector 4',
  'Uncollected waste dumped near market',
  'Trash bin is full and litter is scattered',
  'Heavy solid waste near apartment',
  'Garbage heap is stinking in neighborhood',
];

swmCases.forEach((desc, idx) => {
  const result = classifyDepartmentFromDescription(desc);
  assert(
    `SWD Regression ${idx + 1}: "${desc}" -> Solid Waste Management (SWM)`,
    result.department === 'Solid Waste Management' &&
    result.departmentCode === 'SWM' &&
    result.routingStatus === 'Moved to Solid Waste Management' &&
    result.isMoved === true
  );
});

// -------------------------------------------------------------
// Test Suite 4: Road Maintenance Fallback & Keywords
// -------------------------------------------------------------
console.log('\nTest Suite 4: Road Maintenance Primary Lifecycle Retention');

const roadCases = [
  'Large pothole in the middle of the road',
  'Damaged road surface with alligator cracking',
  'Deep crater in asphalt causing traffic delay',
  'Broken road near the signal',
  'Pavement crack on pedestrian lane',
  '', // empty fallback
  'General civic issue at main junction',
];

roadCases.forEach((desc, idx) => {
  const result = classifyDepartmentFromDescription(desc);
  assert(
    `Road Lifecycle ${idx + 1}: "${desc || '(empty)'}" -> Road Maintenance (ROAD)`,
    result.department === 'Road Maintenance' &&
    result.departmentCode === 'ROAD' &&
    result.routingStatus === 'Direct' &&
    result.isMoved === false &&
    isRoadDepartment({ department: result.department, departmentCode: result.departmentCode, routingStatus: result.routingStatus }) === true
  );
});

// -------------------------------------------------------------
// Test Suite 5: Routing Only / No Citizen Tracking Verification
// -------------------------------------------------------------
console.log('\nTest Suite 5: Routing-Only Verification (No Tracking / Lifecycle for Routed Depts)');

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

assert('SWD is NOT a managed road department (isRoadDepartment === false)', isRoadDepartment(swmComplaint) === false);
assert('Stormwater / Drainage is NOT a managed road department (isRoadDepartment === false)', isRoadDepartment(drainComplaint) === false);
assert('Road Maintenance IS a managed road department (isRoadDepartment === true)', isRoadDepartment(roadComplaint) === true);

// -------------------------------------------------------------
// Summary
// -------------------------------------------------------------
console.log('\n================================================================');
console.log(`📊 STORMWATER / DRAINAGE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
