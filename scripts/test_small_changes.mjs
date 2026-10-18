import { getDefaultIssueTypeForDepartment, isRoadDepartment } from '../services/departmentMapping.ts';

function getExpectedResolutionDuration(priority) {
  const p = (priority || '').toUpperCase().trim();
  switch (p) {
    case 'HIGH':
    case 'CRITICAL':
      return 'Within 24 hours';
    case 'MEDIUM':
      return 'Within 3 days';
    case 'LOW':
    default:
      return 'Within 7 days';
  }
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('Testing Expected Resolution Durations:');
assert(getExpectedResolutionDuration('HIGH') === 'Within 24 hours', 'HIGH priority maps to "Within 24 hours"');
assert(getExpectedResolutionDuration('High') === 'Within 24 hours', 'High priority maps to "Within 24 hours"');
assert(getExpectedResolutionDuration('CRITICAL') === 'Within 24 hours', 'CRITICAL priority maps to "Within 24 hours"');
assert(getExpectedResolutionDuration('MEDIUM') === 'Within 3 days', 'MEDIUM priority maps to "Within 3 days"');
assert(getExpectedResolutionDuration('Medium') === 'Within 3 days', 'Medium priority maps to "Within 3 days"');
assert(getExpectedResolutionDuration('LOW') === 'Within 7 days', 'LOW priority maps to "Within 7 days"');
assert(getExpectedResolutionDuration('Low') === 'Within 7 days', 'Low priority maps to "Within 7 days"');
assert(getExpectedResolutionDuration('') === 'Within 7 days', 'Empty priority maps to "Within 7 days"');

console.log('\nTesting Default Issue Types for Routed Departments:');
assert(getDefaultIssueTypeForDepartment('SWM') === 'Garbage Overflow', 'SWM default issue type');
assert(getDefaultIssueTypeForDepartment('SWM', 'garbage bin') === 'Garbage Bin Problem', 'SWM bin issue type');
assert(getDefaultIssueTypeForDepartment('DRAIN') === 'Drainage Problem', 'DRAIN default issue type');
assert(getDefaultIssueTypeForDepartment('DRAIN', 'blocked drain') === 'Drainage Blockage', 'DRAIN blocked issue type');
assert(getDefaultIssueTypeForDepartment('SEWER') === 'Sewerage Issue', 'SEWER default issue type');
assert(getDefaultIssueTypeForDepartment('SEWER', 'sewage leak') === 'Sewage Leakage', 'SEWER leak issue type');
assert(getDefaultIssueTypeForDepartment('BUILDING') === 'Building Damage', 'BUILDING default issue type');
assert(getDefaultIssueTypeForDepartment('BUILDING', 'roof leakage') === 'Roof Leakage', 'BUILDING roof leak issue type');
assert(getDefaultIssueTypeForDepartment('PARKS') === 'Park Issue', 'PARKS default issue type');
assert(getDefaultIssueTypeForDepartment('PARKS', 'broken playground swing') === 'Playground Damage', 'PARKS playground issue type');
assert(getDefaultIssueTypeForDepartment('TREES') === 'Tree / Greenery Issue', 'TREES default issue type');
assert(getDefaultIssueTypeForDepartment('TREES', 'fallen tree') === 'Fallen Tree', 'TREES fallen tree issue type');
assert(getDefaultIssueTypeForDepartment('TREES', 'overgrown vegetation') === 'Overgrown Vegetation', 'TREES overgrown issue type');

console.log('\nTesting isRoadDepartment Helper:');
assert(isRoadDepartment({ department: 'Road Maintenance', departmentCode: 'ROAD' }) === true, 'Road department is road');
assert(isRoadDepartment({ department: 'Solid Waste Management', departmentCode: 'SWM' }) === false, 'SWM is not road');
assert(isRoadDepartment({ department: 'Stormwater / Drainage', departmentCode: 'DRAIN' }) === false, 'DRAIN is not road');
assert(isRoadDepartment({ department: 'Sewerage', departmentCode: 'SEWER' }) === false, 'SEWER is not road');
assert(isRoadDepartment({ department: 'Public Building Maintenance', departmentCode: 'BUILDING' }) === false, 'BUILDING is not road');
assert(isRoadDepartment({ department: 'Parks and Public Spaces', departmentCode: 'PARKS' }) === false, 'PARKS is not road');
assert(isRoadDepartment({ department: 'Tree / Greenery Maintenance', departmentCode: 'TREES' }) === false, 'TREES is not road');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
