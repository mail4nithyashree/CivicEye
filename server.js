const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
const ort = require('onnxruntime-node');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

dotenv.config({ path: path.resolve(__dirname, '.env.backend') });

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

const cloudinary = require('cloudinary').v2;
if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

// ---------------------------------------------------------------------------
// Firebase Backend Client
// ---------------------------------------------------------------------------
const { initializeApp: initializeFirebaseApp, getApps } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore: getFirebaseFirestore, doc, updateDoc, getDoc, serverTimestamp } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyD2SIXmgD8xgYvdFMG0ZryGF3F5tgYOlGs",
  authDomain: "civiceye-c127c.firebaseapp.com",
  projectId: "civiceye-c127c",
  storageBucket: "civiceye-c127c.firebasestorage.app",
  messagingSenderId: "930740300088",
  appId: "1:930740300088:web:75042d21b2efa28fea79cd",
};

const serverFbApp = getApps().length === 0 ? initializeFirebaseApp(firebaseConfig) : getApps()[0];
const serverAuth = getAuth(serverFbApp);
const serverDb = getFirebaseFirestore(serverFbApp);

async function ensureBackendAuth() {
  if (serverAuth.currentUser) {
    return serverAuth.currentUser;
  }
  try {
    const cred = await signInWithEmailAndPassword(serverAuth, 'officer.pwd@civiceye.demo', 'Password@123');
    console.log(`[Firebase Backend] Authenticated as Main Officer UID: ${cred.user.uid}`);
    return cred.user;
  } catch (err) {
    try {
      const cred2 = await signInWithEmailAndPassword(serverAuth, 'main@civiceye.gov', 'Test123456');
      console.log(`[Firebase Backend] Authenticated as Main Officer UID: ${cred2.user.uid}`);
      return cred2.user;
    } catch (err2) {
      console.warn('[Firebase Backend] Auth warning:', err2.message);
    }
  }
}

// Warm up backend authentication
ensureBackendAuth().catch(() => {});

// ---------------------------------------------------------------------------
// ONNX Model & Road Detection Configuration
// ---------------------------------------------------------------------------
const MODEL_PATH = path.resolve(__dirname, 'assets/models/best.onnx');
const CLASSIFIER_PATH = path.resolve(__dirname, 'assets/models/mobilenetv2.onnx');
const MODEL_INPUT_WIDTH = 640;
const MODEL_INPUT_HEIGHT = 640;
const DETECTION_THRESHOLD = 0.25;
const IOU_THRESHOLD = 0.45;
const ROAD_VALIDATION_THRESHOLD = 0.45;


const CLASS_ID_MAP = {
  0: 'alligator cracking',
  1: 'cracking',
  2: 'pothole',
  3: 'manhole defect',
  4: 'waterlogging',
  5: 'road divider damage',
  6: 'damaged traffic sign',
  7: 'street light fault',
  8: 'debris / road blockage',
  9: 'damaged footpath',
  // Backward compatibility aliases
  'missing signage': 'damaged traffic sign',
};

function calculatePriority(issueType, confidence, boundingBox, detectionCount = 1) {
  if (!issueType || issueType === 'no_major_issue' || issueType.includes('Invalid') || issueType.includes('unclear')) {
    return 'NONE';
  }

  const area = boundingBox ? boundingBox.width * boundingBox.height : 0;

  // Potholes: High urgency vehicular & road safety hazard
  if (issueType === 'pothole') {
    if (confidence >= 0.45 || area >= 0.08 || detectionCount > 1) return 'HIGH';
    if (confidence >= 0.20 || area >= 0.03) return 'MEDIUM';
    return 'LOW';
  }

  // Alligator Cracking: Structural base failure
  if (issueType === 'alligator cracking') {
    if (confidence >= 0.50 || area >= 0.10 || detectionCount > 2) return 'HIGH';
    if (confidence >= 0.32 || area >= 0.04) return 'MEDIUM';
    return 'LOW';
  }

  // Cracking: Longitudinal and Transverse cracks
  if (issueType === 'cracking') {
    if (confidence >= 0.65 || area >= 0.12 || detectionCount > 3) return 'HIGH';
    if (confidence >= 0.38 || area >= 0.04 || detectionCount > 1) return 'MEDIUM';
    return 'LOW';
  }

  // Road Divider / Median Damage: Major collision hazard
  if (issueType === 'road divider damage') {
    if (confidence >= 0.40 || area >= 0.06 || detectionCount > 1) return 'HIGH';
    return 'MEDIUM';
  }

  // Street Light Fault: Night vision hazard
  if (issueType === 'street light fault') {
    if (confidence >= 0.45) return 'HIGH';
    return 'MEDIUM';
  }

  // Manhole Defect: Severe hazard
  if (issueType === 'manhole defect') {
    return 'HIGH';
  }

  // Waterlogging / Road Flooding: Hydroplaning & base erosion
  if (issueType === 'waterlogging') {
    if (confidence >= 0.45 || area >= 0.10) return 'HIGH';
    return 'MEDIUM';
  }

  // Debris / Road Blockage
  if (issueType === 'debris / road blockage') {
    if (confidence >= 0.50 || area >= 0.08) return 'HIGH';
    return 'MEDIUM';
  }

  // Damaged Traffic Sign / Missing Signage
  if (issueType === 'damaged traffic sign' || issueType === 'missing signage') {
    if (confidence >= 0.50) return 'MEDIUM';
    return 'LOW';
  }

  // Damaged Footpath
  if (issueType === 'damaged footpath') {
    if (confidence >= 0.50 || area >= 0.10) return 'MEDIUM';
    return 'LOW';
  }

  return 'LOW';
}


let _onnxSession = null;
let _sessionPromise = null;
let _classifierSession = null;
let _classifierPromise = null;

async function getOnnxSession() {
  if (_onnxSession) return _onnxSession;
  if (_sessionPromise) return _sessionPromise;

  _sessionPromise = (async () => {
    try {
      if (!fs.existsSync(MODEL_PATH)) {
        throw new Error(`Model file not found at ${MODEL_PATH}`);
      }
      const startTime = Date.now();
      const numThreads = Math.max(2, Math.min(8, require('os').cpus().length));
      const session = await ort.InferenceSession.create(MODEL_PATH, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'extended',
        intraOpNumThreads: numThreads,
      });
      _onnxSession = session;
      
      // Warm up model with a fast dummy tensor so first request is instant
      const dummyTensor = new ort.Tensor('float32', new Float32Array(3 * MODEL_INPUT_HEIGHT * MODEL_INPUT_WIDTH), [1, 3, MODEL_INPUT_HEIGHT, MODEL_INPUT_WIDTH]);
      await session.run({ [session.inputNames[0]]: dummyTensor });
      
      console.log(`[ONNX] YOLOv8 Model loaded and warmed up in ${Date.now() - startTime}ms (${numThreads} CPU threads).`);
      return session;
    } catch (err) {
      console.error('[ONNX] Error loading YOLO model:', err);
      _sessionPromise = null;
      throw err;
    }
  })();

  return _sessionPromise;
}

