import assert from 'node:assert';
import {
  classifyDepartmentFromDescription,
  isRoadDepartment,
  getDepartmentCode,
  getRoutingStatus,
  getRoutingMessage,
  normalizeDescription,
  DEPARTMENTS_CONFIG
} from '../services/departmentMapping.ts';

console.log('===============================================================');
console.log('🚀 CIVICEYE COMPLETE MULTI-DEPARTMENT ROUTING TEST SUITE');
console.log('===============================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${e.message}`);
    failed++;
  }
}

// -------------------------------------------------------------
// 1. Text Normalization Tests
// -------------------------------------------------------------
console.log('--- 1. Text Normalization & Casing Consistency ---');
test('Case-insensitivity and spacing normalization for blocked drain', () => {
  const c1 = classifyDepartmentFromDescription('THE DRAIN IS BLOCKED');
  const c2 = classifyDepartmentFromDescription('the drain is blocked');
  const c3 = classifyDepartmentFromDescription('Drain is BLOCKED');
  const c4 = classifyDepartmentFromDescription('  Drain    is   BLOCKED!  ');

  assert.strictEqual(c1.departmentCode, 'DRAIN');
  assert.strictEqual(c2.departmentCode, 'DRAIN');
  assert.strictEqual(c3.departmentCode, 'DRAIN');
  assert.strictEqual(c4.departmentCode, 'DRAIN');
});

// -------------------------------------------------------------
// 2. Solid Waste Management (SWM) Tests
// -------------------------------------------------------------
console.log('\n--- 2. Solid Waste Management Routing ---');
test('Garbage dumped near the bus stop', () => {
  const res = classifyDepartmentFromDescription('Garbage is dumped near the bus stop.');
  assert.strictEqual(res.department, 'Solid Waste Management');
  assert.strictEqual(res.departmentCode, 'SWM');
  assert.strictEqual(res.routingStatus, 'Moved to Solid Waste Management');
  assert.strictEqual(isRoadDepartment(res), false);
});

test('Overflowing dustbin and waste accumulation', () => {
  const res1 = classifyDepartmentFromDescription('The dustbin is overflowing with food waste');
  const res2 = classifyDepartmentFromDescription('Massive waste accumulation and plastic waste on sidewalk');
  assert.strictEqual(res1.departmentCode, 'SWM');
  assert.strictEqual(res2.departmentCode, 'SWM');
});

test('Garbage collection vehicle not collected', () => {
  const res = classifyDepartmentFromDescription('Garbage not collected for past three days in ward 12');
  assert.strictEqual(res.departmentCode, 'SWM');
});

// -------------------------------------------------------------
// 3. Stormwater / Drainage (DRAIN) Tests
// -------------------------------------------------------------
console.log('\n--- 3. Stormwater / Drainage Routing ---');
test('Storm water drain blocked', () => {
  const res = classifyDepartmentFromDescription('The storm water drain near my street is blocked.');
  assert.strictEqual(res.department, 'Stormwater / Drainage');
  assert.strictEqual(res.departmentCode, 'DRAIN');
  assert.strictEqual(res.routingStatus, 'Moved to Stormwater / Drainage');
  assert.strictEqual(isRoadDepartment(res), false);
});

test('Severe waterlogging due to blocked drainage', () => {
  const res = classifyDepartmentFromDescription('There is severe waterlogging because the drainage is blocked.');
  assert.strictEqual(res.departmentCode, 'DRAIN');
});

test('Rainwater overflowing from roadside drain', () => {
  const res = classifyDepartmentFromDescription('Rainwater is overflowing from the roadside drain.');
  assert.strictEqual(res.departmentCode, 'DRAIN');
});

test('Drain cover broken and open drain', () => {
  const res = classifyDepartmentFromDescription('The drain cover is broken and the open drain is dangerous.');
  assert.strictEqual(res.departmentCode, 'DRAIN');
});

test('Drinking water disambiguation (must NOT route to DRAIN or SEWER)', () => {
  const res = classifyDepartmentFromDescription('There is no drinking water supply in my street.');
  assert.notStrictEqual(res.departmentCode, 'DRAIN');
  assert.notStrictEqual(res.departmentCode, 'SEWER');
  assert.strictEqual(res.departmentCode, 'ROAD'); // Defaults to Road Maintenance
});

