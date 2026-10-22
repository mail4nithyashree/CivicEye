const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ort = require('onnxruntime-node');

const dir = 'AI/test_images/flowers_plants';
const files = fs.readdirSync(dir);

async function testAll() {
  const clsSession = await ort.InferenceSession.create('assets/models/mobilenetv2.onnx');
  const yoloSession = await ort.InferenceSession.create('assets/models/best.onnx');
  
  for (const f of files) {
    const fpath = path.join(dir, f);
    let decoded;
    try {
      const buf = fs.readFileSync(fpath);
      const pyScript = path.join(__dirname, 'decode_image.py');
      const rawBytes = execFileSync('python', [pyScript], { input: buf, maxBuffer: 50 * 1024 * 1024 });
      const w = rawBytes.readUInt32LE(0);
      const h = rawBytes.readUInt32LE(4);
      decoded = { width: w, height: h, data: new Uint8Array(rawBytes.buffer, rawBytes.byteOffset + 8, w * h * 4) };
    } catch (e) {
      continue;
    }
    
    // Run MobileNet
    const targetW = 224, targetH = 224;
    const floatData = new Float32Array(3 * targetW * targetH);
    const numPixels = targetW * targetH;
    const { width: srcW, height: srcH, data: srcData } = decoded;
    const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
    for (let y = 0; y < targetH; y++) {
      const srcY = Math.floor((y / targetH) * srcH);
      for (let x = 0; x < targetW; x++) {
        const srcX = Math.floor((x / targetW) * srcW);
        const srcIdx = (srcY * srcW + srcX) * 4;
        const targetIdx = y * targetW + x;
        for (let c = 0; c < 3; c++) {
          floatData[c * numPixels + targetIdx] = ((srcData[srcIdx + c] / 255.0) - mean[c]) / std[c];
        }
      }
    }
    const tensor = new ort.Tensor('float32', floatData, [1, 3, targetH, targetW]);
    const results = await clsSession.run({ [clsSession.inputNames[0]]: tensor });
    const outData = results[clsSession.outputNames[0]].data;
    
    let max = -Infinity;
    for (let i = 0; i < outData.length; i++) if (outData[i] > max) max = outData[i];
    let sum = 0;
    const exp = new Float32Array(outData.length);
    for (let i = 0; i < outData.length; i++) { exp[i] = Math.exp(outData[i] - max); sum += exp[i]; }
    for (let i = 0; i < outData.length; i++) exp[i] /= sum;
    
    const indexed = Array.from(exp).map((p, i) => ({ i, p })).sort((a, b) => b.p - a.p);
    const top = indexed[0];
    const top5 = indexed.slice(0, 5);
    
    // Check YOLO raw max
    const r = Math.min(640 / srcW, 640 / srcH);
    const newW = Math.round(srcW * r), newH = Math.round(srcH * r);
    const padX = Math.floor((640 - newW) / 2), padY = Math.floor((640 - newH) / 2);
    const yoloData = new Float32Array(3 * 640 * 640);
    yoloData.fill(114 / 255.0);
    for (let y = 0; y < newH; y++) {
      const srcY = Math.floor((y / newH) * srcH);
      for (let x = 0; x < newW; x++) {
        const srcX = Math.floor((x / newW) * srcW);
        const srcIdx = (srcY * srcW + srcX) * 4;
        const targetIdx = (padY + y) * 640 + (padX + x);
        for (let c = 0; c < 3; c++) {
          yoloData[c * 640 * 640 + targetIdx] = srcData[srcIdx + c] / 255.0;
        }
      }
    }
    const yoloTensor = new ort.Tensor('float32', yoloData, [1, 3, 640, 640]);
    const yoloResults = await yoloSession.run({ [yoloSession.inputNames[0]]: yoloTensor });
    const yOut = yoloResults[yoloSession.outputNames[0]].data;
    
    let maxC0 = 0, maxC1 = 0, maxC2 = 0;
    for (let a = 0; a < 8400; a++) {
      if (yOut[0 * 8400 + a] > maxC0) maxC0 = yOut[4 * 8400 + a];
      if (yOut[1 * 8400 + a] > maxC1) maxC1 = yOut[5 * 8400 + a];
      if (yOut[2 * 8400 + a] > maxC2) maxC2 = yOut[6 * 8400 + a];
    }
    
    console.log(f.padEnd(35) + ' | Top: ' + top.i + ' (' + top.p.toFixed(3) + ') | Top5: ' + top5.map(t => t.i + ':' + t.p.toFixed(2)).join(' ') + ' | YOLO: C0=' + maxC0.toFixed(4) + ' C1=' + maxC1.toFixed(4) + ' C2=' + maxC2.toFixed(4));
  }
}
testAll();
