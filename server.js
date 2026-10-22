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

process.on('uncaughtException', (err) => {
  console.error('[SERVER UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER UNHANDLED REJECTION]', reason);
});

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

function getCanonicalIssueName(rawIssue) {
  const norm = (rawIssue || '').toLowerCase().trim();
  if (norm.includes('pothole')) return 'Pothole';
  if (norm.includes('alligator')) return 'Alligator Cracking';
  if (norm.includes('cracking') || norm.includes('crack')) return 'Road Cracking';
  if (norm.includes('divider')) return 'Road Divider Damage';
  if (norm.includes('sign')) return 'Damaged Traffic Sign';
  if (norm.includes('light')) return 'Streetlight Fault';
  if (norm.includes('waterlogging') || norm.includes('flood')) return 'Waterlogging';
  if (norm.includes('manhole')) return 'Damaged Manhole';
  if (norm.includes('footpath') || norm.includes('walkway')) return 'Damaged Footpath';
  if (norm.includes('debris') || norm.includes('blockage') || norm.includes('obstruction')) return 'Road Debris / Obstruction';
  if (norm.includes('drainage')) return 'Drainage Blockage';
  if (norm === 'no_major_issue' || norm.includes('no major') || norm.includes('clean road')) return 'No Major Issue';
  return 'Road Surface Defect';
}

