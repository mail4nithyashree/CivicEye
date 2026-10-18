// SWM & Road Safety Department Routing Test Runner
import { classifyDepartmentFromDescription, DEPARTMENTS_CONFIG } from '../services/departmentMapping.ts';

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

console.log('====================================================');
console.log('🧪 RUNNING CIVICEYE DEPARTMENT ROUTING VERIFICATION');
console.log('====================================================\n');

// -------------------------------------------------------------
// Test 1: SWM Description Detection
// -------------------------------------------------------------
console.log('Test Suite 1: Solid Waste Management (SWM) Routing');

const swmTestDescriptions = [
  'Garbage overflow near the college gate',
  'Garbage overflow near college gate',
  'Garbage is overflowing from the dustbin',
  'Garbage is overflowing',
  'Garbage is not collected',
  'Waste is dumped on the roadside',
  'Dustbin is overflowing',
  'There is garbage near my house',
  'Waste collection is not happening',
  'The trash bin outside the shop is full and littering the street',
  'Heavy solid waste dumped near the apartment gate',
  'Garbage heap is stinking in our neighborhood',
  'Overflowing dustbin causing foul smell',
  'Uncollected waste on the pavement',
  'Garbage bin problems in our area',
];

swmTestDescriptions.forEach((desc, idx) => {
  const result = classifyDepartmentFromDescription(desc);
  assert(
    `[${idx + 1}] "${desc}" -> Solid Waste Management (SWM)`,
    result.department === 'Solid Waste Management' &&
    result.departmentCode === 'SWM' &&
    result.departmentSource === 'description' &&
    result.routingStatus === 'Moved to Solid Waste Management' &&
    result.routingMessage === 'Your complaint has been moved to the Solid Waste Management Department for further action.' &&
    result.isMoved === true
  );
});

// -------------------------------------------------------------
// Test 2: Road Maintenance Fallback & Keyword Detection
// -------------------------------------------------------------
console.log('\nTest Suite 2: Road Maintenance (ROAD) Routing & Fallback');

const roadTestDescriptions = [
  'Large pothole on the main road',
  'Huge pothole in the middle of the road',
  'Deep crater in asphalt causing traffic delay',
  'Damaged road surface with alligator cracking',
  'Broken road near the signal',
  'Cracking on tar road',
  '', // empty fallback -> Road Maintenance
  'A general issue that is not specific',
];

roadTestDescriptions.forEach((desc, idx) => {
  const result = classifyDepartmentFromDescription(desc);
  assert(
    `[${idx + 1}] "${desc || '(empty)'}" -> Road Maintenance (ROAD)`,
    result.department === 'Road Maintenance' &&
    result.departmentCode === 'ROAD' &&
    result.routingStatus === 'Direct' &&
    result.routingMessage === 'Your complaint has been assigned to the Road Maintenance Department.' &&
    result.isMoved === false
  );
});

// -------------------------------------------------------------
// Summary
// -------------------------------------------------------------
console.log('\n====================================================');
console.log(`📊 VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
