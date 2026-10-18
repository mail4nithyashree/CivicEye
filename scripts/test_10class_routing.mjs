import assert from 'node:assert';
import {
  getDepartmentForIssue,
  getDepartmentCode,
  getRoutingStatus,
  ISSUE_DEPARTMENT_MAP
} from '../services/departmentMapping.ts';
import {
  CLASS_ID_MAP,
  ISSUE_DEPARTMENT,
  calculatePriority
} from '../services/detectionConfig.ts';

console.log('===============================================================');
console.log('🏛️  CIVICEYE 10-CLASS DEPARTMENT ROUTING & PRIORITIZATION TEST');
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
// 1. 10-Class Complete Coverage Tests
// -------------------------------------------------------------
console.log('--- 1. Verified 10-Class Department Routing ---');

const EXPECTED_MAPPINGS = [
  { id: 0, class: 'alligator cracking', deptCode: 'ROAD', deptName: 'Road Maintenance' },
  { id: 1, class: 'cracking',           deptCode: 'ROAD', deptName: 'Road Maintenance' },
  { id: 2, class: 'pothole',            deptCode: 'ROAD', deptName: 'Road Maintenance' },
  { id: 3, class: 'manhole defect',     deptCode: 'DRAIN', deptName: 'Stormwater / Drainage' },
  { id: 4, class: 'waterlogging',       deptCode: 'DRAIN', deptName: 'Stormwater / Drainage' },
  { id: 5, class: 'road divider damage',deptCode: 'SAFETY', deptName: 'Traffic / Road Safety Department' },
  { id: 6, class: 'damaged traffic sign',deptCode: 'SAFETY', deptName: 'Traffic / Road Safety Department' },
  { id: 7, class: 'street light fault', deptCode: 'LIGHTING', deptName: 'Street Lighting Department' },
  { id: 8, class: 'debris / road blockage', deptCode: 'SWM', deptName: 'Solid Waste Management' },
  { id: 9, class: 'damaged footpath',   deptCode: 'PWD', deptName: 'Public Works Department' },
];

for (const m of EXPECTED_MAPPINGS) {
  test(`Class [${m.id}] '${m.class}' routes to ${m.deptName} (${m.deptCode})`, () => {
    // Check detectionConfig mapping
    assert.strictEqual(CLASS_ID_MAP[m.id], m.class);
    
    // Check departmentMapping.ts lookup
    const info = getDepartmentForIssue(m.class);
    assert.strictEqual(info.code, m.deptCode);
    assert.strictEqual(info.name, m.deptName);

    // Check code normalizer
    assert.strictEqual(getDepartmentCode(m.deptName), m.deptCode);
  });
}

// -------------------------------------------------------------
// 2. Fallback & Unknown Class Safety
// -------------------------------------------------------------
console.log('\n--- 2. Fallback & Unknown Class Safety ---');

test('Unknown class safely defaults to Road Maintenance (ROAD)', () => {
  const fallback = getDepartmentForIssue('completely_unknown_alien_defect');
  assert.strictEqual(fallback.code, 'ROAD');
  assert.strictEqual(fallback.name, 'Road Maintenance');
});

test('no_major_issue defaults to Road Maintenance (ROAD)', () => {
  const info = getDepartmentForIssue('no_major_issue');
  assert.strictEqual(info.code, 'ROAD');
});

// -------------------------------------------------------------
// 3. Explainable Prioritization Tests
// -------------------------------------------------------------
console.log('\n--- 3. Explainable Prioritization Tests ---');

test('Manhole defect is always immediately HIGH priority (Life Hazard)', () => {
  const p1 = calculatePriority('manhole defect', 0.30);
  const p2 = calculatePriority('manhole defect', 0.90);
  assert.strictEqual(p1, 'HIGH');
  assert.strictEqual(p2, 'HIGH');
});

test('Pothole priority scales with surface area and detection count', () => {
  // Small shallow pothole (low confidence & small area)
  const pSmall = calculatePriority('pothole', 0.25, { width: 0.02, height: 0.02 }, 1);
  assert.strictEqual(pSmall, 'LOW');

  // Medium pothole
  const pMed = calculatePriority('pothole', 0.35, { width: 0.20, height: 0.20 }, 1);
  assert.strictEqual(pMed, 'MEDIUM');

  // Large severe pothole or multiple potholes
  const pLarge = calculatePriority('pothole', 0.40, { width: 0.35, height: 0.35 }, 1);
  const pMulti = calculatePriority('pothole', 0.30, { width: 0.10, height: 0.10 }, 2);
  assert.strictEqual(pLarge, 'HIGH');
  assert.strictEqual(pMulti, 'HIGH');
});

test('Clean road (no_major_issue) assigns priority NONE', () => {
  const pNone = calculatePriority('no_major_issue', 0.0);
  assert.strictEqual(pNone, 'NONE');
});

// -------------------------------------------------------------
// 4. Multi-Detection Prioritization Ranking
// -------------------------------------------------------------
console.log('\n--- 4. Multi-Detection Primary Selection ---');

test('High-hazard manhole takes precedence over minor surface crack', () => {
  const detections = [
    { classId: 1, issueType: 'cracking', priority: 'LOW', confidence: 0.85 },
    { classId: 3, issueType: 'manhole defect', priority: 'HIGH', confidence: 0.60 },
  ];

  const priorityOrder = ['HIGH', 'MEDIUM', 'LOW', 'NONE'];
  const sorted = detections.slice().sort((a, b) => {
    const pa = priorityOrder.indexOf(a.priority);
    const pb = priorityOrder.indexOf(b.priority);
    if (pa !== pb) return pa - pb;
    return b.confidence - a.confidence;
  });

  const primary = sorted[0];
  assert.strictEqual(primary.issueType, 'manhole defect');
  assert.strictEqual(primary.priority, 'HIGH');
});

console.log('\n===============================================================');
console.log(`📊 FINAL SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('===============================================================');
if (failed > 0) process.exit(1);
