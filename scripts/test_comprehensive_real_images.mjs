import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const API_BASE = 'http://localhost:3000';

async function testApiEndpoint(imagePath, description, testCaseName) {
  console.log(`\n======================================================`);
  console.log(`TEST CASE: ${testCaseName}`);
  console.log(`Image: ${imagePath ? path.basename(imagePath) : '(None/Generated)'}`);
  console.log(`Description: "${description}"`);
  console.log(`------------------------------------------------------`);

  let buffer;
  if (imagePath && fs.existsSync(imagePath)) {
    buffer = fs.readFileSync(imagePath);
  } else if (testCaseName.includes('Blurry') || testCaseName.includes('Dark')) {
    // Generate a pitch black 100x100 JPEG buffer
    buffer = Buffer.alloc(100 * 100 * 4, 10); // very dark
  } else {
    buffer = Buffer.from('invalid-bytes');
  }

  // Create multipart boundary
  const boundary = '----WebKitFormBoundaryCivicEyeTest' + Date.now();
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="test.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`;
  const descField = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="description"\r\n\r\n${description}`;
  const footer = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([
    Buffer.from(header, 'utf8'),
    buffer,
    Buffer.from(descField, 'utf8'),
    Buffer.from(footer, 'utf8')
  ]);

  const startTime = Date.now();
  const res = await fetch(`${API_BASE}/api/analyze-road`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  const durationMs = Date.now() - startTime;
  const json = await res.json();

  console.log(`HTTP Status: ${res.status} (${durationMs}ms)`);
  console.log(`Model Provider: ${json.provider}`);
  console.log(`Model Version: ${json.modelVersion}`);
  console.log(`Prediction State: ${json.predictionState}`);
  console.log(`Normalized Display Name: ${json.displayIssueName}`);
  console.log(`Predicted Class / Issue Type: ${json.issueType}`);
  console.log(`Confidence: ${json.confidence}% (Type: ${json.confidenceType}, Raw: ${json.confidenceRaw})`);
  console.log(`Priority: ${json.priority}`);
  console.log(`Priority Reason: ${json.priorityReason}`);
  console.log(`Department: ${json.department} (Code: ${json.departmentCode})`);
  console.log(`Is Road: ${json.isRoad}, Has Damage: ${json.hasDamage}`);
  console.log(`Message: ${json.message}`);

  return {
    testCaseName,
    httpStatus: res.status,
    durationMs,
    ...json
  };
}

async function runAllTests() {
  console.log("Starting CivicEye Vision AI Automated Verification Suite...");
  
  // 1. Health check
  const healthRes = await fetch(`${API_BASE}/api/health`);
  const healthJson = await healthRes.json();
  console.log("Health Check:", healthJson);

  const results = [];

  // Case 1: Clear Pothole
  const potholeImg = path.join(projectRoot, 'AI', 'test_images', 'pothole', 'bNAGLORE-POTHOLES-820-5-3.jpg');
  results.push(await testApiEndpoint(
    potholeImg,
    'Huge deep pothole in the middle of active traffic lane, danger of bike crash',
    'Case 1: Clear Pothole Image (Hazard Reported)'
  ));

  // Case 2: Clear Alligator Cracking
  const alligatorImg = path.join(projectRoot, 'AI', 'test_images', 'alligator_cracking', 'a1.jpg');
  results.push(await testApiEndpoint(
    alligatorImg,
    'Extensive alligator cracking across the road with severe sub-base fatigue',
    'Case 2: Clear Alligator Cracking Image (Severe Fatigue)'
  ));

  // Case 3: Longitudinal/Transverse Road Cracking
  const crackingImg = path.join(projectRoot, 'AI', 'test_images', 'cracking', '360_F_64744739_r0UHCNGo1FCeosorpBykzott8bttMdl3.jpg');
  results.push(await testApiEndpoint(
    crackingImg,
    'Noticeable linear road cracking spreading across the pavement surface',
    'Case 3: Longitudinal/Transverse Road Cracking Image'
  ));

  // Case 4: Clean Road (No Major Issue)
  const cleanRoadImg = path.join(projectRoot, 'AI', 'test_images', 'valid_road_no_issue', 'Northeast-India-s-emergence-as-a-land-bridge-exten_1756133885758.jpg');
  results.push(await testApiEndpoint(
    cleanRoadImg,
    'Clean newly paved road surface, checking road condition',
    'Case 4: Clean Road / No Major Issue Image'
  ));

  // Case 5: Flower image with pothole description
  const flowerImg = path.join(projectRoot, 'AI', 'test_images', 'flowers_plants', '10_07_26_Dahlias.jpg');
  results.push(await testApiEndpoint(
    flowerImg,
    'Deep dangerous pothole on the main highway causing vehicle damage',
    'Case 5: Flower / Unrelated Image with Pothole Description'
  ));

  // Case 6: Blurry / Dark unreadable image
  results.push(await testApiEndpoint(
    null,
    'Pothole on dark road at night',
    'Case 6: Genuinely Ambiguous / Pitch Black Image'
  ));

  // Case 7: Corrupted / Failure Case
  console.log(`\n======================================================`);
  console.log(`TEST CASE: Case 7: API / Missing Body Error Case`);
  console.log(`------------------------------------------------------`);
  const failRes = await fetch(`${API_BASE}/api/analyze-road`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: 'no image provided' })
  });
  const failJson = await failRes.json();
  console.log(`HTTP Status: ${failRes.status}`);
  console.log(`Prediction State: ${failJson.predictionState}`);
  console.log(`Message: ${failJson.message}`);
  results.push({
    testCaseName: 'Case 7: API / Missing Body Error Case',
    httpStatus: failRes.status,
    predictionState: failJson.predictionState,
    displayIssueName: 'Inference Failed',
    message: failJson.message,
  });

  console.log(`\n======================================================`);
  console.log(`TEST SUMMARY TABLE`);
  console.log(`======================================================`);
  console.table(results.map(r => ({
    Test: r.testCaseName.split(':')[1]?.trim() || r.testCaseName,
    State: r.predictionState,
    DisplayIssue: r.displayIssueName,
    Confidence: `${r.confidence ?? 0}%`,
    ConfType: r.confidenceType || 'N/A',
    Priority: r.priority || 'N/A',
    Department: r.department || 'None',
  })));
}

runAllTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
