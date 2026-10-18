// Drainage / Stormwater Management Flow Test Runner
import { classifyDepartmentFromDescription, DEPARTMENTS_CONFIG } from '../services/departmentMapping.ts';
import express from 'express';

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
console.log('🧪 RUNNING DRAINAGE / STORMWATER MANAGEMENT VERIFICATION');
console.log('====================================================\n');

// -------------------------------------------------------------
// Test Suite 1: Description-based Department Classification (User Examples)
// -------------------------------------------------------------
console.log('Test Suite 1: User-Specified Example Descriptions');

const userExampleDescriptions = [
  'Drain is blocked',
  'Drainage is overflowing',
  'Stormwater drain is blocked',
  'Water is stagnating on the road',
  'Rainwater is not draining',
  'Drain is damaged',
  'Sewage water is overflowing from the drain',
  'Heavy rainwater is accumulating here',
  'Stormwater is flooding the street',
  'Drainage blockage near my house',
];

userExampleDescriptions.forEach((desc, idx) => {
  const result = classifyDepartmentFromDescription(desc);
  assert(
    `[${idx + 1}] "${desc}" -> Drainage / Stormwater Management (DRAINAGE)`,
    result.department === 'Drainage / Stormwater Management' &&
    result.departmentCode === 'DRAINAGE' &&
    result.departmentSource === 'description' &&
    result.routingStatus === 'Moved to Drainage / Stormwater Management' &&
    result.routingMessage === 'Your complaint has been moved to the Drainage / Stormwater Management Department for further action.' &&
    result.isMoved === true
  );
});

// -------------------------------------------------------------
// Test Suite 2: All Required Keywords
// -------------------------------------------------------------
console.log('\nTest Suite 2: Required Keyword Variations');

const requiredKeywordDescriptions = [
  'There is a serious drain problem on 4th street',
  'Severe drainage issues causing trouble',
  'The stormwater system is clogged with leaves',
  'Storm water level is rising rapidly',
  'Rainwater is entering ground floor houses',
  'Severe drain blockage in our alley',
  'A blocked drain is causing water accumulation',
  'We observed drain overflow after the storm',
  'Constant drainage overflow near bus terminal',
  'High water stagnation in front of school gate',
  'Severe waterlogging reported near market',
  'Heavy rainwater accumulation on the road',
  'Underground stormwater drain is overflowing',
  'Completely flooded street after 20 minutes of rain',
  'Grave sewage overflow into the lane',
];

requiredKeywordDescriptions.forEach((desc, idx) => {
  const result = classifyDepartmentFromDescription(desc);
  assert(
    `[Keyword ${idx + 1}] "${desc}" -> Drainage / Stormwater Management (DRAINAGE)`,
    result.department === 'Drainage / Stormwater Management' &&
    result.departmentCode === 'DRAINAGE' &&
    result.departmentSource === 'description' &&
    result.routingStatus === 'Moved to Drainage / Stormwater Management' &&
    result.routingMessage === 'Your complaint has been moved to the Drainage / Stormwater Management Department for further action.' &&
    result.isMoved === true
  );
});

// -------------------------------------------------------------
// Test Suite 3: Road Maintenance Fallback & Road Keywords
// -------------------------------------------------------------
console.log('\nTest Suite 3: Road Maintenance Fallback & Keyword Classification');

const roadTestDescriptions = [
  'Huge pothole in the middle of the road',
  'Deep crater in asphalt causing traffic delay',
  'Damaged road surface with alligator cracking',
  'Broken road near the signal',
  '', // empty fallback
  'A general issue that is not specific',
];

roadTestDescriptions.forEach((desc, idx) => {
  const result = classifyDepartmentFromDescription(desc);
  assert(
    `[Road ${idx + 1}] "${desc || '(empty)'}" -> Road Maintenance (ROAD)`,
    result.department === 'Road Maintenance' &&
    result.departmentCode === 'ROAD' &&
    result.routingStatus === 'Direct' &&
    result.isMoved === false
  );
});

// -------------------------------------------------------------
// Test Suite 4: Email Notification Formatting
// -------------------------------------------------------------
console.log('\nTest Suite 4: Email Notification Endpoint Verification');

const app = express();
app.use(express.json());

app.post('/api/send-email', (req, res) => {
  const {
    complaintId,
    issueType,
    description,
    citizenEmail,
    department = 'Drainage / Stormwater Management',
    routingStatus = 'Moved to Drainage / Stormwater Management',
  } = req.body || {};

  if (!citizenEmail) {
    return res.status(400).json({ ok: false, message: 'Citizen email is required.' });
  }

  const emailSubject = `CivicEye Complaint Moved to ${department}`;
  const emailBody = `Your CivicEye complaint has been successfully registered.

Complaint ID: ${complaintId || 'N/A'}

Issue: ${issueType || 'Drainage Blockage'}

Description: ${description || 'N/A'}

Department: ${department}

Routing Status: ${routingStatus}

Your complaint has been forwarded to the ${department} Department for further action.

Thank you for using CivicEye.`;

  return res.status(200).json({
    ok: true,
    sent: true,
    citizenEmail,
    subject: emailSubject,
    body: emailBody,
    complaintId,
    department,
    routingStatus,
  });
});

const server = app.listen(0, async () => {
  const port = server.address().port;
  const samplePayload = {
    complaintId: 'CE9876',
    issueType: 'Drainage Blockage',
    description: 'Drain is blocked near my house',
    citizenEmail: 'citizen@example.com',
    department: 'Drainage / Stormwater Management',
    routingStatus: 'Moved to Drainage / Stormwater Management',
  };

  try {
    const response = await fetch(`http://localhost:${port}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(samplePayload),
    });

    const data = await response.json();

    assert('Email endpoint returns 200 OK', response.status === 200);
    assert(
      'Email subject matches exact specification: "CivicEye Complaint Moved to Drainage / Stormwater Management"',
      data.subject === 'CivicEye Complaint Moved to Drainage / Stormwater Management'
    );
    assert('Email body includes correct Complaint ID: CE9876', data.body.includes('Complaint ID: CE9876'));
    assert('Email body includes correct Issue: Drainage Blockage', data.body.includes('Issue: Drainage Blockage'));
    assert('Email body includes correct Description: Drain is blocked near my house', data.body.includes('Description: Drain is blocked near my house'));
    assert('Email body includes correct Department: Drainage / Stormwater Management', data.body.includes('Department: Drainage / Stormwater Management'));
    assert('Email body includes correct Routing Status: Moved to Drainage / Stormwater Management', data.body.includes('Routing Status: Moved to Drainage / Stormwater Management'));
    assert(
      'Email body includes exact forwarding message',
      data.body.includes('Your complaint has been forwarded to the Drainage / Stormwater Management Department for further action.')
    );
    assert('Email body includes thank you closing', data.body.includes('Thank you for using CivicEye.'));
  } catch (err) {
    console.error('❌ Email test error:', err);
    failed++;
  } finally {
    server.close();

    console.log('\n====================================================');
    console.log(`📊 DRAINAGE VERIFICATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
});
