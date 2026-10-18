// Test script to verify Public Works Department (PWD) routing, budget calculations, and road catalog entries
import { classifyDepartmentFromDescription, DEPARTMENTS_CONFIG } from '../services/departmentMapping.ts';
import { COIMBATORE_ROADS, getStandardEstimatedBudget, ALL_COIMBATORE_REGIONS } from '../constants/coimbatoreRoads.ts';

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
console.log('🏛️  TESTING PUBLIC WORKS DEPARTMENT (PWD) ROUTING');
console.log('====================================================\n');

// -------------------------------------------------------------
// Test Suite 1: PWD Description & Public Route Detection
// -------------------------------------------------------------
console.log('Test Suite 1: Public Route & PWD Description Classification');

const pwdTestCases = [
  { desc: 'Deep pothole on the public route near court', keyword: 'public route' },
  { desc: 'Public road has severe damage in Gandhipuram', keyword: 'public road' },
  { desc: 'Broken public footpath near taluk office', keyword: 'public footpath' },
  { desc: 'PWD road needs urgent asphalt resurfacing', keyword: 'pwd road' },
  { desc: 'Public pathway paver blocks are broken and sinking', keyword: 'public pathway' },
  { desc: 'Public walkway near Peelamedu hospital is unusable', keyword: 'public walkway' },
  { desc: 'Public corridor connecting court complex is damaged', keyword: 'public corridor' },
  { desc: 'Court road public building access has potholes', keyword: 'court road' },
  { desc: 'Collectorate road has damaged public pavement', keyword: 'collectorate road' },
  { desc: 'PWD link road in Peelamedu has broken culverts', keyword: 'pwd link' },
  { desc: 'Public infrastructure culvert damaged near school', keyword: 'public infrastructure' },
  { desc: 'Public works department needs to fix this public walkway', keyword: 'public works department' },
];

pwdTestCases.forEach((tc, idx) => {
  const result = classifyDepartmentFromDescription(tc.desc);
  assert(
    `[${idx + 1}] "${tc.desc}" -> Public Works Department (PWD)`,
    result.department === 'Public Works Department' &&
    result.departmentCode === 'PWD' &&
    result.departmentSource === 'description' &&
    result.routingStatus === 'Moved to Public Works Department' &&
    result.routingMessage.includes('Public Works Department') &&
    result.isMoved === true
  );
});

// -------------------------------------------------------------
// Test Suite 2: PWD Budget Calculation Verification
// -------------------------------------------------------------
console.log('\nTest Suite 2: Public Works Department Standard Budget Estimates (INR)');

const budgetLow = getStandardEstimatedBudget('Public Route Issue', 'LOW');
assert('PWD Low Severity Budget = ₹7,000', budgetLow.budget === 7000);

const budgetMed = getStandardEstimatedBudget('Public Route Issue', 'MEDIUM');
assert('PWD Medium Severity Budget = ₹20,000', budgetMed.budget === 20000);

const budgetHigh = getStandardEstimatedBudget('Public Route Issue', 'HIGH');
assert('PWD High Severity Budget = ₹40,000', budgetHigh.budget === 40000);

const budgetFootpath = getStandardEstimatedBudget('Damaged Footpath', 'MEDIUM');
assert('Public Footpath Medium Budget = ₹20,000', budgetFootpath.budget === 20000);

// -------------------------------------------------------------
// Test Suite 3: Coimbatore Road Catalog Coverage for PWD Public Routes
// -------------------------------------------------------------
console.log('\nTest Suite 3: Coimbatore Road Catalog - PWD Public Routes');

ALL_COIMBATORE_REGIONS.forEach(region => {
  const pwdRoadsInRegion = COIMBATORE_ROADS.filter(r => r.region === region && r.maintainedBy.includes('Public Works'));
  assert(
    `Region [${region}] has at least 1 registered PWD public route`,
    pwdRoadsInRegion.length >= 1
  );
});

// -------------------------------------------------------------
// Summary
// -------------------------------------------------------------
console.log('\n====================================================');
console.log(`📊 PWD ROUTING TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
