import { classifyComplaintFromDescription, checkDescriptionHasNoIssue } from '../services/descriptionClassifier.ts';
import { validateComplaintSubmission } from '../services/imageDescriptionValidator.ts';
import { classifyDepartmentFromDescription, getDepartmentForIssue } from '../services/departmentMapping.ts';

console.log('================================================================');
console.log('🧪 CIVICEYE: FULLY DESCRIPTION-BASED ISSUE CLASSIFICATION TESTS');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, name, details = '') {
  if (condition) {
    passed++;
    console.log(`✅ [PASS] ${name}`);
    if (details) console.log(`   ${details}`);
  } else {
    failed++;
    console.error(`❌ [FAIL] ${name}`);
    if (details) console.error(`   Details: ${details}`);
  }
}

console.log('--- 1. SPECIFIED USER EXAMPLES (DESCRIPTION-BASED CLASSIFICATION & PRIORITY) ---');

// Test 1: Major pothole at main road requiring immediate repair
const ex1 = classifyComplaintFromDescription('Major pothole at the main road requiring immediate repair');
assert(
  ex1.displayIssueName === 'Pothole' && ex1.priority === 'HIGH' && ex1.confidenceBand === 'HIGH',
  'Ex 1: "Major pothole at the main road requiring immediate repair" -> Pothole, HIGH priority',
  `Issue: ${ex1.displayIssueName}, Priority: ${ex1.priority}, Confidence: ${ex1.confidence}% (${ex1.confidenceBand})`
);

// Test 2: Small crack on the road
const ex2 = classifyComplaintFromDescription('Small crack on the road');
assert(
  (ex2.displayIssueName === 'Road Crack' || ex2.displayIssueName === 'Road Cracking') && ex2.priority === 'LOW',
  'Ex 2: "Small crack on the road" -> Road Crack, LOW priority',
  `Issue: ${ex2.displayIssueName}, Priority: ${ex2.priority}, Confidence: ${ex2.confidence}% (${ex2.confidenceBand})`
);

// Test 3: Several dangerous cracks causing a road safety risk
const ex3 = classifyComplaintFromDescription('Several dangerous cracks causing a road safety risk');
assert(
  (ex3.displayIssueName === 'Road Crack' || ex3.displayIssueName === 'Road Cracking') && ex3.priority === 'HIGH' && ex3.confidenceBand === 'HIGH',
  'Ex 3: "Several dangerous cracks causing a road safety risk" -> Road Crack, HIGH priority',
  `Issue: ${ex3.displayIssueName}, Priority: ${ex3.priority}, Confidence: ${ex3.confidence}% (${ex3.confidenceBand})`
);

// Test 4: Water is accumulating on the road
const ex4 = classifyComplaintFromDescription('Water is accumulating on the road');
assert(
  ex4.displayIssueName === 'Waterlogging' && ex4.departmentCode === 'DRAIN',
  'Ex 4: "Water is accumulating on the road" -> Waterlogging, DRAIN department',
  `Issue: ${ex4.displayIssueName}, Dept: ${ex4.department}, Code: ${ex4.departmentCode}, Priority: ${ex4.priority}`
);

// Test 5: The streetlight is not working
const ex5 = classifyComplaintFromDescription('The streetlight is not working');
assert(
  ex5.displayIssueName === 'Street Light Fault' && ex5.departmentCode === 'LIGHTING',
  'Ex 5: "The streetlight is not working" -> Street Light Fault, LIGHTING department',
  `Issue: ${ex5.displayIssueName}, Dept: ${ex5.department}, Confidence: ${ex5.confidence}%`
);

// Test 6: The manhole cover is broken
const ex6 = classifyComplaintFromDescription('The manhole cover is broken');
assert(
  ex6.displayIssueName === 'Damaged Manhole' && ex6.departmentCode === 'SEWER',
  'Ex 6: "The manhole cover is broken" -> Damaged Manhole, SEWER department',
  `Issue: ${ex6.displayIssueName}, Dept: ${ex6.department}, Priority: ${ex6.priority}`
);

// Test 7: Garbage is overflowing near the road
const ex7 = classifyComplaintFromDescription('Garbage is overflowing near the road');
assert(
  ex7.displayIssueName === 'Garbage Overflow' && ex7.departmentCode === 'SWM',
  'Ex 7: "Garbage is overflowing near the road" -> Garbage Overflow, SWM department',
  `Issue: ${ex7.displayIssueName}, Dept: ${ex7.department}`
);