// -------------------------------------------------------------
// 4. Sewerage (SEWER) Tests
// -------------------------------------------------------------
console.log('\n--- 4. Sewerage Routing ---');
test('Sewer line completely blocked', () => {
  const res = classifyDepartmentFromDescription('The sewer line near my house is completely blocked.');
  assert.strictEqual(res.department, 'Sewerage');
  assert.strictEqual(res.departmentCode, 'SEWER');
  assert.strictEqual(isRoadDepartment(res), false);
});

test('Sewage water overflowing from manhole', () => {
  const res = classifyDepartmentFromDescription('Sewage water is overflowing from the manhole onto the street.');
  assert.strictEqual(res.departmentCode, 'SEWER');
});

test('Sewage leakage from damaged sewer pipe', () => {
  const res = classifyDepartmentFromDescription('There is sewage leakage from the damaged sewer pipe.');
  assert.strictEqual(res.departmentCode, 'SEWER');
});

// -------------------------------------------------------------
// 5. Public Building Maintenance (BUILDING) Tests
// -------------------------------------------------------------
console.log('\n--- 5. Public Building Maintenance Routing ---');
test('Government office wall damaged', () => {
  const res = classifyDepartmentFromDescription('The wall of the government office is badly damaged.');
  assert.strictEqual(res.department, 'Public Building Maintenance');
  assert.strictEqual(res.departmentCode, 'BUILDING');
  assert.strictEqual(isRoadDepartment(res), false);
});

test('Municipal building roof leak', () => {
  const res = classifyDepartmentFromDescription('There is a roof leak in the municipal building.');
  assert.strictEqual(res.departmentCode, 'BUILDING');
});

test('Corporation building floor damage', () => {
  const res = classifyDepartmentFromDescription('The floor inside the corporation building is damaged.');
  assert.strictEqual(res.departmentCode, 'BUILDING');
});

// -------------------------------------------------------------
// 6. Parks and Public Spaces (PARKS) Tests
// -------------------------------------------------------------
console.log('\n--- 6. Parks and Public Spaces Routing ---');
test('Children park swing broken', () => {
  const res = classifyDepartmentFromDescription('The swing in the public park is broken.');
  assert.strictEqual(res.department, 'Parks and Public Spaces');
  assert.strictEqual(res.departmentCode, 'PARKS');
  assert.strictEqual(isRoadDepartment(res), false);
});

test('Park benches damaged', () => {
  const res = classifyDepartmentFromDescription('The benches in the park are damaged.');
  assert.strictEqual(res.departmentCode, 'PARKS');
});

test('Community park fence damaged', () => {
  const res = classifyDepartmentFromDescription('The fence around the community park is damaged.');
  assert.strictEqual(res.departmentCode, 'PARKS');
});

// -------------------------------------------------------------
// 7. Tree / Greenery Maintenance (TREES) Tests
// -------------------------------------------------------------
console.log('\n--- 7. Tree / Greenery Maintenance Routing ---');
test('Fallen tree across the road', () => {
  const res = classifyDepartmentFromDescription('A tree has fallen across the road.');
  assert.strictEqual(res.department, 'Tree / Greenery Maintenance');
  assert.strictEqual(res.departmentCode, 'TREES');
  assert.strictEqual(isRoadDepartment(res), false);
});

test('Roadside trees trimming needed', () => {
  const res = classifyDepartmentFromDescription('The roadside trees need trimming.');
  assert.strictEqual(res.departmentCode, 'TREES');
});

test('Dangerous leaning tree', () => {
  const res = classifyDepartmentFromDescription('There is a dangerous leaning tree near the school.');
  assert.strictEqual(res.departmentCode, 'TREES');
});

