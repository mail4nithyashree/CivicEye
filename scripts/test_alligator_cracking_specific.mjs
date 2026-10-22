import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://127.0.0.1:3000';

async function sendAnalyzeRequest(filePath, description = '') {
  const fileBuffer = fs.readFileSync(filePath);
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const filename = path.basename(filePath);

  const pre = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
    `Content-Type: image/jpeg\r\n\r\n`
  );
  const postDesc = Buffer.from(
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="description"\r\n\r\n` +
    `${description}\r\n--${boundary}--\r\n`
  );

  const body = Buffer.concat([pre, fileBuffer, postDesc]);

  const response = await fetch(`${BASE_URL}/api/analyze-road`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length.toString(),
    },
    body: body,
  });

  return await response.json();
}

async function runSpecificTests() {
  console.log('========================================================================');
  console.log('🧪 VERIFYING SPECIFIC VISION AI PREDICTION & ALLIGATOR CRACKING PIPELINE');
  console.log('========================================================================\n');

  // Test 1: Alligator Cracking Image
  console.log('--- Test 1: Alligator Cracking Image (AI/test_images/alligator_cracking/a4.jpg) ---');
  const resAlligator = await sendAnalyzeRequest(
    'AI/test_images/alligator_cracking/a4.jpg',
    'Road has extensive alligator fatigue cracking across the lane'
  );
  console.log('Response:', JSON.stringify(resAlligator, null, 2));

  const alligatorPassed =
    resAlligator.displayIssueName === 'Alligator Cracking' &&
    resAlligator.predictionState === 'VALID_ISSUE' &&
    resAlligator.confidence >= 70 &&
    (resAlligator.priority === 'MEDIUM' || resAlligator.priority === 'HIGH') &&
    resAlligator.priority !== 'NONE';

  console.log(`\nAlligator Cracking Test Result: ${alligatorPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`- displayIssueName: "${resAlligator.displayIssueName}" (Expected: "Alligator Cracking")`);
  console.log(`- predictionState:  "${resAlligator.predictionState}" (Expected: "VALID_ISSUE")`);
  console.log(`- confidence:       ${resAlligator.confidence}% (Expected: >= 70%)`);
  console.log(`- priority:         "${resAlligator.priority}" (Expected: "MEDIUM" or "HIGH", never "NONE")`);
  console.log(`- priorityReason:   "${resAlligator.priorityReason}"`);
  console.log(`- department:       "${resAlligator.department || resAlligator.responsibleDepartment}"\n`);

  // Test 2: Flower Image Rejection
  console.log('--- Test 2: Flower Image (AI/test_images/flowers_plants/close-up-full-bloom-flower_23-2151921043.jpg) ---');
  const resFlower = await sendAnalyzeRequest(
    'AI/test_images/flowers_plants/close-up-full-bloom-flower_23-2151921043.jpg',
    'Massive pothole in front of my gate'
  );
  console.log('Response:', JSON.stringify(resFlower, null, 2));

  const flowerPassed =
    (resFlower.predictionState === 'INVALID_IMAGE' || resFlower.validationStatus === 'unrelated_image') &&
    resFlower.displayIssueName !== 'Pothole';

  console.log(`\nFlower Image Test Result: ${flowerPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`- predictionState:  "${resFlower.predictionState}" (Expected: "INVALID_IMAGE")`);
  console.log(`- displayIssueName: "${resFlower.displayIssueName}" (Expected: "Invalid Issue Image", NOT "Pothole")\n`);

  // Test 3: Normal Road Image
  console.log('--- Test 3: Normal Road Surface (AI/test_images/valid_road_no_issue/images.jpg) ---');
  const resClean = await sendAnalyzeRequest(
    'AI/test_images/valid_road_no_issue/images.jpg',
    'Clean asphalt road surface'
  );
  console.log('Response:', JSON.stringify(resClean, null, 2));

  const cleanPassed =
    (resClean.predictionState === 'NO_MAJOR_ISSUE' || resClean.issueType === 'no_major_issue') &&
    resClean.priority === 'NONE' &&
    resClean.confidence === 0;

  console.log(`\nNormal Road Test Result: ${cleanPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`- predictionState:  "${resClean.predictionState}" (Expected: "NO_MAJOR_ISSUE")`);
  console.log(`- displayIssueName: "${resClean.displayIssueName}" (Expected: "No Major Issue")`);
  console.log(`- priority:         "${resClean.priority}" (Expected: "NONE")`);
  console.log(`- confidence:       ${resClean.confidence}%\n`);

  // Test 4: Description-based Routing
  console.log('--- Test 4: Description-Based Routing (Streetlight issue on road surface) ---');
  const resLighting = await sendAnalyzeRequest(
    'AI/test_images/valid_road_no_issue/images.jpg',
    'Street light is not glowing and the lamppost is broken'
  );
  console.log('Response:', JSON.stringify(resLighting, null, 2));

  const lightingPassed =
    resLighting.departmentCode === 'LIGHTING' ||
    (resLighting.department && resLighting.department.includes('Lighting')) ||
    (resLighting.responsibleDepartment && resLighting.responsibleDepartment.includes('Lighting'));

  console.log(`\nDescription Routing Test Result: ${lightingPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`- department:     "${resLighting.department || resLighting.responsibleDepartment}"`);
  console.log(`- departmentCode: "${resLighting.departmentCode}" (Expected: "LIGHTING")\n`);

  if (alligatorPassed && flowerPassed && cleanPassed && lightingPassed) {
    console.log('🎉 ALL SPECIFIC TARGET TESTS PASSED PERFECTLY!');
  } else {
    console.error('❌ SOME SPECIFIC TARGET TESTS FAILED!');
    process.exit(1);
  }
}

runSpecificTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
