/**
 * CivicEye - Tree / Greenery Maintenance Department Routing Verification Test Suite
 *
 * Validates:
 * 1. Tree / Greenery Maintenance keyword mapping and variations
 * 2. Primary / Positive routing test cases from user specification
 * 3. False routing prevention (generic words, other department priorities)
 * 4. Disambiguation (e.g. road damage vs tree defect, parks vs tree defect)
 * 5. Department metadata configuration and constants
 */

import {
  classifyDepartmentFromDescription,
  DEPARTMENTS_CONFIG,
  ISSUE_DEPARTMENT_MAP,
  isRoadDepartment,
  OTHER_DEPARTMENTS_LIST,
} from '../services/departmentMapping.ts';

let passed = 0;
let failed = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    if (details) console.error(`     Details: ${details}`);
    failed++;
  }
}

console.log('\n======================================================');
console.log('🌲 RUNNING TREE / GREENERY MAINTENANCE ROUTING TESTS');
console.log('======================================================\n');

// -----------------------------------------------------------------------------
// 1. SPECIFICATION EXAMPLES (POSITIVE TEST CASES)
// -----------------------------------------------------------------------------
console.log('--- 1. SPECIFICATION POSITIVE ROUTING EXAMPLES ---');

const specPositiveCases = [
  {
    desc: 'A tree has fallen across the road.',
    expectedCode: 'TREES',
  },
  {
    desc: 'Branches of the tree are blocking the road.',
    expectedCode: 'TREES',
  },
  {
    desc: 'The roadside trees need trimming.',
    expectedCode: 'TREES',
  },
  {
    desc: 'There is a dangerous leaning tree near the school.',
    expectedCode: 'TREES',
  },
  {
    desc: 'Overgrown vegetation is blocking the public walkway.',
    expectedCode: 'TREES',
  },
  {
    desc: 'Dead tree needs to be removed.',
    expectedCode: 'TREES',
  },
  {
    desc: 'Tree branches are touching electric lines.',
    expectedCode: 'TREES',
  },
  {
    desc: 'The trees in the roadside area need maintenance.',
    expectedCode: 'TREES',
  },
  {
    desc: 'Tree branches are overgrown inside the public park.',
    expectedCode: 'TREES',
  },
];

for (const tc of specPositiveCases) {
  const result = classifyDepartmentFromDescription(tc.desc);
  assert(
    result.departmentCode === tc.expectedCode &&
    result.department === 'Tree / Greenery Maintenance' &&
    result.routingStatus === 'Moved to Tree / Greenery Maintenance' &&
    result.routingMessage === 'Your complaint has been moved to the Tree / Greenery Maintenance Department.',
    `Spec positive: "${tc.desc}"`,
    `Got dept=${result.department}, code=${result.departmentCode}, status=${result.routingStatus}, msg=${result.routingMessage}`
  );
}

// -----------------------------------------------------------------------------
// 2. SPECIFICATION EXAMPLES (NEGATIVE / FALSE ROUTING TEST CASES)
// -----------------------------------------------------------------------------
console.log('\n--- 2. SPECIFICATION FALSE ROUTING AVOIDANCE ---');

const specNegativeCases = [
  {
    desc: 'There is a pothole near a tree.',
    expectedCode: 'ROAD',
    reason: 'Pothole is road defect; tree is only location reference',
  },
  {
    desc: 'The road near the park is damaged.',
    expectedCode: 'ROAD',
    reason: 'Road damage is road maintenance',
  },
  {
    desc: 'A tree has fallen and damaged the road.',
    expectedCode: 'ROAD',
    reason: 'Road damage is primary defect',
  },
  {
    desc: 'Drain is blocked by leaves.',
    expectedCode: 'DRAIN',
    reason: 'Stormwater / Drainage has priority for blocked drain',
  },
  {
    desc: 'Tree branches are blocking the stormwater drain.',
    expectedCode: 'DRAIN',
    reason: 'Stormwater / Drainage has priority for blocked drain',
  },
  {
    desc: 'Sewage is leaking near a tree.',
    expectedCode: 'SEWER',
    reason: 'Sewerage has priority for sewage leakage',
  },
  {
    desc: 'Sewage is leaking around the tree.',
    expectedCode: 'SEWER',
    reason: 'Sewerage has priority for sewage leakage',
  },
  {
    desc: 'Broken bench in the park.',
    expectedCode: 'PARKS',
    reason: 'Parks has priority for park bench',
  },
  {
    desc: 'Broken bench surrounded by plants in the park.',
    expectedCode: 'PARKS',
    reason: 'Parks has priority for park amenity damage',
  },
  {
    desc: 'Garbage dumped near a tree.',
    expectedCode: 'SWM',
    reason: 'Solid Waste Management has priority for dumped garbage',
  },
  {
    desc: 'Garbage is dumped under the trees.',
    expectedCode: 'SWM',
    reason: 'Solid Waste Management has priority for dumped garbage',
  },
];