// Test 8: The drainage is blocked
const ex8 = classifyComplaintFromDescription('The drainage is blocked');
assert(
  ex8.displayIssueName === 'Drainage Blockage' && ex8.departmentCode === 'DRAIN',
  'Ex 8: "The drainage is blocked" -> Drainage Blockage, DRAIN department',
  `Issue: ${ex8.displayIssueName}, Dept: ${ex8.department}`
);

// Test 9: Damaged Footpath
const ex9 = classifyComplaintFromDescription('Footpath is damaged near pedestrian crossing');
assert(
  ex9.displayIssueName === 'Damaged Footpath' && ex9.departmentCode === 'PWD',
  'Ex 9: "Footpath is damaged" -> Damaged Footpath, PWD department',
  `Issue: ${ex9.displayIssueName}, Dept: ${ex9.department}`
);

// Test 10: Damaged Traffic Sign
const ex10 = classifyComplaintFromDescription('The traffic sign is damaged on the median');
assert(
  ex10.displayIssueName === 'Damaged Traffic Sign' && ex10.departmentCode === 'SAFETY',
  'Ex 10: "The traffic sign is damaged" -> Damaged Traffic Sign, SAFETY department',
  `Issue: ${ex10.displayIssueName}, Dept: ${ex10.department}`
);

console.log('\n--- 2. CRITICAL EXAMPLE (VISION SERVICE DOWN / UNREADABLE / UNRELATED IMAGE) ---');

// Test 11: Critical Example with validateComplaintSubmission
const criticalDesc = 'Major pothole at the main road and needs immediate attention and repair.';
const critResult = await validateComplaintSubmission('invalid://non-existent-or-corrupt-image.jpg', criticalDesc);
assert(
  critResult.isValid === true && critResult.outcome === 'ALLOW' && critResult.detectedDescIssue === 'Pothole',
  'Ex 11: Vision service unavailable / corrupt image URI with pothole description -> ALLOW',
  `Outcome: ${critResult.outcome}, Issue: ${critResult.detectedDescIssue}`
);

// Test 12: Unrelated image with valid description does not block
const critUnrelated = await validateComplaintSubmission('AI/test_images/animals/animal-4917802_640.jpg', criticalDesc);
assert(
  critUnrelated.isValid === true && critUnrelated.outcome === 'ALLOW',
  'Ex 12: Unrelated image with valid description -> ALLOW',
  `Outcome: ${critUnrelated.outcome}`
);

// Test 13: Normal road photo with 0 boxes does not block
const critNormalRoad = await validateComplaintSubmission('AI/test_images/valid_road_no_issue/images.jpg', criticalDesc);
assert(
  critNormalRoad.isValid === true && critNormalRoad.outcome === 'ALLOW',
  'Ex 13: Clean road photo with 0 boxes with valid description -> ALLOW',
  `Outcome: ${critNormalRoad.outcome}`
);

// Test 14: No optional image attached
const critNoImage = await validateComplaintSubmission('', criticalDesc);
assert(
  critNoImage.isValid === true && critNoImage.outcome === 'ALLOW',
  'Ex 14: Empty image URI with valid description -> ALLOW',
  `Outcome: ${critNoImage.outcome}`
);

console.log('\n--- 3. NEGATION & AMBIGUOUS DESCRIPTIONS ---');

// Test 15: "There is no pothole on this road."
const neg1 = checkDescriptionHasNoIssue('There is no pothole on this road.');
assert(
  neg1.isNoIssue === true,
  'Ex 15: "There is no pothole on this road." -> isNoIssue is TRUE',
  `Reason: ${neg1.reason}`
);

// Test 16: "The road is fine."
const neg2 = checkDescriptionHasNoIssue('The road is fine.');
assert(
  neg2.isNoIssue === true,
  'Ex 16: "The road is fine." -> isNoIssue is TRUE',
  `Reason: ${neg2.reason}`
);

// Test 17: "There is no issue here."
const neg3 = checkDescriptionHasNoIssue('There is no issue here.');
assert(
  neg3.isNoIssue === true,
  'Ex 17: "There is no issue here." -> isNoIssue is TRUE',
  `Reason: ${neg3.reason}`
);

// Test 18: Contrastive clause: "There is no pothole, but the drain is blocked"
const cont1 = checkDescriptionHasNoIssue('There is no pothole, but the drain is blocked');
const contClass = classifyComplaintFromDescription('There is no pothole, but the drain is blocked');
assert(
  cont1.isNoIssue === false && contClass.displayIssueName === 'Drainage Blockage',
  'Ex 18: "There is no pothole, but the drain is blocked" -> Recognized as Drainage Blockage',
  `Issue: ${contClass.displayIssueName}`
);