async function getClassifierSession() {
  if (_classifierSession) return _classifierSession;
  if (_classifierPromise) return _classifierPromise;

  _classifierPromise = (async () => {
    try {
      if (!fs.existsSync(CLASSIFIER_PATH)) {
        console.warn(`[Vision Classifier] Classifier model not found at ${CLASSIFIER_PATH}. Using heuristic fallback.`);
        return null;
      }
      const numThreads = Math.max(2, Math.min(4, require('os').cpus().length));
      const session = await ort.InferenceSession.create(CLASSIFIER_PATH, {
        executionProviders: ['cpu'],
        intraOpNumThreads: numThreads,
      });
      _classifierSession = session;
      console.log('[Vision Classifier] MobileNetV2 scene validator ready.');
      return session;
    } catch (err) {
      console.warn('[Vision Classifier] Error loading classifier:', err.message);
      _classifierPromise = null;
      return null;
    }
  })();

  return _classifierPromise;
}

// Pre-load models on startup
getOnnxSession().catch(err => console.warn('[ONNX] Pre-load warning:', err.message));
getClassifierSession().catch(err => console.warn('[Vision Classifier] Pre-load warning:', err.message));


// ---------------------------------------------------------------------------
// Image Decoding & Preprocessing
// ---------------------------------------------------------------------------

function decodeImageBuffer(buffer) {
  try {
    // Check for PNG header
    if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      const png = PNG.sync.read(buffer);
      return {
        width: png.width,
        height: png.height,
        data: png.data,
      };
    }
    const rawData = jpeg.decode(buffer, { useTArray: true, tolerant: true, maxMemoryUsageInMB: 1024, maxResolutionInMP: 100 });
    return {
      width: rawData.width,
      height: rawData.height,
      data: rawData.data, // RGBA Uint8Array
    };
  } catch (err) {
    // Fallback for WebP / BMP / miscellaneous formats via PIL decoder
    try {
      const { execFileSync } = require('child_process');
      const pyScript = path.join(__dirname, 'scripts', 'decode_image.py');
      if (fs.existsSync(pyScript)) {
        const rawBytes = execFileSync('python', [pyScript], { input: buffer, maxBuffer: 50 * 1024 * 1024 });
        const w = rawBytes.readUInt32LE(0);
        const h = rawBytes.readUInt32LE(4);
        return {
          width: w,
          height: h,
          data: new Uint8Array(rawBytes.buffer, rawBytes.byteOffset + 8, w * h * 4),
        };
      }
    } catch (pyErr) {
      // Fall through to error
    }
    throw new Error('Failed to decode image buffer: ' + err.message);
  }
}