for (const tc of specNegativeCases) {
  const result = classifyDepartmentFromDescription(tc.desc);
  assert(
    result.departmentCode === tc.expectedCode,
    `False routing avoidance: "${tc.desc}" -> ${tc.expectedCode} (${tc.reason})`,
    `Got dept=${result.department}, code=${result.departmentCode}`
  );
}

// -----------------------------------------------------------------------------
// 3. COMPREHENSIVE KEYWORD COVERAGE TESTS
// -----------------------------------------------------------------------------
console.log('\n--- 3. COMPREHENSIVE KEYWORD COVERAGE ---');

const keywordCases = [
  'Request for tree trimming on 5th avenue',
  'Urgent tree cutting request needed',
  'Annual tree pruning request for avenue trees',
  'Large tree branch fell on the sidewalk',
  'Multiple tree branches hanging dangerously',
  'Fallen trees after heavy storm',
  'Fallen branch causing obstruction',
  'Broken tree branch about to fall',
  'Dangerous trees leaning towards houses',
  'Leaning tree about to collapse',
  'Dry trees that need inspection',
  'Dying tree needs immediate attention',
  'Uprooted tree blocking the pathway',
  'Tree roots are damaging the pavement walkway',
  'Exposed tree roots tripping pedestrians',
  'Tree stump needs removal',
  'Roadside greenery is unmaintained and overgrown',
  'Plant maintenance required in municipal green strip',
  'Overgrown bushes blocking line of sight at intersection',
  'Overgrown hedge obstructing pedestrian path',
  'Public plantation maintenance needed',
  'Greenery issue along the avenue',
  'Overgrown shrubs need trimming',
  'Grass maintenance needed along the avenue',
];

for (const text of keywordCases) {
  const result = classifyDepartmentFromDescription(text);
  assert(
    result.departmentCode === 'TREES' && result.isMoved === true,
    `Keyword test: "${text}"`,
    `Got dept=${result.department}, code=${result.departmentCode}`
  );
}

// -----------------------------------------------------------------------------
// 4. METADATA & CONFIGURATION CHECKS
// -----------------------------------------------------------------------------
console.log('\n--- 4. METADATA & CONFIGURATION CHECKS ---');

assert(DEPARTMENTS_CONFIG['TREES'] !== undefined, 'DEPARTMENTS_CONFIG contains TREES');
assert(DEPARTMENTS_CONFIG['TREES']?.name === 'Tree / Greenery Maintenance', 'TREES name is correct');
assert(DEPARTMENTS_CONFIG['TREES']?.code === 'TREES', 'TREES code is correct');
assert(DEPARTMENTS_CONFIG['TREES']?.routingMessageName === 'Tree / Greenery Maintenance Department', 'TREES routingMessageName is correct');
assert(OTHER_DEPARTMENTS_LIST.includes('Tree / Greenery Maintenance'), 'OTHER_DEPARTMENTS_LIST includes Tree / Greenery Maintenance');
assert(ISSUE_DEPARTMENT_MAP['Tree Maintenance']?.code === 'TREES', 'ISSUE_DEPARTMENT_MAP maps Tree Maintenance to TREES');
assert(ISSUE_DEPARTMENT_MAP['Fallen Tree']?.code === 'TREES', 'ISSUE_DEPARTMENT_MAP maps Fallen Tree to TREES');
assert(ISSUE_DEPARTMENT_MAP['Tree / Greenery Issue']?.code === 'TREES', 'ISSUE_DEPARTMENT_MAP maps Tree / Greenery Issue to TREES');
assert(ISSUE_DEPARTMENT_MAP['Overgrown Vegetation']?.code === 'TREES', 'ISSUE_DEPARTMENT_MAP maps Overgrown Vegetation to TREES');

// isRoadDepartment check
const treesComplaint = {
  department: 'Tree / Greenery Maintenance',
  departmentCode: 'TREES',
  routingStatus: 'Moved to Tree / Greenery Maintenance',
};
assert(!isRoadDepartment(treesComplaint), 'isRoadDepartment returns false for TREES complaint');

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n======================================================');
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL TREE / GREENERY MAINTENANCE ROUTING TESTS PASSED PERFECTLY!\n');
}