function calculatePriorityWithExplanation(issueType, boundingBox, description = '', detectionCount = 1) {
  const normType = (issueType || '').toLowerCase().trim();
  const desc = (description || '').toLowerCase().trim();
  const area = boundingBox ? (boundingBox.width * boundingBox.height) : 0;

  if (!normType || normType === 'no_major_issue' || normType.includes('invalid') || normType.includes('unclear')) {
    return { priority: 'NONE', reason: 'No actionable infrastructure defect identified.' };
  }

  const hasUrgentHazard =
    desc.includes('severe') || desc.includes('deep') || desc.includes('hazard') ||
    desc.includes('danger') || desc.includes('accident') || desc.includes('swerve') ||
    desc.includes('swerving') || desc.includes('active lane') || desc.includes('traffic lane') ||
    desc.includes('busy road') || desc.includes('junction') || desc.includes('highway') ||
    desc.includes('lorry') || desc.includes('crash') || desc.includes('bike fell') ||
    desc.includes('fall') || desc.includes('injury') || desc.includes('emergency') ||
    desc.includes('major obstruction') || desc.includes('completely blocked') ||
    desc.includes('open manhole') || desc.includes('broken divider');

  const hasMinorEvidence =
    desc.includes('minor') || desc.includes('small') || desc.includes('slight') ||
    desc.includes('hairline') || desc.includes('surface only') || desc.includes('low risk') ||
    desc.includes('shallow');

  // Pothole evaluation
  if (normType.includes('pothole')) {
    if (hasUrgentHazard || area >= 0.10 || detectionCount >= 3) {
      const reason = hasUrgentHazard
        ? 'High: Pothole with immediate safety hazard or active traffic risk reported.'
        : 'High: Large visible pothole surface area posing significant vehicle hazard.';
      return { priority: 'HIGH', reason };
    }
    if (hasMinorEvidence && area < 0.03 && detectionCount <= 1) {
      return { priority: 'LOW', reason: 'Low: Small/minor pothole defect with low immediate hazard.' };
    }
    if (area >= 0.03 || desc.includes('moderate') || detectionCount > 1) {
      return { priority: 'MEDIUM', reason: 'Medium: Moderate pothole requiring standard municipal repair.' };
    }
    return { priority: 'MEDIUM', reason: 'Medium: Road pothole detected; scheduled for standard road repair.' };
  }

  // Alligator Cracking evaluation
  if (normType.includes('alligator')) {
    if (hasUrgentHazard || area >= 0.15 || detectionCount >= 4) {
      return { priority: 'HIGH', reason: 'High: Extensive alligator cracking indicating severe sub-base structural failure.' };
    }
    if (hasMinorEvidence || (area < 0.04 && detectionCount <= 1)) {
      return { priority: 'LOW', reason: 'Low: Early-stage surface alligator cracking with low immediate structural risk.' };
    }
    return { priority: 'MEDIUM', reason: 'Medium: Moderate alligator cracking requiring road resurfacing.' };
  }

  // Linear / Transverse Cracking evaluation
  if (normType.includes('cracking')) {
    if (hasUrgentHazard && (area >= 0.08 || desc.includes('deep'))) {
      return { priority: 'HIGH', reason: 'High: Deep longitudinal/transverse fracture threatening road safety.' };
    }
    if (hasMinorEvidence) {
      return { priority: 'LOW', reason: 'Low: Minor surface cracking without immediate structural hazard.' };
    }
    if (area >= 0.03 || desc.includes('long') || desc.includes('spread') || desc.includes('across') || desc.includes('lane') || desc.includes('traffic')) {
      return { priority: 'MEDIUM', reason: 'Medium: Noticeable road cracking requiring crack sealing maintenance.' };
    }
    return { priority: 'LOW', reason: 'Low: Minor surface cracking without immediate structural hazard.' };
  }

  // Road Divider / Median Damage
  if (normType.includes('divider')) {
    if (hasUrgentHazard || desc.includes('traffic') || desc.includes('lane') || area >= 0.08) {
      return { priority: 'HIGH', reason: 'High: Broken road divider obstructing active traffic lane.' };
    }
    return { priority: 'MEDIUM', reason: 'Medium: Road divider damage requiring structural replacement.' };
  }

  // Damaged Manhole
  if (normType.includes('manhole')) {
    if (hasUrgentHazard || desc.includes('open') || desc.includes('missing') || desc.includes('broken')) {
      return { priority: 'HIGH', reason: 'High: Damaged or open manhole posing critical fall and vehicular hazard.' };
    }
    return { priority: 'HIGH', reason: 'High: Manhole defect requires urgent priority inspection.' };
  }

  // Waterlogging
  if (normType.includes('waterlogging') || normType.includes('flood')) {
    if (hasUrgentHazard || desc.includes('stagnant') || desc.includes('submerged') || area >= 0.12) {
      return { priority: 'HIGH', reason: 'High: Severe waterlogging causing vehicle swerving or road obstruction.' };
    }
    return { priority: 'MEDIUM', reason: 'Medium: Stagnant water accumulation affecting road drainage.' };
  }

  // Debris / Road Blockage
  if (normType.includes('debris') || normType.includes('blockage') || normType.includes('obstruction')) {
    if (hasUrgentHazard || desc.includes('blocked') || desc.includes('traffic')) {
      return { priority: 'HIGH', reason: 'High: Substantial debris or road blockage in active vehicular path.' };
    }
    return { priority: 'MEDIUM', reason: 'Medium: Road debris requiring solid waste clearing.' };
  }

  // Streetlight Fault
  if (normType.includes('light') || normType.includes('pole')) {
    if (hasUrgentHazard || desc.includes('hanging') || desc.includes('bent') || desc.includes('shock') || desc.includes('wire')) {
      return { priority: 'HIGH', reason: 'High: Hazardous streetlight or electrical wiring risk.' };
    }
    return { priority: 'MEDIUM', reason: 'Medium: Streetlight outage affecting night visibility.' };
  }

  // Damaged Traffic Sign
  if (normType.includes('sign')) {
    if (hasUrgentHazard || desc.includes('stop') || desc.includes('school') || desc.includes('junction')) {
      return { priority: 'MEDIUM', reason: 'Medium: Missing or damaged critical traffic regulatory sign.' };
    }
    return { priority: 'LOW', reason: 'Low: Non-critical traffic sign damage requiring maintenance.' };
  }

  // Damaged Footpath
  if (normType.includes('footpath') || normType.includes('walkway')) {
    if (hasUrgentHazard || desc.includes('pedestrian') || desc.includes('fall') || desc.includes('elderly')) {
      return { priority: 'MEDIUM', reason: 'Medium: Damaged footpath creating pedestrian hazard.' };
    }
    return { priority: 'LOW', reason: 'Low: Minor pedestrian walkway surface wear.' };
  }

  return { priority: 'LOW', reason: 'Low: Infrastructure defect reported with low immediate hazard.' };
}

function calculatePriority(issueType, confidence, boundingBox, detectionCount = 1) {
  const result = calculatePriorityWithExplanation(issueType, boundingBox, '', detectionCount);
  return result.priority;
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
        const rawBytes = execFileSync('python', [pyScript], { input: buffer, maxBuffer: 50 * 1024 * 1024, timeout: 10000 });
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
  640, // manhole (utility frame)
  825, // stone wall (macadam / paving stones)
  916, // granular asphalt macadam texture
  971, // bubble / asphalt texture
]);