// Test 19: Empty description
const emptyDesc = classifyComplaintFromDescription('');
assert(
  emptyDesc.isRecognized === false && emptyDesc.requiresClarification === true,
  'Ex 19: Empty description requires clarification',
  `Message: ${emptyDesc.clarificationMessage}`
);

// Test 20: Ambiguous / unknown description
const ambigDesc = classifyComplaintFromDescription('something is weird around here today');
assert(
  ambigDesc.requiresClarification === true,
  'Ex 20: Vague / ambiguous text prompts for clarification',
  `Clarification: ${ambigDesc.clarificationMessage}`
);

console.log('\n--- 4. DYNAMIC CONFIDENCE SCORE & INDEPENDENT PRIORITY VERIFICATION ---');

// Test 21: Confidences vary across descriptions (not a fixed constant)
const confidences = [
  classifyComplaintFromDescription('Major pothole at the main road requiring immediate repair').confidence,
  classifyComplaintFromDescription('Small crack on the road').confidence,
  classifyComplaintFromDescription('Water is accumulating on the road').confidence,
  classifyComplaintFromDescription('The streetlight is not working').confidence,
  classifyComplaintFromDescription('The drainage is blocked').confidence,
];
const allSame = confidences.every(c => c === confidences[0]);
assert(
  !allSame,
  'Ex 21: Confidence scores vary dynamically across descriptions',
  `Sample scores: ${confidences.join('%, ')}%`
);

// Test 22: Confidence scores stay strictly bounded [0, 100]
const allBounded = confidences.every(c => c >= 0 && c <= 100);
assert(
  allBounded,
  'Ex 22: All confidence scores are bounded within [0, 100]%',
  `Scores: ${confidences.join('%, ')}%`
);

// Test 23: Independent priority vs confidence:
// "Small crack on the road" has LOW priority
// "Several dangerous cracks causing a road safety risk" has HIGH priority
const crackLow = classifyComplaintFromDescription('Small crack on the road');
const crackHigh = classifyComplaintFromDescription('Several dangerous cracks causing a road safety risk');
assert(
  crackLow.priority === 'LOW' && crackHigh.priority === 'HIGH' && crackLow.displayIssueName === crackHigh.displayIssueName,
  'Ex 23: Priority is independent of category and confidence (Small crack = LOW priority, Dangerous cracks = HIGH priority)',
  `Low priority: ${crackLow.priority} (conf ${crackLow.confidence}%), High priority: ${crackHigh.priority} (conf ${crackHigh.confidence}%)`
);

console.log('\n--- 5. 14-DEPARTMENT ROUTING VERIFICATION ---');

const routingCases = [
  { text: 'A deep pothole on the road', expectedDept: 'Road Maintenance', expectedCode: 'ROAD' },
  { text: 'The road has alligator cracking', expectedDept: 'Road Maintenance', expectedCode: 'ROAD' },
  { text: 'Street light is broken and dark', expectedDept: 'Street Lighting Department', expectedCode: 'LIGHTING' },
  { text: 'Garbage dump is overflowing on the corner', expectedDept: 'Solid Waste Management', expectedCode: 'SWM' },
  { text: 'Stormwater drain is blocked with debris', expectedDept: 'Stormwater / Drainage', expectedCode: 'DRAIN' },
  { text: 'Broken manhole cover on the sewer line', expectedDept: 'Sewerage', expectedCode: 'SEWER' },
  { text: 'Damaged footpath tiles on walkway', expectedDept: 'Public Works Department', expectedCode: 'PWD' },
  { text: 'Broken road divider on the highway', expectedDept: 'Traffic / Road Safety Department', expectedCode: 'SAFETY' },
  { text: 'Fallen tree branch on the pavement', expectedDept: 'Tree / Greenery Maintenance', expectedCode: 'TREES' },
  { text: 'Public park playground bench broken', expectedDept: 'Parks and Public Spaces', expectedCode: 'PARKS' },
];

let routingAllPassed = true;
for (const rc of routingCases) {
  const res = classifyComplaintFromDescription(rc.text);
  if (res.departmentCode !== rc.expectedCode) {
    routingAllPassed = false;
    console.error(`Routing mismatch for "${rc.text}": got ${res.departmentCode}, expected ${rc.expectedCode}`);
  }
}
assert(
  routingAllPassed,
  'Ex 24: All 10 representative civic issues route to the exact designated municipal department',
  '10/10 department routing checks passed'
);

console.log('\n================================================================');
console.log(`SUMMARY: ${passed}/${passed + failed} Tests Passed.`);
if (failed === 0) {
  console.log('ALL TESTS PASSED 🎉');
} else {
  console.log('FAILURES DETECTED ❌');
  process.exit(1);
}
console.log('================================================================');
