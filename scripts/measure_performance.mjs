import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const BACKEND_URL = 'http://127.0.0.1:3000';

async function measure() {
  console.log('========================================================================');
  console.log('⚡ CIVICEYE SYSTEM PERFORMANCE & LATENCY BENCHMARK');
  console.log('========================================================================\n');

  const potholePath = path.resolve(projectRoot, 'assets/models/pothole_user_crop.jpg');
  const buf = fs.readFileSync(potholePath);

  // 1. Health check latency
  const tHealthStart = performance.now();
  const healthRes = await fetch(`${BACKEND_URL}/health`);
  const healthTime = performance.now() - tHealthStart;
  const healthData = await healthRes.json();
  console.log(`1. Health Check Endpoint Latency:  ${healthTime.toFixed(2)} ms (Status: ${healthData.onnxModel})`);

  // 2. Validate Road (MobileNetV2 scene validator) - 10 iterations
  const validateTimes = [];
  for (let i = 0; i < 10; i++) {
    const blob = new Blob([buf], { type: 'image/jpeg' });
    const fd = new FormData();
    fd.append('image', blob, 'pothole.jpg');

    const t0 = performance.now();
    const res = await fetch(`${BACKEND_URL}/api/validate-road`, { method: 'POST', body: fd });
    const t1 = performance.now();
    await res.json();
    validateTimes.push(t1 - t0);
  }

  const avgValidate = validateTimes.reduce((a, b) => a + b, 0) / validateTimes.length;
  const minValidate = Math.min(...validateTimes);
  const maxValidate = Math.max(...validateTimes);
  console.log(`2. /api/validate-road (MobileNetV2): Avg: ${avgValidate.toFixed(2)} ms (Min: ${minValidate.toFixed(2)} ms, Max: ${maxValidate.toFixed(2)} ms)`);

  // 3. Analyze Road (Full Two-Tier Pipeline) - 10 iterations
  const analyzeTimes = [];
  for (let i = 0; i < 10; i++) {
    const blob = new Blob([buf], { type: 'image/jpeg' });
    const fd = new FormData();
    fd.append('image', blob, 'pothole.jpg');

    const t0 = performance.now();
    const res = await fetch(`${BACKEND_URL}/api/analyze-road`, { method: 'POST', body: fd });
    const t1 = performance.now();
    const data = await res.json();
    analyzeTimes.push(t1 - t0);
  }

  const avgAnalyze = analyzeTimes.reduce((a, b) => a + b, 0) / analyzeTimes.length;
  const minAnalyze = Math.min(...analyzeTimes);
  const maxAnalyze = Math.max(...analyzeTimes);
  console.log(`3. /api/analyze-road (MNet + YOLOv8): Avg: ${avgAnalyze.toFixed(2)} ms (Min: ${minAnalyze.toFixed(2)} ms, Max: ${maxAnalyze.toFixed(2)} ms)`);

  // 4. Client-side memory estimate
  const mem = process.memoryUsage();
  console.log(`4. Node.js Process Memory Footprint:`);
  console.log(`   - RSS (Resident Set Size):        ${(mem.rss / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   - Heap Total:                     ${(mem.heapTotal / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   - Heap Used:                      ${(mem.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   - External (ONNX C++ Tensors):    ${(mem.external / (1024 * 1024)).toFixed(2)} MB`);

  console.log('\n========================================================================');
  console.log('✅ BENCHMARK COMPLETE');
  console.log('========================================================================\n');
}

measure().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