// -------------------------------------------------------------
// 8. Road Maintenance (ROAD) & Disambiguation / Priority Tests
// -------------------------------------------------------------
console.log('\n--- 8. Road Maintenance & Disambiguation Priority ---');
test('Standard pothole and road damage', () => {
  const res = classifyDepartmentFromDescription('There is a large pothole on the road.');
  assert.strictEqual(res.department, 'Road Maintenance');
  assert.strictEqual(res.departmentCode, 'ROAD');
  assert.strictEqual(res.routingStatus, 'Direct');
  assert.strictEqual(isRoadDepartment(res), true);
});

test('Road defect near park location -> Road Maintenance', () => {
  const res = classifyDepartmentFromDescription('The road near the park is damaged with cracks.');
  assert.strictEqual(res.departmentCode, 'ROAD');
  assert.strictEqual(isRoadDepartment(res), true);
});

test('Road defect near government building -> Road Maintenance', () => {
  const res = classifyDepartmentFromDescription('There is a deep crater in the road in front of the municipal building.');
  assert.strictEqual(res.departmentCode, 'ROAD');
  assert.strictEqual(isRoadDepartment(res), true);
});

test('Drain blocked by leaves -> Stormwater priority', () => {
  const res = classifyDepartmentFromDescription('Drain is blocked by fallen leaves.');
  assert.strictEqual(res.departmentCode, 'DRAIN');
});

test('Garbage dumped near a tree -> SWM priority', () => {
  const res = classifyDepartmentFromDescription('Garbage dumped near a tree.');
  assert.strictEqual(res.departmentCode, 'SWM');
});

test('Sewage leaking near tree -> SEWER priority', () => {
  const res = classifyDepartmentFromDescription('Sewage is leaking near a tree.');
  assert.strictEqual(res.departmentCode, 'SEWER');
});

// -------------------------------------------------------------
// 9. Department Config & Helper Integrity
// -------------------------------------------------------------
console.log('\n--- 9. Department Config & Helper Functions ---');
test('getDepartmentCode helper for all departments', () => {
  assert.strictEqual(getDepartmentCode('Road Maintenance'), 'ROAD');
  assert.strictEqual(getDepartmentCode('Solid Waste Management'), 'SWM');
  assert.strictEqual(getDepartmentCode('Stormwater / Drainage'), 'DRAIN');
  assert.strictEqual(getDepartmentCode('Sewerage'), 'SEWER');
  assert.strictEqual(getDepartmentCode('Public Building Maintenance'), 'BUILDING');
  assert.strictEqual(getDepartmentCode('Parks and Public Spaces'), 'PARKS');
  assert.strictEqual(getDepartmentCode('Tree / Greenery Maintenance'), 'TREES');
});

test('getRoutingStatus helper for all departments', () => {
  assert.strictEqual(getRoutingStatus('ROAD'), 'Direct');
  assert.strictEqual(getRoutingStatus('SWM'), 'Moved to Solid Waste Management');
  assert.strictEqual(getRoutingStatus('DRAIN'), 'Moved to Stormwater / Drainage');
  assert.strictEqual(getRoutingStatus('SEWER'), 'Moved to Sewerage');
  assert.strictEqual(getRoutingStatus('BUILDING'), 'Moved to Public Building Maintenance');
  assert.strictEqual(getRoutingStatus('PARKS'), 'Moved to Parks and Public Spaces');
  assert.strictEqual(getRoutingStatus('TREES'), 'Moved to Tree / Greenery Maintenance');
});

test('isRoadDepartment handles strings and complaint objects', () => {
  assert.strictEqual(isRoadDepartment('Road Maintenance'), true);
  assert.strictEqual(isRoadDepartment('ROAD'), true);
  assert.strictEqual(isRoadDepartment('Solid Waste Management'), false);
  assert.strictEqual(isRoadDepartment({ department: 'Road Maintenance', departmentCode: 'ROAD', routingStatus: 'Direct' }), true);
  assert.strictEqual(isRoadDepartment({ department: 'Solid Waste Management', departmentCode: 'SWM', routingStatus: 'Moved to Solid Waste Management' }), false);
});

console.log('\n===============================================================');
console.log(`📊 FINAL SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('===============================================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL COMPREHENSIVE DEPARTMENT ROUTING TESTS PASSED!');
}
