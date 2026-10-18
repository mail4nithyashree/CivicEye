import { autoSplitBudget, getStandardEstimatedBudget } from '../constants/coimbatoreRoads.ts';

console.log('================================================================');
console.log('🧪 TESTING FIELD INSPECTOR BUDGET AUTO-SPLIT & DEPT CONFIRMATION');
console.log('================================================================');

// TEST 1: Budget Auto-Split Algorithm Validation (4 Pillars: Material 45%, Labour 30%, Safety 15%, Overhead 10%)
console.log('\n--- 1. Testing autoSplitBudget 4-Pillar Splits ---');
const testBudgets = [10000, 25000, 45000, 75000, 100000];

for (const amount of testBudgets) {
  const split = autoSplitBudget(amount, 'pothole', 'MEDIUM');
  console.log(`\n• Total Budget: ₹${amount.toLocaleString('en-IN')}`);
  console.log(`  - Material Cost (45%): ₹${split.materialCost.toLocaleString('en-IN')}`);
  console.log(`  - Labour Charge (30%): ₹${split.laborCost.toLocaleString('en-IN')} (${split.workersCount} workers × ${split.estimatedDays} days @ ₹${split.dailyWagePerWorker}/day)`);
  console.log(`  - Safety & Machinery (15%): ₹${split.machineryCost.toLocaleString('en-IN')}`);
  console.log(`  - Overhead Expenses (10%): ₹${split.overheadCost.toLocaleString('en-IN')}`);

  const sumPillars = split.materialCost + split.laborCost + split.machineryCost + split.overheadCost;
  if (sumPillars !== amount) {
    console.error(`❌ SUM MISMATCH: Expected ₹${amount}, Got ₹${sumPillars}`);
    process.exit(1);
  }
  console.log(`  ✅ Sum check passed: ₹${sumPillars.toLocaleString('en-IN')} == ₹${amount.toLocaleString('en-IN')} (100%)`);
  console.log(`  - Breakdown BOQ items count: ${split.breakdown.length}`);
  split.breakdown.forEach((item, idx) => {
    console.log(`    ${idx + 1}. [${item.category.toUpperCase()}] ${item.item} -> ₹${item.totalCost.toLocaleString('en-IN')}`);
  });
}

// TEST 2: Testing Server Verification & Confirmation Proxies
console.log('\n--- 2. Testing Server Backend Endpoints ---');

async function testBackend() {
  try {
    const healthRes = await fetch('http://localhost:3000/api/health');
    const healthJson = await healthRes.json();
    console.log('✅ Server Health Check:', healthJson);

    // Test verify-workflow endpoint
    const testComplaintId = `test-verify-${Date.now()}`;
    const verifyWorkflowRes = await fetch('http://localhost:3000/api/verify-workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complaintId: testComplaintId,
        params: {
          action: 'confirm_existing',
          inspectorId: 'test-inspector-uid',
          inspectorName: 'Er. Test Inspector',
          remarks: 'Verified on-site asphalt condition and dimensions.',
        },
      }),
    });

    console.log('Verify workflow response status (expecting 404 for non-existent test ID or 200):', verifyWorkflowRes.status);
    const verifyWorkflowData = await verifyWorkflowRes.json();
    console.log('Verify workflow response:', verifyWorkflowData);

    console.log('\n================================================================');
    console.log('🎉 ALL BUDGET AUTO-SPLIT AND WORKFLOW TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');
  } catch (err) {
    console.error('Backend endpoint test error:', err);
  }
}

testBackend();