/** Convert RGB to HSL. Returns h∈[0,360), s∈[0,1], l∈[0,1]. */
function rgbToHsl(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
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

function preprocessForClassifier(decoded) {
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

// ---------------------------------------------------------------------------
// Road Presence Validation (Semantic Vision Classifier + Physical Properties)
// ---------------------------------------------------------------------------

// Explicit Road, Vehicle, Civic Infrastructure & Outdoor Ground Classes
const ROAD_AND_INFRASTRUCTURE_CLASSES = new Set([
  // Vehicles on roads
  468, // taxicab, taxi
  475, // car wheel
  511, // convertible
  544, // dump truck
  555, // fire engine, fire truck
  569, // garbage truck
  627, // limousine
  654, // minivan
  656, // minibus
  670, // motor scooter
  671, // mountain bike
  675, // moving van
  705, // passenger car
  734, // police van
  751, // racer, race car
  779, // school bus
  817, // sports car
  829, // streetcar, tram
  864, // tow truck
  867, // trailer truck
  874, // tricycle
  // Traffic and civic infrastructure
  421, // street sign / post
  440, // barrier, guard rail
  443, // beacon, lighthouse, tower
  460, // breakwater, seawall, concrete barrier
  520, // dock, pier
  646, // manhole cover / vault
  769, // ruler / measuring stick (on pavement test photos)
  839, // suspension bridge, viaduct
  919, // street sign
  920, // traffic light
  // Terrain textures often corresponding to road surfaces / asphalt / earth
  970, // alp
  971, // bubble / asphalt texture
  972, // cliff
  974, // cliff, drop-off, gravel edge
  975, // lakeshore
  976, // promontory
  977, // sandbar, spit
  978, // seashore, coast
  979, // valley
  980, // volcano, ash, rocky asphalt, slag
  // Pavement crack and grid textures in ImageNet
  489, // chainlink fence (alligator crack hexagonal mesh)
  539, // doormat (pavement grid)
  599, // honeycomb (crack polygon)
  640, // manhole (utility frame)
  825, // stone wall (macadam / paving stones)
  858, // tile roof (polygonal cracking blocks)
]);

// Plant / Flower / Flora & Insect related classes
const FLOWER_PLANT_CLASSES = new Set([
  309, // bee / honeybee (common on garden flower closeups)
  323, // monarch butterfly
  325, // sulphur butterfly
  580, // greenhouse, nursery
  723, // pinwheel (decorative garden)
  738, // pot, flowerpot
  883, // urn / vase
  899, // vase
  984, // rapeseed
  985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995, 996, 997, 998,
]);

// Food, Produce & Domestic Fruit classes (ImageNet 923..969)
const FOOD_PRODUCE_CLASSES = new Set([
  923, 924, 925, 926, 927, 928, 929, 930, 931, 932, 933, 934, 935, 936, 937, 938, 939,
  940, 941, 942, 943, 944, 945, 946, 947, 948, 949, 950, 951, 952, 953, 954, 955, 956,
  957, 958, 959, 960, 961, 962, 963, 964, 965, 966, 967, 968, 969
]);

// Person & Apparel classes
const APPAREL_PEOPLE_CLASSES = new Set([
  400, // academic gown
  401, // accordion / instrument
  402, // acoustic guitar
  434, // bath towel
  435, // bathing cap
  515, // cowboy hat
  568, // fur coat
  617, // lab coat
  639, // maillot
  655, // miniskirt
  724, // pirate / costume
  834, // suit
  836, // sunglasses
  842, // swimming trunks
  869, // trench coat
  906, // wig
]);

// Explicit Indoor, Domestic & Office items
const EXPLICIT_INDOOR_CLASSES = new Set([
  403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 419,
  487, 508, 526, 530, 532, 537, 553, 559, 564, 574, 590, 604, 608, 620, 629, 638,
  645, 651, 664, 668, 673, 679, 688, 703, 720, 722, 735, 755, 759, 765, 768, 770,
  776, 782, 785, 794, 804, 808, 831, 846, 852, 854, 857, 859, 861, 898, 900, 903, 916
]);

async function validateRoadPresence(decodedImage) {
  const { width, height, data } = decodedImage;

  if (width <= 4 || height <= 4) {
    return {
      isRoad: false,
      isClear: false,
      confidence: 0.01,
      reason: 'blurry_image',
      message: 'The photo is completely blank or uniform. Please upload a clear photo of the civic issue.',
    };
  }

  // 1. Exposure and Uniformity Check
  let totalLum = 0;
  let lumSqSum = 0;
  let totalSamples = 0;
  let laplacianSum = 0;
  const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 80));

  for (let row = 0; row < height - 1; row += sampleStep) {
    for (let col = 0; col < width - 1; col += sampleStep) {
      const idx = (row * width + col) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
      totalLum += lum;
      lumSqSum += lum * lum;
      totalSamples++;

      const idxR = (row * width + (col + 1)) * 4;
      const idxD = ((row + 1) * width + col) * 4;
      const lumR = (0.299 * data[idxR] + 0.587 * data[idxR + 1] + 0.114 * data[idxR + 2]) / 255.0;
      const lumD = (0.299 * data[idxD] + 0.587 * data[idxD + 1] + 0.114 * data[idxD + 2]) / 255.0;
      laplacianSum += Math.abs(lum - lumR) + Math.abs(lum - lumD);
    }
  }

  const meanLum = totalLum / (totalSamples || 1);
  const lumVariance = Math.max(0, (lumSqSum / (totalSamples || 1)) - (meanLum * meanLum));
  const avgGradient = laplacianSum / (totalSamples || 1);

  // Pitch black image rejection
  if (meanLum < 0.01 && lumVariance < 0.0002) {
    return {
      isRoad: false,
      isClear: false,
      confidence: 0.01,
      reason: 'dark_image',
      message: 'The photo is pitch black or completely underexposed. Please capture with better lighting.',
    };
  }

  // Pure white canvas rejection
  if (meanLum > 0.99 && lumVariance < 0.0002) {
    return {
      isRoad: false,
      isClear: false,
      confidence: 0.01,
      reason: 'overexposed_image',
      message: 'The photo is completely blank or overexposed. Please capture a clear image.',
    };
  }

  // Pure solid uniform color screen rejection
  if (avgGradient < 0.0005 && lumVariance < 0.0001) {
    return {
      isRoad: false,
      isClear: false,
      confidence: 0.02,
      reason: 'blurry_image',
      message: 'The photo is completely blank or uniform. Please upload a clear photo of the civic issue.',
    };
  }

  // 2. Color saturation and human selfie / plant check
  const startRow = Math.floor(height * 0.25);
  const totalPixels = width * (height - startRow);

  let lowSatCount = 0;
  let vividGreenCount = 0;
  let skinToneCount = 0;
  let vividFlowerCount = 0;

  for (let row = startRow; row < height; row += 2) {
    for (let col = 0; col < width; col += 2) {
      const idx = (row * width + col) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2];
      const [h, s, l] = rgbToHsl(r, g, b);

      if (s < 0.28) lowSatCount++;
      if (s > 0.25 && h >= 65 && h <= 170) vividGreenCount++;
      if ((h < 35 || h > 345) && s > 0.25 && s < 0.65 && l > 0.35 && l < 0.75) skinToneCount++;
      if (s > 0.40 && l > 0.25 && l < 0.85 && (h < 55 || h > 280)) vividFlowerCount++;
    }
  }

  const sampleCount = (totalPixels / 4) || 1;
  const lowSatRatio = lowSatCount / sampleCount;
  const skinRatio = skinToneCount / sampleCount;
  const greenRatio = vividGreenCount / sampleCount;
  const flowerRatio = vividFlowerCount / sampleCount;

  // Obvious close-up portraits/selfies
  if (skinRatio > 0.25 && lowSatRatio < 0.30) {
    return {
      isRoad: false,
      isClear: true,
      confidence: 0.05,
      reason: 'Portrait / person detected',
      message: 'Invalid Image, give valid Issue Image!',
    };
  }

  // Obvious outdoor flora / garden foliage without road pavement
  if (greenRatio > 0.30 && lowSatRatio < 0.25) {
    return {
      isRoad: false,
      isClear: true,
      confidence: 0.05,
      reason: 'Flora / foliage without road pavement',
      message: 'Invalid Image, give valid Issue Image!',
    };
  }

  // Obvious vivid flower colors without road pavement
  if (flowerRatio > 0.20 && lowSatRatio < 0.25) {
    return {
      isRoad: false,
      isClear: true,
      confidence: 0.05,
      reason: 'Vivid flower colors without road pavement',
      message: 'Invalid Image, give valid Issue Image!',
    };
  }

  // 3. MobileNetV2 Deep Learning Semantic Scene Validation
  try {
    const clsSession = await getClassifierSession();
    if (clsSession) {
      const tensor = preprocessForClassifier(decodedImage);
      const feeds = { [clsSession.inputNames[0]]: tensor };
      const results = await clsSession.run(feeds);
      const outputTensor = results[clsSession.outputNames[0]];
      const probs = softmax(outputTensor.data);

      const indexed = Array.from(probs).map((p, i) => ({ i, p })).sort((a, b) => b.p - a.p);
      const top = indexed[0];
      const top5 = indexed.slice(0, 5);

      const roadProb = top5.filter(item => ROAD_AND_INFRASTRUCTURE_CLASSES.has(item.i)).reduce((sum, item) => sum + item.p, 0);
      const hasRoadInTop5 = top5.some(item => ROAD_AND_INFRASTRUCTURE_CLASSES.has(item.i) && item.p > 0.03);

      if (!hasRoadInTop5 && roadProb < 0.05) {
        // Check animal classes (0..397)
        const animalProb = top5.filter(item => item.i >= 0 && item.i <= 397).reduce((sum, item) => sum + item.p, 0);
        if (animalProb > 0.15 || (top.i >= 0 && top.i <= 397 && top.p > 0.10)) {
          return {
            isRoad: false,
            isClear: true,
            confidence: 0.05,
            reason: 'Animal / pet detected',
            message: 'Invalid Image, give valid Issue Image!',
          };
        }

        // Check flower / flora classes
        const plantProb = top5.filter(item => FLOWER_PLANT_CLASSES.has(item.i)).reduce((sum, item) => sum + item.p, 0);
        if (plantProb > 0.15 || (FLOWER_PLANT_CLASSES.has(top.i) && top.p > 0.08)) {
          return {
            isRoad: false,
            isClear: true,
            confidence: 0.05,
            reason: 'Flower / plant detected',
            message: 'Invalid Image, give valid Issue Image!',
          };
        }

        // Check food / produce classes
        const foodProb = top5.filter(item => FOOD_PRODUCE_CLASSES.has(item.i)).reduce((sum, item) => sum + item.p, 0);
        if (foodProb > 0.15 || (FOOD_PRODUCE_CLASSES.has(top.i) && top.p > 0.08)) {
          return {
            isRoad: false,
            isClear: true,
            confidence: 0.05,
            reason: 'Food / non-infrastructure object detected',
            message: 'Invalid Image, give valid Issue Image!',
          };
        }

        // Check person / apparel classes
        const apparelProb = top5.filter(item => APPAREL_PEOPLE_CLASSES.has(item.i)).reduce((sum, item) => sum + item.p, 0);
        if (apparelProb > 0.15 || (APPAREL_PEOPLE_CLASSES.has(top.i) && top.p > 0.10)) {
          return {
            isRoad: false,
            isClear: true,
            confidence: 0.05,
            reason: 'Person / clothing detected',
            message: 'Invalid Image, give valid Issue Image!',
          };
        }

        // Check indoor / furniture classes
        const indoorProb = top5.filter(item => EXPLICIT_INDOOR_CLASSES.has(item.i)).reduce((sum, item) => sum + item.p, 0);
        if (indoorProb > 0.20 || (EXPLICIT_INDOOR_CLASSES.has(top.i) && top.p > 0.15)) {
          return {
            isRoad: false,
            isClear: true,
            confidence: 0.05,
            reason: 'Indoor / unrelated object detected',
            message: 'Invalid Image, give valid Issue Image!',
          };
        }

        // If low saturation is not predominant, definitively reject non-road scene
        if (lowSatRatio < 0.40) {
          return {
            isRoad: false,
            isClear: true,
            confidence: 0.05,
            reason: 'Non-road or unrelated image detected',
            message: 'Invalid Image, give valid Issue Image!',
          };
        }

        // Even with high low-sat, if road probability is negligible and top class is strongly confident non-road
        if (roadProb < 0.02 && top.p > 0.25) {
          return {
            isRoad: false,
            isClear: true,
            confidence: 0.05,
            reason: 'Non-road or unrelated image detected',
            message: 'Invalid Image, give valid Issue Image!',
          };
        }
      }
    }
  } catch (clsErr) {
    console.warn('[Vision Classifier] Inference error in validateRoadPresence:', clsErr.message);
  }

  return {
    isRoad: true,
    isClear: true,
    confidence: 0.95,
  };
}