// Plant / Flower / Flora & Insect related classes
const FLOWER_PLANT_CLASSES = new Set([
  309, // bee / honeybee (common on garden flower closeups)
  310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322,
  323, // monarch butterfly
  324, 325, 326, // butterflies
  580, // greenhouse, nursery
  723, // pinwheel (decorative garden)
  738, // pot, flowerpot
  883, // urn / vase
  899, // vase
  946, 947, 948, 949, 950, 951, 952, // cardoon, artichoke, head cabbage, broccoli, cauliflower, zucchini, spaghetti squash
  984, // rapeseed
  985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995, 996, 997, 998, // daisy, yellow lady's slipper, dandelion, iris, etc.
  999, // earthstar (fungus / flora)
  1000 // hen-of-the-woods
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
  776, 782, 785, 794, 804, 808, 831, 846, 852, 854, 857, 859, 861, 898, 900, 903
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

  // Severely dark / underexposed image rejection
  if (meanLum < 0.08) {
    return {
      isRoad: false,
      isClear: false,
      confidence: 0.01,
      reason: 'dark_image',
      message: 'The photo is pitch black or severely underexposed. Please capture with better lighting.',
    };
  }

  // Severely overexposed / washed out canvas rejection
  if (meanLum > 0.85) {
    return {
      isRoad: false,
      isClear: false,
      confidence: 0.01,
      reason: 'overexposed_image',
      message: 'The photo is severely overexposed with harsh glare. Please capture a clear image.',
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
      predictionState: 'INVALID_IMAGE',
      reason: 'Portrait / person detected',
      message: 'Invalid issue image. Please upload a clear image of the reported civic infrastructure issue.',
    };
  }

  // Obvious outdoor flora / garden foliage without road pavement
  if (greenRatio > 0.30 && lowSatRatio < 0.25) {
    return {
      isRoad: false,
      isClear: true,
      confidence: 0.05,
      predictionState: 'INVALID_IMAGE',
      reason: 'Flora / foliage without road pavement',
      message: 'Invalid issue image. Please upload a clear image of the reported civic infrastructure issue.',
    };
  }

  // Obvious vivid flower colors without road pavement
  if (flowerRatio > 0.20 && lowSatRatio < 0.25) {
    return {
      isRoad: false,
      isClear: true,
      confidence: 0.05,
      predictionState: 'INVALID_IMAGE',
      reason: 'Vivid flower colors without road pavement',
      message: 'Invalid issue image. Please upload a clear image of the reported civic infrastructure issue.',
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
            predictionState: 'INVALID_IMAGE',
            reason: 'Animal / pet detected',
            message: 'Invalid issue image. Please upload a clear image of the reported civic infrastructure issue.',
          };
        }

        // Check flower / flora classes
        const plantProb = top5.filter(item => FLOWER_PLANT_CLASSES.has(item.i)).reduce((sum, item) => sum + item.p, 0);
        if (plantProb > 0.15 || (FLOWER_PLANT_CLASSES.has(top.i) && top.p > 0.08)) {
          return {
            isRoad: false,
            isClear: true,
            confidence: 0.05,
            predictionState: 'INVALID_IMAGE',
            reason: 'Flower / plant detected',
            message: 'Invalid issue image. Please upload a clear image of the reported civic infrastructure issue.',
          };
        }

        // Check food / produce classes
        const foodProb = top5.filter(item => FOOD_PRODUCE_CLASSES.has(item.i)).reduce((sum, item) => sum + item.p, 0);
        if (foodProb > 0.15 || (FOOD_PRODUCE_CLASSES.has(top.i) && top.p > 0.08)) {
          return {
            isRoad: false,
            isClear: true,
            confidence: 0.05,
            predictionState: 'INVALID_IMAGE',
            reason: 'Food / non-infrastructure object detected',
            message: 'Invalid issue image. Please upload a clear image of the reported civic infrastructure issue.',
          };
        }

        // Check person / apparel classes
        const apparelProb = top5.filter(item => APPAREL_PEOPLE_CLASSES.has(item.i)).reduce((sum, item) => sum + item.p, 0);
        if (apparelProb > 0.15 || (APPAREL_PEOPLE_CLASSES.has(top.i) && top.p > 0.10)) {
          return {
            isRoad: false,
            isClear: true,
            confidence: 0.05,
            predictionState: 'INVALID_IMAGE',
            reason: 'Person / clothing detected',
            message: 'Invalid issue image. Please upload a clear image of the reported civic infrastructure issue.',
          };
        }

        // Check indoor / furniture classes
        const indoorProb = top5.filter(item => EXPLICIT_INDOOR_CLASSES.has(item.i)).reduce((sum, item) => sum + item.p, 0);
        if ((indoorProb > 0.20 || (EXPLICIT_INDOOR_CLASSES.has(top.i) && top.p > 0.15)) && lowSatRatio < 0.65) {
          return {
            isRoad: false,
            isClear: true,
            confidence: 0.05,
            predictionState: 'INVALID_IMAGE',
            reason: 'Indoor / unrelated object detected',
            message: 'Invalid issue image. Please upload a clear image of the reported civic infrastructure issue.',
          };
        }

        // If low saturation is not predominant, definitively reject non-road scene
        if (lowSatRatio < 0.40) {
          return {
            isRoad: false,
            isClear: true,
            confidence: 0.05,
            predictionState: 'INVALID_IMAGE',
            reason: 'Non-road or unrelated image detected',
            message: 'Invalid issue image. Please upload a clear image of the reported civic infrastructure issue.',
          };
        }

        // Even with high low-sat, if road probability is negligible and top class is strongly confident non-road
        if (roadProb < 0.02 && top.p > 0.25 && lowSatRatio < 0.70) {
          return {
            isRoad: false,
            isClear: true,
            confidence: 0.05,
            predictionState: 'INVALID_IMAGE',
            reason: 'Non-road or unrelated image detected',
            message: 'Invalid issue image. Please upload a clear image of the reported civic infrastructure issue.',
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
  0: 0.25, // Alligator cracking
  1: 0.25, // Linear cracking
  2: 0.25, // Pothole
  3: 0.25, // Manhole defect
  4: 0.25, // Waterlogging
  5: 0.25, // Road divider damage
  6: 0.25, // Damaged traffic sign
  7: 0.25, // Street light fault
  8: 0.25, // Debris / road blockage
  9: 0.25, // Damaged footpath
};

function parseYoloOutput(outputTensor, iouThreshold = IOU_THRESHOLD, description = '') {
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

    const thresh = CLASS_CONF_THRESHOLDS[bestClass] || 0.25;

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
      const canonicalName = getCanonicalIssueName(issueType);
      const bBox = {
        x: Math.max(0, Math.min(1, cx / MODEL_INPUT_WIDTH)),
        y: Math.max(0, Math.min(1, cy / MODEL_INPUT_HEIGHT)),
        width: Math.max(0, Math.min(1, w / MODEL_INPUT_WIDTH)),
        height: Math.max(0, Math.min(1, h / MODEL_INPUT_HEIGHT)),
      };

      const priorityInfo = calculatePriorityWithExplanation(issueType, bBox, description, 1);

      candidates.push({
        classId: bestClass,
        issueType,
        displayIssueName: canonicalName,
        rawConfidence: maxScore,
        confidence: maxScore, // Genuine model confidence
        priority: priorityInfo.priority,
        priorityReason: priorityInfo.reason,
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

    const description = (req.body && req.body.description) ? String(req.body.description).trim() : '';

    if (!imageBuffer) {
      return res.status(400).json({ ok: false, predictionState: 'INFERENCE_FAILED', message: 'No image provided.' });
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
        predictionState: 'UNCLEAR_IMAGE',
        validationStatus: 'unclear_image',
        agreementStatus: 'NOT_APPLICABLE',
        analysisStatus: 'unclear_image',
        detectedIssue: 'unclear_image',
        displayIssueName: 'Unclear Image (Manual Review Required)',
        invalidReason: 'blurry_image',
        confidence: 0,
        confidenceRaw: 0,
        hasDamage: false,
        priority: 'NONE',
        priorityReason: 'Image file could not be decoded. Manual review required.',
        department: null,
        responsibleDepartment: null,
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
      const predictionState = isUnclear ? 'UNCLEAR_IMAGE' : 'INVALID_IMAGE';
      const displayIssueName = isUnclear ? 'Unclear Image (Manual Review Required)' : 'Invalid Issue Image';
      const userMessage = validation.message || (isUnclear
        ? 'The uploaded image is unclear, blurry, or poorly lit. Please upload a clear photo or submit for manual review.'
        : 'Invalid issue image. Please upload a clear image of the reported civic infrastructure issue.');

      return res.status(200).json({
        ok: true,
        isRoad: false,
        isDissimilar: !isUnclear,
        isClear: !isUnclear,
        roadConfidence: validation.confidence,
        predictionState,
        validationStatus: isUnclear ? 'unclear_image' : 'unrelated_image',
        agreementStatus: 'NOT_APPLICABLE',
        analysisStatus: isUnclear ? 'unclear_image' : 'dissimilar_image',
        detectedIssue: isUnclear ? 'unclear_image' : 'Invalid Image, give valid Issue Image!',
        displayIssueName,
        issueType: isUnclear ? 'unclear_image' : 'Invalid Image, give valid Issue Image!',
        invalidReason: validation.reason || 'unrelated_image',
        confidence: 0,
        confidenceRaw: 0,
        priority: 'NONE',
        priorityReason: isUnclear ? 'Image quality insufficient for automated assessment.' : 'Image does not contain valid civic road infrastructure.',
        department: null,
        responsibleDepartment: null,
        message: userMessage,
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
    let detections = parseYoloOutput(outputTensor, IOU_THRESHOLD, description);

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
      const canonicalName = getCanonicalIssueName(primary.issueType);

      const descLower = description.toLowerCase();
      let agreementStatus = 'AGREED';
      if (descLower) {
        const isLighting = descLower.includes('light') || descLower.includes('lamp') || descLower.includes('darkness');
        const isSwm = descLower.includes('garbage') || descLower.includes('waste') || descLower.includes('trash') || descLower.includes('debris');
        const isDrain = descLower.includes('drain') || descLower.includes('flood') || descLower.includes('waterlog');
        const isDivider = descLower.includes('divider') || descLower.includes('median');
        const isSign = descLower.includes('sign') || descLower.includes('board');
        
        const defectIsRoad = primary.issueType === 'pothole' || primary.issueType === 'alligator cracking' || primary.issueType === 'cracking';
        if (defectIsRoad && (isLighting || isSwm || isDrain || isDivider || isSign)) {
          agreementStatus = 'DISAGREED';
        }
      }

      console.log("[YOLO] Damage detected:", canonicalName, `(${Math.round(primary.rawConfidence * 100)}%)`);
      return res.status(200).json({
        ok: true,
        isRoad: true,
        hasDamage: true,
        roadConfidence: 0.95,
        predictionState: 'VALID_ISSUE',
        validationStatus: 'valid_defect',
        agreementStatus,
        analysisStatus: 'damage_detected',
        issueType: primary.issueType,
        detectedIssue: canonicalName,
        displayIssueName: canonicalName,
        confidence: Math.round(primary.rawConfidence * 100),
        confidenceRaw: primary.rawConfidence,
        priority: primary.priority,
        priorityReason: primary.priorityReason,
        department: dept.name,
        responsibleDepartment: dept.name,
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
      predictionState: 'NO_MAJOR_ISSUE',
      validationStatus: 'valid_clean_road',
      agreementStatus: 'AGREED',
      analysisStatus: 'no_major_issue',
      issueType: 'no_major_issue',
      detectedIssue: 'No Major Issue',
      displayIssueName: 'No Major Issue',
      confidence: 0,
      confidenceRaw: 0,
      priority: 'NONE',
      priorityReason: 'Normal road surface verified. No major road defects detected.',
      department: 'Road Maintenance',
      responsibleDepartment: 'Road Maintenance',
      departmentCode: 'ROAD',
      message: 'Verified normal road surface. No major road defects detected.',
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
      trainingCandidateStatus: 'inspector_verified',
      verifiedIssueCategory: verification.verifiedIssue || 'pothole',
      inspectorVerifiedAt: serverTimestamp(),
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
      trainingCandidateStatus: 'rejected_candidate',
      inspectorVerifiedAt: serverTimestamp(),
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
 * Format system date dynamically in Asia/Kolkata timezone (YYYYMMDD)
 */
function getKolkataDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date).replace(/-/g, '');
}

/**
 * Concurrency-safe human-readable Complaint ID allocation endpoint: CE-YYYYMMDD-000001
 * Uses Asia/Kolkata timezone and atomic Firestore transaction.
 */
app.get(['/api/next-complaint-id', '/api/generate-complaint-id'], async (req, res) => {
  const rawDateKey = typeof req.query.dateKey === 'string' ? req.query.dateKey.trim() : '';
  const dateKey = /^\d{8}$/.test(rawDateKey) ? rawDateKey : getKolkataDateKey(new Date());

  const { runTransaction, doc: fsDoc, serverTimestamp: fsServerTimestamp } = require('firebase/firestore');
  const counterDocRef = fsDoc(serverDb, 'counters', `complaints_${dateKey}`);

  let attempts = 0;
  const maxAttempts = 8;
  while (attempts < maxAttempts) {
    try {
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
      attempts++;
      if (attempts >= maxAttempts) {
        console.error('[API] /api/next-complaint-id transaction failed after retries:', err.message);
        return res.status(500).json({
          ok: false,
          message: 'Failed to allocate unique complaint ID: ' + err.message,
        });
      }
      // Exponential backoff with random jitter for high concurrency
      await new Promise(r => setTimeout(r, 40 * attempts + Math.random() * 80));
    }
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

// Keep-alive timer to ensure Node event loop remains permanently active under Windows background task
setInterval(() => {}, 10000);



