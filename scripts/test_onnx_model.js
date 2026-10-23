const fs = require('fs');
const jpeg = require('jpeg-js');
const ort = require('onnxruntime-node');
const { execFileSync } = require('child_process');
const path = require('path');

const classesData = JSON.parse(fs.readFileSync('assets/models/vision_classes.json', 'utf8'));
const CLASSES = classesData.classes;

function decodeImage(filePath) {
  const buf = fs.readFileSync(filePath);
  try {
    const raw = jpeg.decode(buf, { useTArray: true, tolerant: true });
    return { width: raw.width, height: raw.height, data: raw.data };
  } catch (e) {
    const pyScript = path.join(__dirname, 'decode_image.py');
    const rawBytes = execFileSync('python', [pyScript], { input: buf, maxBuffer: 50 * 1024 * 1024 });
    const w = rawBytes.readUInt32LE(0);
    const h = rawBytes.readUInt32LE(4);
    return {
      width: w,
      height: h,
      data: new Uint8Array(rawBytes.buffer, rawBytes.byteOffset + 8, w * h * 4),
    };
  }
}

function preprocess(decoded) {
  const targetW = 224, targetH = 224;
  const floatData = new Float32Array(3 * targetW * targetH);
  const numPixels = targetW * targetH;
  const { width: srcW, height: srcH, data: srcData } = decoded;

  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];

  for (let y = 0; y < targetH; y++) {
    const srcY = Math.floor((y / targetH) * srcH);
    for (let x = 0; x < targetW; x++) {
      const srcX = Math.floor((x / targetW) * srcW);
      const srcIdx = (srcY * srcW + srcX) * 4;
      const targetIdx = y * targetW + x;

      for (let c = 0; c < 3; c++) {
        const val = srcData[srcIdx + c] / 255.0;
        floatData[c * numPixels + targetIdx] = (val - mean[c]) / std[c];
      }
    }
  }
  return new ort.Tensor('float32', floatData, [1, 3, targetH, targetW]);
}

function softmax(arr) {
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
  let sum = 0;
  const exp = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    exp[i] = Math.exp(arr[i] - max);
    sum += exp[i];
  }
  for (let i = 0; i < arr.length; i++) exp[i] /= sum;
  return exp;
}

async function run() {
  const session = await ort.InferenceSession.create('assets/models/civiceye_vision_model.onnx');
  
  const testImages = [
    { label: 'Pothole', path: 'AI/test_images/pothole/damaged-asphalt-road-with-potholes-filled-with-water-at-sunset-photo.jpg' },
    { label: 'Pothole (another)', path: 'AI/test_images/pothole/360_F_201419293_4CQG3pEVyRltQzy7ImZMJvWntCsMS4TM.jpg' },
    { label: 'Alligator Cracking', path: 'AI/test_images/alligator_cracking/a4.jpg' },
    { label: 'Alligator Cracking (a2)', path: 'AI/test_images/alligator_cracking/a2.jpg' },
    { label: 'Cracking (longitudinal)', path: 'AI/test_images/cracking/360_F_64744739_r0UHCNGo1FCeosorpBykzott8bttMdl3.jpg' },
    { label: 'Cracking (surface)', path: 'AI/test_images/cracking/photo-1688315137965-5a5835540558.jpg' },
    { label: 'Clean Road', path: 'AI/test_images/valid_road_no_issue/images.jpg' },
    { label: 'Flower', path: 'AI/test_images/flowers_plants/close-up-full-bloom-flower_23-2151921043.jpg' },
    { label: 'Animal/Pet', path: 'AI/test_images/animals/240_F_571076076_S98Bu0ydnKNFgRWWuFQmtEUdH29zk1nE.jpg' },
    { label: 'Manhole', path: 'AI/test_images/manhole_defect/102921203.jpg' },
    { label: 'Waterlogging', path: 'AI/test_images/waterlogging/gettyimages-1498472385-640x640.jpg' },
    { label: 'Divider Damage', path: 'AI/test_images/road_divider_damage/images (1).jpg' },
    { label: 'Damaged Sign', path: 'AI/test_images/damaged_traffic_sign/damaged-broken-traffic-signs-bus-direction-arrow-pedestrian-crossing-road-laying-ground-urban-street-216144364.jpg' },
    { label: 'Damaged Footpath', path: 'AI/test_images/damaged_footpath/2015_1$largeimg24_Jan_2015_001716407.jpg' },
    { label: 'Debris / Blockage', path: 'AI/test_images/debris_road_blockage/55107439.jpg' }
  ];

  for (const item of testImages) {
    if (!fs.existsSync(item.path)) {
      console.log(`[SKIP] Missing: ${item.path}`);
      continue;
    }
    const decoded = decodeImage(item.path);
    const tensor = preprocess(decoded);
    const results = await session.run({ input: tensor });
    const probs = softmax(results.logits.data);
    
    let maxIdx = 0;
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > probs[maxIdx]) maxIdx = i;
    }
    
    const predClass = CLASSES[maxIdx];
    const conf = Math.round(probs[maxIdx] * 100);
    console.log(`Expected: [${item.label.padEnd(23)}] -> Predicted: [${predClass.padEnd(20)}] Conf: ${conf}%`);
  }
}

run();