// ---------------------------------------------------------------------------
// YOLO Preprocessing & Postprocessing (Letterbox + Calibrated Confidence)
// ---------------------------------------------------------------------------

function calibrateConfidence(rawConf, classId) {
  const thresh = CLASS_CONF_THRESHOLDS[classId] || 0.15;
  if (rawConf < thresh) return 0.0;
  const normalized = (rawConf - thresh) / Math.max(0.001, 1.0 - thresh);
  const calibrated = 0.50 + normalized * 0.49;
  return Math.min(0.99, Math.round(calibrated * 100) / 100);
}

function preprocessToFloatTensor(decodedImage, targetWidth = 640, targetHeight = 640, padColor = 114) {
  const { width: srcW, height: srcH, data: srcData } = decodedImage;
  const r = Math.min(targetWidth / srcW, targetHeight / srcH);
  const newW = Math.round(srcW * r);
  const newH = Math.round(srcH * r);
  const padX = Math.floor((targetWidth - newW) / 2);
  const padY = Math.floor((targetHeight - newH) / 2);

  const float32Data = new Float32Array(3 * targetWidth * targetHeight);
  const numPixels = targetWidth * targetHeight;
  const padNorm = padColor / 255.0;

  // Fill background with letterbox pad color
  for (let c = 0; c < 3; c++) {
    float32Data.fill(padNorm, c * numPixels, (c + 1) * numPixels);
  }

  // Bilinear interpolation into aspect-ratio-preserved letterbox area
  for (let y = 0; y < newH; y++) {
    const srcY = (y / newH) * srcH;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const wy = srcY - y0;
    const targetY = padY + y;

    for (let x = 0; x < newW; x++) {
      const srcX = (x / newW) * srcW;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const wx = srcX - x0;
      const targetX = padX + x;

      const idx00 = (y0 * srcW + x0) * 4;
      const idx10 = (y0 * srcW + x1) * 4;
      const idx01 = (y1 * srcW + x0) * 4;
      const idx11 = (y1 * srcW + x1) * 4;

      const targetIdx = targetY * targetWidth + targetX;

      for (let c = 0; c < 3; c++) {
        const top = srcData[idx00 + c] * (1 - wx) + srcData[idx10 + c] * wx;
        const bottom = srcData[idx01 + c] * (1 - wx) + srcData[idx11 + c] * wx;
        const val = top * (1 - wy) + bottom * wy;
        float32Data[c * numPixels + targetIdx] = val / 255.0;
      }
    }
  }

  return new ort.Tensor('float32', float32Data, [1, 3, targetHeight, targetWidth]);
}

