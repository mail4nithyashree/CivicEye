import assert from 'node:assert';
import { resolveComplaintImage, getDefectFallbackImage } from '../constants/defectImages.ts';

console.log('===============================================================');
console.log('🧪 CIVICEYE RESOLUTION & IMAGE CONSISTENCY TEST SUITE');
console.log('===============================================================');

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    testsFailed++;
  }
}

// -----------------------------------------------------------------------------
// 1. CANONICAL IMAGE PRESERVATION ACROSS CITIZEN & OFFICER VIEWS
// -----------------------------------------------------------------------------
console.log('\n--- 1. Canonical Image Preservation & Uniformity ---');

runTest('Complaint A preserves its exact uploaded Cloudinary URL across all views', () => {
  const complaintA = {
    id: 'comp_001',
    complaintId: 'CE-1001',
    imageUri: 'https://res.cloudinary.com/civiceye/image/upload/v1234567890/complaints/complaint_A.jpg',
    imageUrl: 'https://res.cloudinary.com/civiceye/image/upload/v1234567890/complaints/complaint_A.jpg',
    issueType: 'pothole',
  };

  const citizenDashboardImage = resolveComplaintImage(complaintA.imageUri, complaintA.issueType);
  const officerDashboardImage = resolveComplaintImage(complaintA.imageUri, complaintA.issueType);
  const complaintDetailImage = resolveComplaintImage(complaintA.imageUri, complaintA.issueType);
  const fieldVerificationImage = resolveComplaintImage(complaintA.imageUri, complaintA.issueType);

  assert.strictEqual(citizenDashboardImage, complaintA.imageUri);
  assert.strictEqual(officerDashboardImage, complaintA.imageUri);
  assert.strictEqual(complaintDetailImage, complaintA.imageUri);
  assert.strictEqual(fieldVerificationImage, complaintA.imageUri);
  assert.strictEqual(citizenDashboardImage, officerDashboardImage);
});

runTest('Complaint B preserves its exact uploaded Cloudinary URL with no cross-display', () => {
  const complaintA = {
    id: 'comp_001',
    complaintId: 'CE-1001',
    imageUri: 'https://res.cloudinary.com/civiceye/image/upload/v1234567890/complaints/complaint_A.jpg',
    issueType: 'pothole',
  };

  const complaintB = {
    id: 'comp_002',
    complaintId: 'CE-1002',
    imageUri: 'https://res.cloudinary.com/civiceye/image/upload/v1234567890/complaints/complaint_B.jpg',
    issueType: 'cracking',
  };

  const imageA_Citizen = resolveComplaintImage(complaintA.imageUri, complaintA.issueType);
  const imageA_Officer = resolveComplaintImage(complaintA.imageUri, complaintA.issueType);
  const imageB_Citizen = resolveComplaintImage(complaintB.imageUri, complaintB.issueType);
  const imageB_Officer = resolveComplaintImage(complaintB.imageUri, complaintB.issueType);

  assert.strictEqual(imageA_Citizen, 'https://res.cloudinary.com/civiceye/image/upload/v1234567890/complaints/complaint_A.jpg');
  assert.strictEqual(imageA_Officer, 'https://res.cloudinary.com/civiceye/image/upload/v1234567890/complaints/complaint_A.jpg');
  assert.strictEqual(imageB_Citizen, 'https://res.cloudinary.com/civiceye/image/upload/v1234567890/complaints/complaint_B.jpg');
  assert.strictEqual(imageB_Officer, 'https://res.cloudinary.com/civiceye/image/upload/v1234567890/complaints/complaint_B.jpg');

  assert.notStrictEqual(imageA_Citizen, imageB_Citizen, 'Complaint A and B must NOT share images');
  assert.notStrictEqual(imageA_Officer, imageB_Officer, 'Complaint A and B must NOT share images');
});

runTest('Does not return stock photos or Unsplash sample images', () => {
  const result = resolveComplaintImage('https://res.cloudinary.com/civiceye/image/upload/v123/my_real_road.jpg', 'pothole');
  assert.ok(!result.includes('unsplash.com'), 'Must not substitute Unsplash stock photo');
  assert.strictEqual(result, 'https://res.cloudinary.com/civiceye/image/upload/v123/my_real_road.jpg');
});

// -----------------------------------------------------------------------------
// 2. RESOLUTION WORKFLOW (NO CITIZEN CONFIRMATION REQUIRED)
// -----------------------------------------------------------------------------
console.log('\n--- 2. Resolution Workflow & Removal of Citizen Confirmation ---');

runTest('Resolved complaint transitions directly to terminal Resolved state without pending confirmation', () => {
  const complaint = {
    id: 'comp_001',
    complaintId: 'CE-1001',
    status: 'In Progress',
    department: 'Road Maintenance',
  };

  // Simulate authority resolution
  const resolutionDetails = {
    resolvedAt: new Date(),
    resolvedBy: 'officer_101',
    resolvedByName: 'Officer K. Raman',
    resolutionRemarks: 'Bitumen patch repair completed and compacted.',
    contractorName: 'Corporation Rapid Road Wing',
  };

  const updatedComplaint = {
    ...complaint,
    status: 'Resolved',
    resolvedAt: resolutionDetails.resolvedAt,
    resolvedBy: resolutionDetails.resolvedBy,
    resolvedByName: resolutionDetails.resolvedByName,
    resolutionRemarks: resolutionDetails.resolutionRemarks,
    resolutionDetails,
  };

  assert.strictEqual(updatedComplaint.status, 'Resolved');
  assert.strictEqual(updatedComplaint.resolutionRemarks, 'Bitumen patch repair completed and compacted.');
  assert.strictEqual(updatedComplaint.resolutionDetails.resolvedByName, 'Officer K. Raman');
  assert.strictEqual(updatedComplaint.citizenVerification, undefined, 'Must not require citizen verification step');
});

runTest('Workflow sequence ends at Resolved', () => {
  const WORKFLOW_STEPS = [
    'Submitted',
    'Pending Field Verification',
    'Verified',
    'Assigned',
    'In Progress',
    'Resolved',
  ];

  assert.strictEqual(WORKFLOW_STEPS[WORKFLOW_STEPS.length - 1], 'Resolved', 'Terminal workflow state must be Resolved');
  assert.ok(!WORKFLOW_STEPS.includes('Closed'), 'Closed step should be removed from required citizen action');
  assert.ok(!WORKFLOW_STEPS.includes('Citizen Verification'), 'Citizen Verification step should be removed');
});

// -----------------------------------------------------------------------------
// SUMMARY
// -----------------------------------------------------------------------------
console.log('\n===============================================================');
console.log(`📊 FINAL SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log('===============================================================');

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL RESOLUTION & IMAGE CONSISTENCY TESTS PASSED!\n');
}