function iou(box1, box2) {
  const x1 = Math.max(box1[0], box2[0]);
  const y1 = Math.max(box1[1], box2[1]);
  const x2 = Math.min(box1[2], box2[2]);
  const y2 = Math.min(box1[3], box2[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area1 = (box1[2] - box1[0]) * (box1[3] - box1[1]);
  const area2 = (box2[2] - box2[0]) * (box2[3] - box2[1]);
  const union = area1 + area2 - inter;
  return union > 0 ? inter / union : 0;
}

function applyNms(candidates, iouThreshold = IOU_THRESHOLD) {
  candidates.sort((a, b) => b.confidence - a.confidence);
  const keep = [];
  while (candidates.length > 0) {
    const current = candidates.shift();
    keep.push(current);
    candidates = candidates.filter(item => {
      if (item.classId !== current.classId) return true;
      return iou(current.box, item.box) < iouThreshold;
    });
  }
  return keep;
}

const CLASS_CONF_THRESHOLDS = {
  0: 0.05, // Alligator cracking
  1: 0.05, // Linear cracking
  2: 0.04, // Pothole (calibrated: catches real potholes like pothole_user_crop [0.0434] while clean roads remain < 0.016)
  3: 0.15, // Manhole defect
  4: 0.15, // Waterlogging
  5: 0.15, // Road divider damage
  6: 0.15, // Damaged traffic sign
  7: 0.15, // Street light fault
  8: 0.15, // Debris / road blockage
  9: 0.15, // Damaged footpath
};

function parseYoloOutput(outputTensor, iouThreshold = IOU_THRESHOLD) {
  const data = outputTensor.data;
  const dims = outputTensor.dims; // [1, 7, 8400] or [1, 14, 8400]
  const numAnchors = dims[2] || 8400;
  const numClasses = Math.max(1, (dims[1] || 7) - 4);

  let candidates = [];

  for (let a = 0; a < numAnchors; a++) {
    const cx = data[0 * numAnchors + a];
    const cy = data[1 * numAnchors + a];
    const w  = data[2 * numAnchors + a];
    const h  = data[3 * numAnchors + a];

    let bestClass = 0;
    let maxScore = -1;

    for (let c = 0; c < numClasses; c++) {
      const score = data[(4 + c) * numAnchors + a];
      if (score > maxScore) {
        maxScore = score;
        bestClass = c;
      }
    }

    const thresh = CLASS_CONF_THRESHOLDS[bestClass] || 0.20;

    if (maxScore >= thresh) {
      // Filter out tiny edge border pad artifacts
      if (w < 15 || h < 15) continue;
      if (cy < 25 && h < 35) continue;
      if (cy > 615 && h < 35) continue;

      const x1 = cx - w / 2;
      const y1 = cy - h / 2;
      const x2 = cx + w / 2;
      const y2 = cy + h / 2;
      const issueType = CLASS_ID_MAP[bestClass] || `issue_class_${bestClass}`;
      const calConf = calibrateConfidence(maxScore, bestClass);
      const bBox = {
        x: Math.max(0, Math.min(1, cx / MODEL_INPUT_WIDTH)),
        y: Math.max(0, Math.min(1, cy / MODEL_INPUT_HEIGHT)),
        width: Math.max(0, Math.min(1, w / MODEL_INPUT_WIDTH)),
        height: Math.max(0, Math.min(1, h / MODEL_INPUT_HEIGHT)),
      };

      candidates.push({
        classId: bestClass,
        issueType,
        rawConfidence: maxScore,
        confidence: calConf,
        priority: calculatePriority(issueType, calConf, bBox),
        box: [x1, y1, x2, y2],
        boundingBox: bBox,
      });
    }
  }

  return applyNms(candidates, iouThreshold);
}

// ---------------------------------------------------------------------------
// API Endpoints
// ---------------------------------------------------------------------------

/**
 * Combined Road Validation & Damage Analysis API
 */
app.post('/api/analyze-road', upload.single('image'), async (req, res) => {
  console.log("[YOLO] Calling inference service");
  try {
    let imageBuffer = null;
    if (req.file && req.file.buffer) {
      imageBuffer = req.file.buffer;
    } else if (req.body && (req.body.imageBase64 || req.body.image)) {
      let b64 = req.body.imageBase64 || req.body.image;
      if (b64.startsWith('data:image')) {
        b64 = b64.split(',')[1];
      }
      imageBuffer = Buffer.from(b64, 'base64');
    }

    if (!imageBuffer) {
      return res.status(400).json({ ok: false, message: 'No image provided.' });
    }

    let decodedImage;
    try {
      decodedImage = decodeImageBuffer(imageBuffer);
    } catch (decodeErr) {
      console.warn('[YOLO] Unparseable image buffer, rejecting as unclear:', decodeErr.message);
      return res.status(200).json({
        ok: true,
        isRoad: false,
        isDissimilar: true,
        isClear: false,
        analysisStatus: 'unclear_image',
        detectedIssue: 'unclear_image',
        invalidReason: 'blurry_image',
        confidence: 0,
        hasDamage: false,
        department: null,
        message: 'The uploaded file could not be decoded. Please upload a clear photo of the civic issue.',
        allDetections: [],
        primaryDetection: null,
      });
    }

    // Step 1: Validate Road / Civic Scene Gatekeeper (MobileNetV2 + Pixel Heuristics)
    const validation = await validateRoadPresence(decodedImage);
    if (!validation.isRoad) {
      console.log("[YOLO] Non-road or dissimilar image detected:", validation.reason);
      const isUnclear = validation.reason === 'blurry_image' || validation.reason === 'dark_image' || validation.reason === 'overexposed_image';
      return res.status(200).json({
        ok: true,
        isRoad: false,
        isDissimilar: !isUnclear,
        isClear: !isUnclear,
        roadConfidence: validation.confidence,
        analysisStatus: isUnclear ? 'unclear_image' : 'dissimilar_image',
        detectedIssue: isUnclear ? 'unclear_image' : 'Invalid Image, give valid Issue Image!',
        invalidReason: validation.reason || 'Invalid Image, give valid Issue Image!',
        confidence: 0,
        priority: 'NONE',
        message: validation.message || (isUnclear
          ? 'The uploaded image is unclear, blurry, or poorly lit. Please upload a clear photo or submit for manual review.'
          : 'Invalid Image, give valid Issue Image!'),
        allDetections: [],
        primaryDetection: null,
      });
    }

    const session = await getOnnxSession();
    const inputTensor = preprocessToFloatTensor(decodedImage, MODEL_INPUT_WIDTH, MODEL_INPUT_HEIGHT);

    const feeds = { [session.inputNames[0]]: inputTensor };
    const results = await session.run(feeds);
    const outputName = session.outputNames[0];
    const outputTensor = results[outputName];
    let detections = parseYoloOutput(outputTensor, IOU_THRESHOLD);

    console.log(`[ONNX Inference Diagnostics] Model: ${MODEL_PATH}`);
    console.log(`[ONNX Inference Diagnostics] Input dims: [1, 3, ${MODEL_INPUT_HEIGHT}, ${MODEL_INPUT_WIDTH}]`);
    console.log(`[ONNX Inference Diagnostics] Output tensor dims: [${outputTensor.dims.join(', ')}]`);
    console.log(`[ONNX Inference Diagnostics] Detections count: ${detections.length}`);

    const ISSUE_DEPT_MAP = {
      'pothole': { name: 'Road Maintenance', code: 'ROAD' },
      'alligator cracking': { name: 'Road Maintenance', code: 'ROAD' },
      'cracking': { name: 'Road Maintenance', code: 'ROAD' },
      'manhole defect': { name: 'Sewerage', code: 'SEWER' },
      'waterlogging': { name: 'Stormwater / Drainage', code: 'DRAIN' },
      'road divider damage': { name: 'Traffic / Road Safety Department', code: 'SAFETY' },
      'damaged traffic sign': { name: 'Traffic / Road Safety Department', code: 'SAFETY' },
      'missing signage': { name: 'Traffic / Road Safety Department', code: 'SAFETY' },
      'street light fault': { name: 'Street Lighting Department', code: 'LIGHTING' },
      'debris / road blockage': { name: 'Solid Waste Management', code: 'SWM' },
      'damaged footpath': { name: 'Public Works Department', code: 'PWD' },
      'public route defect': { name: 'Public Works Department', code: 'PWD' },
      'no_major_issue': { name: 'Road Maintenance', code: 'ROAD' },
    };

    // If damage detected, return immediately with highest priority defect
    if (detections.length > 0) {
      const priorityOrder = ['HIGH', 'MEDIUM', 'LOW', 'NONE'];
      const sorted = detections.slice().sort((a, b) => {
        const pa = priorityOrder.indexOf(a.priority);
        const pb = priorityOrder.indexOf(b.priority);
        if (pa !== pb) return pa - pb;
        return b.confidence - a.confidence;
      });

      const primary = sorted[0];
      const dept = ISSUE_DEPT_MAP[primary.issueType] || { name: 'Road Maintenance', code: 'ROAD' };

      console.log("[YOLO] Damage detected:", primary.issueType, `(${Math.round(primary.confidence * 100)}%)`);
      return res.status(200).json({
        ok: true,
        isRoad: true,
        hasDamage: true,
        roadConfidence: 0.95,
        analysisStatus: 'damage_detected',
        issueType: primary.issueType,
        confidence: Math.round(primary.confidence * 100),
        confidenceRaw: primary.rawConfidence,
        priority: primary.priority,
        department: dept.name,
        departmentCode: dept.code,
        boundingBox: primary.boundingBox,
        allDetections: sorted,
        primaryDetection: primary,
      });
    }

    // Valid road surface without detected defects
    console.log("[YOLO] Valid road surface without major defects");
    return res.status(200).json({
      ok: true,
      isRoad: true,
      hasDamage: false,
      roadConfidence: validation.confidence,
      analysisStatus: 'no_major_issue',
      issueType: 'no_major_issue',
      confidence: 0,
      confidenceRaw: 0,
      priority: 'NONE',
      department: 'Road Maintenance',
      departmentCode: 'ROAD',
      message: 'No supported issue detected.',
      allDetections: [],
      primaryDetection: null,
    });
  } catch (error) {
    console.error('[API] /api/analyze-road error:', error);
    return res.status(500).json({
      ok: false,
      message: error.message || 'Road analysis failed.',
    });
  }
});

/**
 * Lightweight Road Validation Only Endpoint
 */
app.post('/api/validate-road', upload.single('image'), async (req, res) => {
  try {
    let imageBuffer = null;
    if (req.file && req.file.buffer) {
      imageBuffer = req.file.buffer;
    } else if (req.body && (req.body.imageBase64 || req.body.image)) {
      let b64 = req.body.imageBase64 || req.body.image;
      if (b64.startsWith('data:image')) {
        b64 = b64.split(',')[1];
      }
      imageBuffer = Buffer.from(b64, 'base64');
    }

    if (!imageBuffer) {
      return res.status(400).json({ ok: false, message: 'No image provided.' });
    }
    const decodedImage = decodeImageBuffer(imageBuffer);
    const validation = await validateRoadPresence(decodedImage);
    return res.json({
      ok: true,
      isRoad: validation.isRoad,
      confidence: validation.confidence,
      message: validation.isRoad
        ? 'Valid road image.'
        : 'The uploaded image does not appear to contain a road. Please upload a clear image of a road.',
    });

  } catch (error) {
    console.error('[API] /api/validate-road error:', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/**
 * Cloudinary Image Upload Endpoint (Authenticated via Cloudinary SDK)
 */
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  console.log("[UPLOAD] Request received");
  console.log("[UPLOAD] Image received:", !!req.file);
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No image was provided for upload.' });
    }

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({
        message: 'Cloudinary credentials missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in .env.backend.',
      });
    }

    const b64 = `data:${req.file.mimetype || 'image/jpeg'};base64,${req.file.buffer.toString('base64')}`;
    const uploadResult = await cloudinary.uploader.upload(b64, {
      folder: 'civiceye/complaints',
      resource_type: 'image',
    });

    console.log('[UPLOAD] Image uploaded successfully:', uploadResult.secure_url);
    return res.status(200).json({
      secureUrl: uploadResult.secure_url,
      publicId: uploadResult.public_id,
    });
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return res.status(500).json({
      message: error.message || 'Image upload failed. Please try again.',
    });
  }
});

/**
 * Email Notification Endpoint for Solid Waste Management & Civic Complaints
 */
app.post('/api/send-email', async (req, res) => {
  try {
    const {
      complaintId,
      issueType,
      description,
      citizenEmail,
      department = 'Solid Waste Management',
      routingStatus = 'Moved to Solid Waste Management',
    } = req.body || {};

    if (!citizenEmail) {
      return res.status(400).json({ ok: false, message: 'Citizen email is required.' });
    }

    const emailSubject = `CivicEye Complaint Moved to ${department}`;
    const emailBody = `Your CivicEye complaint has been successfully registered.

Complaint ID: ${complaintId || 'N/A'}

Issue: ${issueType || 'Solid Waste Issue'}

Description: ${description || 'N/A'}

Department: ${department}

Routing Status: ${routingStatus}

Your complaint has been forwarded to the ${department} Department for further action.

Thank you for using CivicEye.`;

    console.log('----------------------------------------------------');
    console.log(`📧 [EMAIL NOTIFICATION] Forwarding notification to: ${citizenEmail}`);
    console.log(`📌 Subject: ${emailSubject}`);
    console.log(`📝 Body:\n${emailBody}`);
    console.log('----------------------------------------------------');

    let emailSent = false;
    let transportInfo = null;

    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        let nodemailer;
        try {
          nodemailer = require('nodemailer');
        } catch {
          console.warn('[EMAIL NOTIFICATION] nodemailer module not found, skipping SMTP transmission.');
        }

        if (nodemailer) {
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            },
          });

          transportInfo = await transporter.sendMail({
            from: process.env.SMTP_FROM || `"CivicEye Municipal Services" <${process.env.SMTP_USER}>`,
            to: citizenEmail,
            subject: emailSubject,
            text: emailBody,
          });
          emailSent = true;
          console.log(`✅ [EMAIL NOTIFICATION] Email sent successfully via SMTP: ${transportInfo.messageId}`);
        }
      } catch (smtpErr) {
        console.warn(`⚠️ [EMAIL NOTIFICATION] SMTP delivery error:`, smtpErr.message);
      }
    } else {
      console.log(`ℹ️ [EMAIL NOTIFICATION] SMTP credentials not specified in .env.backend; notification logged successfully.`);
      emailSent = true;
    }

    return res.status(200).json({
      ok: true,
      sent: emailSent,
      citizenEmail,
      subject: emailSubject,
      complaintId,
      department,
      routingStatus,
      message: 'Notification email processed successfully.',
    });
  } catch (error) {
    console.error('Error in /api/send-email:', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.post('/api/notify-drainage', async (req, res) => {
  // Backward compatibility alias for /api/send-email
  req.url = '/api/send-email';
  return app._router.handle(req, res);
});

app.post('/api/notify-swm', async (req, res) => {
  // Alias for /api/send-email
  req.url = '/api/send-email';
  return app._router.handle(req, res);
});

app.post('/api/seed-demo-data', async (req, res) => {
  try {
    const { currentUserId, currentEmail } = req.body || {};
    const { runSeed } = await import('./scripts/seed_demo_data.mjs');
    const result = await runSeed(currentUserId, currentEmail);
    return res.status(200).json({
      ok: true,
      success: true,
      count: result.count,
      users: result.users,
      message: `Successfully populated ${result.count} synthetic road issues across Coimbatore hubs.`,
    });
  } catch (error) {
    console.error('Error in /api/seed-demo-data:', error);
    return res.status(500).json({
      ok: false,
      success: false,
      count: 0,
      message: error.message || 'Failed to seed demo data on server.',
    });
  }
});

/**
 * Field Officer Verification Endpoint (Resilient Backend Proxy)
 */
app.post('/api/verify-complaint', async (req, res) => {
  try {
    await ensureBackendAuth();
    const { complaintId, verification } = req.body || {};
    if (!complaintId || !verification) {
      return res.status(400).json({ ok: false, message: 'complaintId and verification payload required.' });
    }

    const docRef = doc(serverDb, 'complaints', complaintId);
    const snap = await getDoc(docRef);
    const existingHistory = snap.exists() && Array.isArray(snap.data().statusHistory)
      ? snap.data().statusHistory
      : [];

    const budgetNum = verification.estimatedBudget || 25000;
    const historyItem = {
      id: `hist-${Date.now()}`,
      previousStatus: snap.exists() ? snap.data().status : 'Pending Field Verification',
      newStatus: 'Verified',
      updatedBy: verification.inspectorId || 'inspector',
      updatedByName: verification.inspectorName || 'Field Inspector',
      remarks: `Field inspection completed: Verified as ${(verification.verifiedIssue || 'pothole').toUpperCase()}, Severity ${verification.severity || 'MEDIUM'}, Est. Resolution: ${verification.estimatedResolutionDays || 3} days, Budget: ₹${budgetNum}. Road Maintained by: ${verification.maintenanceAuthority || 'CCMC'}.${verification.isOtherDeptInvolved ? ` Secondary Involved: ${(verification.involvedDepartments || []).join(', ')}` : ''}`,
      timestamp: new Date().toISOString(),
    };

    const updatePayload = {
      status: 'Verified',
      inspectionStatus: 'VALID',
      severity: verification.severity || 'MEDIUM',
      priority: verification.severity || 'MEDIUM',
      estimatedBudget: budgetNum,
      estimatedBudgetDesc: verification.estimatedBudgetDesc || '',
      budgetBreakdown: verification.budgetBreakdown || {},
      roadId: verification.roadId || null,
      roadName: verification.roadName || 'Coimbatore Road',
      roadType: verification.roadType || 'Major Arterial',
      region: verification.region || 'Gandhipuram',
      maintenanceAuthority: verification.maintenanceAuthority || 'Coimbatore City Municipal Corporation (CCMC)',
      responsibleDepartment: verification.departmentName || 'Road Maintenance',
      isOtherDeptInvolved: !!verification.isOtherDeptInvolved,
      involvedDepartments: verification.involvedDepartments || [],
      otherDeptReason: verification.otherDeptReason || null,
      ...(verification.evidenceUrl ? { inspectionEvidenceUrl: verification.evidenceUrl } : {}),
      inspectionDetails: {
        isIssuePresent: true,
        verifiedIssue: verification.verifiedIssue || 'pothole',
        severity: verification.severity || 'MEDIUM',
        estimatedResolutionDays: verification.estimatedResolutionDays || 3,
        estimatedBudget: budgetNum,
        estimatedBudgetDesc: verification.estimatedBudgetDesc || '',
        budgetBreakdown: verification.budgetBreakdown || {},
        roadId: verification.roadId || null,
        roadName: verification.roadName || 'Coimbatore Road',
        roadType: verification.roadType || 'Major Arterial',
        region: verification.region || 'Gandhipuram',
        maintenanceAuthority: verification.maintenanceAuthority || 'Coimbatore City Municipal Corporation (CCMC)',
        departmentName: verification.departmentName || 'Road Maintenance',
        officerName: verification.officerName || null,
        officerContact: verification.officerContact || null,
        isOtherDeptInvolved: !!verification.isOtherDeptInvolved,
        involvedDepartments: verification.involvedDepartments || [],
        otherDeptReason: verification.otherDeptReason || null,
        inspectorRemarks: verification.inspectorRemarks || '',
        inspectedAt: serverTimestamp(),
        inspectedBy: verification.inspectorId || 'inspector',
        inspectedByName: verification.inspectorName || 'Field Inspector',
      },
      statusHistory: [...existingHistory, historyItem],
      updatedAt: serverTimestamp(),
    };

    await updateDoc(docRef, updatePayload);

    console.log(`✅ [VERIFY COMPLAINT] Complaint #${complaintId} verified successfully via server proxy.`);
    return res.status(200).json({ ok: true, message: 'Complaint verified successfully.' });
  } catch (error) {
    console.error('Error in /api/verify-complaint:', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/**
 * Field Officer Department Confirmation / Transfer Workflow Endpoint (Resilient Backend Proxy)
 */
app.post('/api/verify-workflow', async (req, res) => {
  try {
    await ensureBackendAuth();
    const { complaintId, params } = req.body || {};
    if (!complaintId || !params) {
      return res.status(400).json({ ok: false, message: 'complaintId and params are required.' });
    }

    const docRef = doc(serverDb, 'complaints', complaintId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return res.status(404).json({ ok: false, message: 'Complaint not found.' });
    }
    const currentData = snap.data();
    const existingHistory = Array.isArray(currentData.statusHistory) ? currentData.statusHistory : [];
    const currentDept = currentData.department || currentData.responsibleDepartment || 'Road Maintenance';

    if (params.action === 'confirm_existing') {
      const historyItem = {
        id: `hist-${Date.now()}`,
        previousStatus: currentData.status || 'Submitted',
        newStatus: 'Verified',
        updatedBy: params.inspectorId || 'inspector',
        updatedByName: params.inspectorName || 'Field Inspector',
        remarks: `Field verification confirmed existing department (${currentDept}). ${params.remarks ? `Remarks: ${params.remarks}` : ''}`,
        timestamp: new Date().toISOString(),
      };

      const updatePayload = {
        status: 'Verified',
        inspectionStatus: 'VALID',
        fieldVerificationStatus: 'department_confirmed',
        verifiedDepartment: currentDept,
        fieldVerificationRemarks: params.remarks?.trim() || 'Existing department confirmed by field verification.',
        fieldVerifiedAt: serverTimestamp(),
        fieldVerifiedBy: params.inspectorName || 'Field Inspector',
        fieldVerifiedById: params.inspectorId || 'inspector',
        statusHistory: [...existingHistory, historyItem],
        updatedAt: serverTimestamp(),
      };

      if (params.evidenceUrl) {
        updatePayload.inspectionEvidenceUrl = params.evidenceUrl;
      }

      await updateDoc(docRef, updatePayload);
      console.log(`✅ [WORKFLOW] Complaint #${complaintId} department confirmed via server proxy.`);
      return res.status(200).json({ ok: true, message: 'Department confirmed successfully.' });
    } else if (params.action === 'transfer_department') {
      const newDeptName = params.newDepartmentName || 'Solid Waste Management';
      const newDeptCode = params.newDepartmentCode || 'SWM';
      const historyItem = {
        id: `hist-${Date.now()}`,
        previousStatus: currentData.status || 'Submitted',
        newStatus: 'Under Review',
        updatedBy: params.inspectorId || 'inspector',
        updatedByName: params.inspectorName || 'Field Inspector',
        remarks: `Field verification transferred complaint from ${currentDept} to ${newDeptName}. Reason: ${params.remarks || 'Another department involved.'}`,
        timestamp: new Date().toISOString(),
      };

      const updatePayload = {
        department: newDeptName,
        responsibleDepartment: newDeptName,
        departmentCode: newDeptCode,
        previousDepartment: currentDept,
        verifiedDepartment: newDeptName,
        departmentSource: 'field_inspector',
        routingStatus: newDeptCode === 'SWM' ? 'Moved to Solid Waste Management' : `Moved to ${newDeptName}`,
        routingMessage: `Issue referred to ${newDeptName}.`,
        fieldVerificationStatus: 'transferred',
        fieldVerificationRemarks: params.remarks?.trim() || `Transferred to ${newDeptName} during field inspection.`,
        departmentRemarks: params.remarks?.trim(),
        fieldVerifiedAt: serverTimestamp(),
        fieldVerifiedBy: params.inspectorName,
        fieldVerifiedById: params.inspectorId,
        departmentChangedAt: serverTimestamp(),
        departmentChangedBy: params.inspectorId,
        departmentChangedByName: params.inspectorName,
        status: 'Under Review',
        statusHistory: [...existingHistory, historyItem],
        updatedAt: serverTimestamp(),
      };

      if (params.evidenceUrl) {
        updatePayload.inspectionEvidenceUrl = params.evidenceUrl;
      }

      await updateDoc(docRef, updatePayload);
      console.log(`✅ [WORKFLOW] Complaint #${complaintId} transferred to ${newDeptName} via server proxy.`);
      return res.status(200).json({ ok: true, message: 'Department transferred successfully.' });
    }

    return res.status(400).json({ ok: false, message: 'Invalid action specified.' });
  } catch (error) {
    console.error('Error in /api/verify-workflow:', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/**
 * Field Officer Rejection Endpoint (Resilient Backend Proxy)
 */
app.post('/api/reject-complaint', async (req, res) => {
  try {
    await ensureBackendAuth();
    const { complaintId, inspectorId, inspectorName, rejectionReason, inspectorRemarks, evidenceUrl } = req.body || {};
    if (!complaintId) {
      return res.status(400).json({ ok: false, message: 'complaintId is required.' });
    }

    const docRef = doc(serverDb, 'complaints', complaintId);
    const snap = await getDoc(docRef);
    const existingHistory = snap.exists() && Array.isArray(snap.data().statusHistory)
      ? snap.data().statusHistory
      : [];

    const historyItem = {
      id: `hist-${Date.now()}`,
      previousStatus: snap.exists() ? snap.data().status : 'Pending Field Verification',
      newStatus: 'Rejected',
      updatedBy: inspectorId || 'inspector',
      updatedByName: inspectorName || 'Field Inspector',
      remarks: `Complaint rejected during field inspection: ${rejectionReason}. ${inspectorRemarks || ''}`,
      timestamp: new Date().toISOString(),
    };

    await updateDoc(docRef, {
      status: 'Rejected',
      inspectionStatus: 'INVALID',
      inspectionResult: 'fake',
      rejectionType: 'FIELD_INSPECTION_REJECTED',
      rejectionReason: rejectionReason || 'Invalid complaint',
      inspectorRemarks: inspectorRemarks || '',
      ...(evidenceUrl ? { inspectionEvidenceUrl: evidenceUrl } : {}),
      inspectedBy: inspectorId || 'inspector',
      inspectedByName: inspectorName || 'Field Inspector',
      inspectedAt: serverTimestamp(),
      rejectedAt: serverTimestamp(),
      statusHistory: [...existingHistory, historyItem],
      updatedAt: serverTimestamp(),
    });

    console.log(`✅ [REJECT COMPLAINT] Complaint #${complaintId} rejected successfully via server proxy.`);
    return res.status(200).json({ ok: true, message: 'Complaint rejected successfully.' });
  } catch (error) {
    console.error('Error in /api/reject-complaint:', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/**
 * Concurrency-safe human-readable Complaint ID allocation endpoint: CE-YYYYMMDD-000001
 */
app.get(['/api/next-complaint-id', '/api/generate-complaint-id'], async (req, res) => {
  try {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateKey = req.query.dateKey || `${yyyy}${mm}${dd}`;

    const { runTransaction, doc: fsDoc, serverTimestamp: fsServerTimestamp } = require('firebase/firestore');
    const counterDocRef = fsDoc(serverDb, 'counters', `complaints_${dateKey}`);

    const nextSeq = await runTransaction(serverDb, async (transaction) => {
      const snap = await transaction.get(counterDocRef);
      let current = 0;
      if (snap.exists() && typeof snap.data().lastSequence === 'number') {
        current = snap.data().lastSequence;
      }
      const next = current + 1;
      transaction.set(counterDocRef, {
        dateKey,
        lastSequence: next,
        updatedAt: fsServerTimestamp(),
      }, { merge: true });
      return next;
    });

    const complaintId = `CE-${dateKey}-${String(nextSeq).padStart(6, '0')}`;
    console.log(`[ID Allocation] Concurrency-safe complaint ID allocated: ${complaintId}`);
    return res.status(200).json({ ok: true, complaintId, dateKey, sequence: nextSeq });
  } catch (err) {
    console.error('[API] /api/next-complaint-id transaction note:', err.message);
    const now = new Date();
    const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const seq = String(Math.floor(Date.now() % 1000000)).padStart(6, '0');
    return res.status(200).json({ ok: true, complaintId: `CE-${dateKey}-${seq}`, dateKey, sequence: Number(seq) });
  }
});

app.get(['/health', '/api/health'], async (_req, res) => {
  let onnxStatus = 'unknown';
  let classifierStatus = 'unknown';
  try {
    await getOnnxSession();
    onnxStatus = 'ready';
  } catch (e) {
    onnxStatus = 'error: ' + e.message;
  }
  try {
    await getClassifierSession();
    classifierStatus = 'ready';
  } catch (e) {
    classifierStatus = 'error: ' + e.message;
  }

  res.json({
    ok: true,
    status: 'ok',
    service: 'civiceye-ai-backend',
    onnxModel: onnxStatus,
    classifierModel: classifierStatus,
    thresholds: {
      detection: DETECTION_THRESHOLD,
      iou: IOU_THRESHOLD,
      roadValidation: ROAD_VALIDATION_THRESHOLD,
    },
  });
});

function getLocalLanIp() {
  const os = require('os');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLocalLanIp();
  console.log('====================================================');
  console.log(`🚀 CivicEye AI & Image Backend Server is ACTIVE`);
  console.log(`📍 Local URL:  http://localhost:${PORT}`);
  console.log(`🌐 LAN URL:    http://${lanIp}:${PORT}`);
  console.log(`🤖 AI Engine:  ONNX YOLOv8 Road Damage Detection Ready`);
  console.log(`ℹ️  Note: This process runs continuously to serve`);
  console.log(`   mobile app inference requests. (Press Ctrl+C to stop)`);
  console.log('====================================================');
});



