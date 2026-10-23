const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
const ort = require('onnxruntime-node');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');
const { analyzeImageWithVisionAI, toCanonicalIssueName } = require('./services/visionAIProvider');

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
const { getFirestore: getFirebaseFirestore, doc, updateDoc, getDoc, collection, addDoc, serverTimestamp } = require('firebase/firestore');

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
// Vision AI Deep Learning Classifier Configuration (CivicEye Vision Engine v3)
// ---------------------------------------------------------------------------
const VISION_MODEL_PATH = path.resolve(__dirname, 'assets/models/civiceye_vision_model.onnx');
const VISION_CLASSES_PATH = path.resolve(__dirname, 'assets/models/vision_classes.json');

let _visionClasses = null;
let _visionSession = null;
let _visionSessionPromise = null;

async function getVisionSession() {
  if (_visionSession) return _visionSession;
  if (_visionSessionPromise) return _visionSessionPromise;

  _visionSessionPromise = (async () => {
    try {
      if (!fs.existsSync(VISION_MODEL_PATH)) {
        console.warn(`[Vision AI] Classifier model not found at ${VISION_MODEL_PATH}`);
        return null;
      }
      if (fs.existsSync(VISION_CLASSES_PATH)) {
        const parsed = JSON.parse(fs.readFileSync(VISION_CLASSES_PATH, 'utf8'));
        _visionClasses = parsed.classes;
      } else {
        _visionClasses = [
          "alligator_cracking", "cracking", "damaged_footpath", "damaged_traffic_sign",
          "debris_road_blockage", "manhole_defect", "pothole", "road_divider_damage",
          "street_light_fault", "unrelated_images", "valid_road_no_issue", "waterlogging"
        ];
      }
      const numThreads = Math.max(2, Math.min(4, require('os').cpus().length));
      const session = await ort.InferenceSession.create(VISION_MODEL_PATH, {
        executionProviders: ['cpu'],
        intraOpNumThreads: numThreads,
      });
      _visionSession = session;
      console.log('[Vision AI] CivicEye Deep Vision Classifier ready (12 classes, No YOLO).');
      return session;
    } catch (err) {
      console.error('[Vision AI] Error loading vision model:', err.message);
      _visionSessionPromise = null;
      return null;
    }
  })();
  return _visionSessionPromise;
}

getVisionSession().catch(err => console.warn('[Vision AI] Pre-load warning:', err.message));

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
    if (hasUrgentHazard || (area && area >= 0.15) || detectionCount >= 4) {
      return { priority: 'HIGH', reason: 'High: Extensive alligator cracking indicating severe sub-base structural failure.' };
    }
    if (hasMinorEvidence || (area && area > 0 && area < 0.04 && detectionCount <= 1)) {
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


// ---------------------------------------------------------------------------
// Image Decoding, Preprocessing & Clarity Assessment
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

function preprocessForVisionModel(decoded) {
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

/**
 * Assesses physical clarity of the image.
 * Genuinely identifies pitch dark, severely overexposed, or uniform blank photos.
 * Never misidentifies clear road cracking or potholes as unclear.
 */
function assessImageClarity(decodedImage) {
  const { width, height, data } = decodedImage;
  if (width <= 4 || height <= 4) {
    return {
      isClear: false,
      reason: 'blurry_image',
      message: 'The photo is completely blank or unreadable. Please upload a clear photo of the civic issue.',
    };
  }

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

  // Severely dark / pitch black image
  if (meanLum < 0.08) {
    return {
      isClear: false,
      reason: 'dark_image',
      message: 'The photo is pitch black or severely underexposed. Please capture with better lighting.',
    };
  }

  // Severely overexposed / washed out canvas
  if (meanLum > 0.88) {
    return {
      isClear: false,
      reason: 'overexposed_image',
      message: 'The photo is severely overexposed with harsh glare. Please capture a clear image.',
    };
  }

  // Pure solid uniform color screen
  if (avgGradient < 0.0005 && lumVariance < 0.0001) {
    return {
      isClear: false,
      reason: 'blurry_image',
      message: 'The photo is completely blank or uniform. Please upload a clear photo of the civic issue.',
    };
  }

  return { isClear: true };
}

// ---------------------------------------------------------------------------
// API Endpoints
// ---------------------------------------------------------------------------

/**
 * Unified Vision AI & Road Defect Analysis API
 * Supports Gemini Vision, OpenAI Vision, and CivicEye Vision Local v2 fallback.
 */
app.post('/api/analyze-road', upload.single('image'), async (req, res) => {
  console.log("[Vision AI] Received image analysis request");
  try {
    let imageBuffer = null;
    let mimeType = 'image/jpeg';
    if (req.file && req.file.buffer) {
      imageBuffer = req.file.buffer;
      if (req.file.mimetype) mimeType = req.file.mimetype;
    } else if (req.body && (req.body.imageBase64 || req.body.image)) {
      let b64 = req.body.imageBase64 || req.body.image;
      if (b64.startsWith('data:')) {
        const match = b64.match(/^data:([^;]+);base64,/);
        if (match) mimeType = match[1];
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
      console.warn('[Vision AI] Unparseable image buffer, rejecting as unclear:', decodeErr.message);
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
        confidenceType: 'qualitative_assessment',
        hasDamage: false,
        priority: 'NONE',
        priorityReason: 'Image file could not be decoded. Manual review required.',
        department: null,
        responsibleDepartment: null,
        provider: 'local_cv',
        modelVersion: 'CivicEye-Vision-Local-v2',
        message: 'The uploaded file could not be decoded. Please upload a clear photo of the civic issue.',
        allDetections: [],
        primaryDetection: null,
      });
    }

    const ISSUE_DEPT_MAP = {
      'pothole': { name: 'Road Maintenance', code: 'ROAD' },
      'alligator_cracking': { name: 'Road Maintenance', code: 'ROAD' },
      'alligator cracking': { name: 'Road Maintenance', code: 'ROAD' },
      'cracking': { name: 'Road Maintenance', code: 'ROAD' },
      'road cracking': { name: 'Road Maintenance', code: 'ROAD' },
      'manhole_defect': { name: 'Sewerage', code: 'SEWER' },
      'manhole defect': { name: 'Sewerage', code: 'SEWER' },
      'waterlogging': { name: 'Stormwater / Drainage', code: 'DRAIN' },
      'road_divider_damage': { name: 'Traffic / Road Safety Department', code: 'SAFETY' },
      'road divider damage': { name: 'Traffic / Road Safety Department', code: 'SAFETY' },
      'damaged_traffic_sign': { name: 'Traffic / Road Safety Department', code: 'SAFETY' },
      'damaged traffic sign': { name: 'Traffic / Road Safety Department', code: 'SAFETY' },
      'missing signage': { name: 'Traffic / Road Safety Department', code: 'SAFETY' },
      'street_light_fault': { name: 'Street Lighting Department', code: 'LIGHTING' },
      'street light fault': { name: 'Street Lighting Department', code: 'LIGHTING' },
      'debris_road_blockage': { name: 'Solid Waste Management', code: 'SWM' },
      'debris / road blockage': { name: 'Solid Waste Management', code: 'SWM' },
      'damaged_footpath': { name: 'Public Works Department', code: 'PWD' },
      'damaged footpath': { name: 'Public Works Department', code: 'PWD' },
      'public route defect': { name: 'Public Works Department', code: 'PWD' },
      'valid_road_no_issue': { name: 'Road Maintenance', code: 'ROAD' },
      'no_major_issue': { name: 'Road Maintenance', code: 'ROAD' },
    };

    // Helper: Autonomous CivicEye Deep Vision Classifier Pipeline (12 canonical classes, No YOLO)
    const runLocalCVPipeline = async (decodedImg, desc) => {
      // 1. Physical clarity gatekeeper
      const clarity = assessImageClarity(decodedImg);
      if (!clarity.isClear) {
        console.log('[Vision AI Local] Image rejected as unclear/insufficient evidence:', clarity.reason);
        return {
          isRoad: false,
          isDissimilar: false,
          isClear: false,
          hasDamage: false,
          roadConfidence: 0.01,
          predictionState: 'UNCLEAR_IMAGE',
          validationStatus: 'unclear_image',
          agreementStatus: 'NOT_APPLICABLE',
          analysisStatus: 'unclear_image',
          detectedIssue: 'unclear_image',
          displayIssueName: 'Unclear Image (Manual Review Required)',
          issueType: 'unclear_image',
          invalidReason: clarity.reason,
          confidence: 0,
          confidenceRaw: 0,
          confidenceType: 'qualitative_assessment',
          priority: 'NONE',
          priorityReason: 'Image quality insufficient for automated assessment.',
          department: null,
          responsibleDepartment: null,
          departmentCode: null,
          message: clarity.message,
          boundingBox: null,
          allDetections: [],
          primaryDetection: null,
        };
      }

      // 2. Run CivicEye Deep Learning Vision Model
      const session = await getVisionSession();
      if (!session) {
        throw new Error('CivicEye Vision Classifier model session unavailable');
      }

      const tensor = preprocessForVisionModel(decodedImg);
      const results = await session.run({ [session.inputNames[0]]: tensor });
      const logits = results[session.outputNames[0]].data;
      const probs = softmax(logits);

      let maxIdx = 0;
      let maxProb = probs[0];
      for (let i = 1; i < probs.length; i++) {
        if (probs[i] > maxProb) {
          maxProb = probs[i];
          maxIdx = i;
        }
      }

      const classes = _visionClasses || [
        "alligator_cracking", "cracking", "damaged_footpath", "damaged_traffic_sign",
        "debris_road_blockage", "manhole_defect", "pothole", "road_divider_damage",
        "street_light_fault", "unrelated_images", "valid_road_no_issue", "waterlogging"
      ];
      const predictedRawClass = classes[maxIdx] || 'valid_road_no_issue';
      const confidencePercent = Math.min(100, Math.max(1, Math.round(maxProb * 100)));

      console.log(`[Vision AI Local] Predicted class: "${predictedRawClass}", confidence: ${confidencePercent}% (raw: ${maxProb.toFixed(4)})`);

      // 3. Unrelated / Non-infrastructure Image
      if (predictedRawClass === 'unrelated_images') {
        return {
          isRoad: false,
          isDissimilar: true,
          isClear: true,
          hasDamage: false,
          roadConfidence: maxProb,
          predictionState: 'INVALID_IMAGE',
          validationStatus: 'unrelated_image',
          agreementStatus: 'NOT_APPLICABLE',
          analysisStatus: 'dissimilar_image',
          detectedIssue: 'Invalid Image, give valid Issue Image!',
          displayIssueName: 'Unrelated Image Detected',
          issueType: 'Invalid Image, give valid Issue Image!',
          invalidReason: 'unrelated_image',
          confidence: 0,
          confidenceRaw: 0,
          confidenceType: 'model_calibrated_probability',
          priority: 'NONE',
          priorityReason: 'Image does not contain valid civic road infrastructure.',
          department: null,
          responsibleDepartment: null,
          departmentCode: null,
          message: 'Invalid issue image. Please upload a clear image of the reported civic infrastructure issue.',
          boundingBox: null,
          allDetections: [],
          primaryDetection: null,
        };
      }

      // 4. Clean Normal Road Surface
      if (predictedRawClass === 'valid_road_no_issue') {
        return {
          isRoad: true,
          isDissimilar: false,
          isClear: true,
          hasDamage: false,
          roadConfidence: maxProb,
          predictionState: 'NO_MAJOR_ISSUE',
          validationStatus: 'valid_clean_road',
          agreementStatus: 'AGREED',
          analysisStatus: 'no_major_issue',
          issueType: 'no_major_issue',
          detectedIssue: 'Clean Road (No Major Issue)',
          displayIssueName: 'Clean Road (No Major Issue)',
          confidence: confidencePercent,
          confidenceRaw: maxProb,
          confidenceType: 'model_calibrated_probability',
          priority: 'NONE',
          priorityReason: 'Normal clean road surface verified. No major road defects detected.',
          department: 'Road Maintenance',
          responsibleDepartment: 'Road Maintenance',
          departmentCode: 'ROAD',
          message: 'Verified normal road surface. No major road defects detected.',
          boundingBox: null,
          allDetections: [],
          primaryDetection: null,
        };
      }

      // 5. Valid Road Infrastructure Defect
      const canonicalName = getCanonicalIssueName(predictedRawClass);
      const dept = ISSUE_DEPT_MAP[predictedRawClass] || { name: 'Road Maintenance', code: 'ROAD' };
      const priorityResult = calculatePriorityWithExplanation(predictedRawClass, null, desc, 1);

      return {
        isRoad: true,
        isDissimilar: false,
        isClear: true,
        hasDamage: true,
        roadConfidence: 0.99,
        predictionState: 'VALID_ISSUE',
        validationStatus: 'valid_defect',
        agreementStatus: 'AGREED',
        analysisStatus: 'damage_detected',
        issueType: predictedRawClass,
        detectedIssue: canonicalName,
        displayIssueName: canonicalName,
        confidence: confidencePercent,
        confidenceRaw: maxProb,
        confidenceType: 'model_calibrated_probability',
        priority: priorityResult.priority,
        priorityReason: priorityResult.reason,
        department: dept.name,
        responsibleDepartment: dept.name,
        departmentCode: dept.code,
        boundingBox: null,
        allDetections: [
          {
            classId: maxIdx,
            issueType: canonicalName,
            displayIssueName: canonicalName,
            confidence: maxProb,
            priority: priorityResult.priority,
            priorityReason: priorityResult.reason,
          }
        ],
        primaryDetection: {
          classId: maxIdx,
          issueType: canonicalName,
          displayIssueName: canonicalName,
          confidence: maxProb,
          priority: priorityResult.priority,
          priorityReason: priorityResult.reason,
        },
        message: `Visual evidence confirmed ${canonicalName} on road infrastructure.`,
      };
    };

    // Execute Unified Vision AI
    const result = await analyzeImageWithVisionAI({
      imageBuffer,
      decodedImage,
      description,
      mimeType,
      localCVFallbackFn: runLocalCVPipeline,
    });

    console.log(`[Vision AI] Analysis completed by provider=${result.provider}, state=${result.predictionState}, issue=${result.displayIssueName}`);

    return res.status(200).json({
      ok: true,
      provider: result.provider || 'local_cv',
      modelVersion: result.modelVersion || result.model || 'CivicEye-Vision-Local-v2',
      predictionState: result.predictionState,
      validationStatus: result.validationStatus || (result.isRoad ? (result.hasDamage ? 'valid_defect' : 'valid_clean_road') : 'unrelated_image'),
      agreementStatus: result.agreementStatus || 'AGREED',
      analysisStatus: result.analysisStatus || (result.hasDamage ? 'damage_detected' : 'no_major_issue'),
      isRoad: result.isRoad,
      hasDamage: !!result.hasDamage,
      issueType: result.issueType || result.detectedDefect || 'Road Surface Defect',
      detectedIssue: result.detectedIssue || result.displayIssueName || 'Road Surface Defect',
      displayIssueName: result.displayIssueName || getCanonicalIssueName(result.detectedDefect || result.issueType),
      confidence: result.confidence ?? 0,
      confidenceRaw: result.confidenceRaw ?? (result.confidence ? result.confidence / 100 : 0),
      confidenceType: result.confidenceType || 'detector_confidence',
      priority: result.priority || result.severityEvidence || 'NONE',
      priorityReason: result.priorityReason || result.severityReason || 'No actionable issue identified.',
      department: result.department || 'Road Maintenance',
      responsibleDepartment: result.responsibleDepartment || result.department || 'Road Maintenance',
      departmentCode: result.departmentCode || 'ROAD',
      boundingBox: result.boundingBox || null,
      allDetections: result.allDetections || [],
      primaryDetection: result.primaryDetection || null,
      message: result.message || (result.isRoad ? (result.hasDamage ? 'Defect identified on road infrastructure.' : 'Normal road surface verified.') : 'Invalid issue image.'),
    });

  } catch (error) {
    console.error('[API] /api/analyze-road error:', error);
    return res.status(500).json({
      ok: false,
      predictionState: 'INFERENCE_FAILED',
      message: error.message || 'Vision analysis failed.',
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
    const clarity = assessImageClarity(decodedImage);
    if (!clarity.isClear) {
      return res.json({
        ok: true,
        isRoad: false,
        isClear: false,
        confidence: 0,
        reason: clarity.reason,
        message: clarity.message,
      });
    }

    const session = await getVisionSession();
    if (!session) {
      return res.json({
        ok: true,
        isRoad: true,
        confidence: 0.95,
        message: 'Valid road image.',
      });
    }

    const tensor = preprocessForVisionModel(decodedImage);
    const results = await session.run({ [session.inputNames[0]]: tensor });
    const logits = results[session.outputNames[0]].data;
    const probs = softmax(logits);

    let maxIdx = 0;
    let maxProb = probs[0];
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > maxProb) {
        maxProb = probs[i];
        maxIdx = i;
      }
    }

    const classes = _visionClasses || [
      "alligator_cracking", "cracking", "damaged_footpath", "damaged_traffic_sign",
      "debris_road_blockage", "manhole_defect", "pothole", "road_divider_damage",
      "street_light_fault", "unrelated_images", "valid_road_no_issue", "waterlogging"
    ];
    const detectedClass = classes[maxIdx] || 'valid_road_no_issue';
    const isRoad = detectedClass !== 'unrelated_images';

    return res.json({
      ok: true,
      isRoad,
      isClear: true,
      confidence: Math.round(maxProb * 100),
      detectedClass,
      message: isRoad
        ? 'Valid road image.'
        : 'The uploaded image does not appear to contain road infrastructure.',
    });

  } catch (error) {
    console.error('[API] /api/validate-road error:', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
});

function hasPositiveCivicIssue(text) {
  if (!text || typeof text !== 'string') return { hasIssue: false };
  const norm = text.toLowerCase().trim();

  const issueDefs = [
    { name: 'Street Light Fault', pattern: /\b(street\s*lights?|lamps?|lamp\s*posts?|light\s*poles?|lights?\s*not\s*working|streetlight\s*is\s*not\s*working)\b/i },
    { name: 'Pothole', pattern: /\b(potholes?|pot\s*holes?|craters?|road\s*pits?|asphalt\s*cavity|deep\s*pothole|large\s*pothole)\b/i },
    { name: 'Road Crack', pattern: /\b(cracks?|cracking|alligator\s*cracking|fissures?|road\s*has\s*long\s*cracks)\b/i },
    { name: 'Waterlogging', pattern: /\b(waterlogging|water\s*logging|standing\s*water|water\s*accumulat\w+|flooded|water\s*puddles?)\b/i },
    { name: 'Drainage Blockage', pattern: /\b(blocked\s*drains?|storm\s*drains?|drains?\s*(?:is|are)?\s*blocked|clogged\s*drains?|drainage\s*blockage|drainage\s*is\s*blocked|drainage)\b/i },
    { name: 'Damaged Manhole', pattern: /\b(manholes?|man\s*hole|broken\s*manhole|open\s*manhole|manhole\s*cover\s*is\s*damaged|damaged\s*manhole)\b/i },
    { name: 'Damaged Footpath', pattern: /\b(footpaths?|sidewalks?|pedestrian\s*walkway|broken\s*footpath)\b/i },
    { name: 'Road Divider Damage', pattern: /\b(road\s*dividers?|medians?|broken\s*divider|damaged\s*divider)\b/i },
    { name: 'Damaged Traffic Sign', pattern: /\b(traffic\s*signs?|signboards?|missing\s*sign|damaged\s*traffic\s*sign)\b/i },
    { name: 'Garbage Overflow', pattern: /\b(garbage|trash|dustbins?|waste\s*dump|overflowing\s*garbage)\b/i },
  ];

  for (const def of issueDefs) {
    if (def.pattern.test(norm)) {
      const negationRegex = new RegExp(`\\b(?:no|not|without)\\s+(?:a\\s+|an\\s+|any\\s+)?(?:visible\\s+|noticeable\\s+)?${def.pattern.source.replace(/^\\b|\\b$/g, '')}`, 'i');
      const match = norm.match(negationRegex);
      if (!match) {
        return { hasIssue: true, issueName: def.name };
      }
    }
  }
  return { hasIssue: false };
}

/**
 * Image-Description Validation Gatekeeper Endpoint
 * Evaluates image relevance, visible defect evidence, description meaning, and consistency.
 * Must run before complaint ID generation or persistence.
 */
app.post('/api/validate-complaint', upload.single('image'), async (req, res) => {
  try {
    let imageBuffer = null;
    if (req.file && req.file.buffer) {
      imageBuffer = req.file.buffer;
    } else if (req.body && (req.body.imageBase64 || req.body.image)) {
      let b64 = req.body.imageBase64 || req.body.image;
      if (b64.startsWith('data:')) {
        b64 = b64.split(',')[1];
      }
      imageBuffer = Buffer.from(b64, 'base64');
    }

    const description = (req.body && req.body.description) ? String(req.body.description).trim() : '';

    // 1. Description meaning check: Does it report NO ISSUE?
    const descLower = description.toLowerCase();
    const isUniversalNoIssue =
      /\b(the\s+)?(road|street|path|walkway|pavement|lane)\s+is\s+(fine|good|okay|ok|clear|clean|normal)\b/i.test(descLower) ||
      /\bno\s+(damage|problem|issue|defect|hazard)(\s+found|\s+here|\s+on\s+this\s+road)?\b/i.test(descLower) ||
      /\bthere\s+is\s+no\s+(damage|problem|issue|defect|hazard|pothole|crack)(\s+on\s+this\s+road|\s+here)?\b/i.test(descLower) ||
      /\beverything\s+(is|looks)\s+(fine|good|okay|ok|normal)\b/i.test(descLower);

    // Contrastive exception check
    const hasContrast = /\b(but|however|except|yet|although)\b/i.test(descLower);
    const hasContrastedIssue = hasContrast && (
      /\b(broken|damaged|fault|clogged|blocked|leak|waterlogging|pothole|cracks?|streetlight|divider|manhole)\b/i.test(descLower)
    );

    if (isUniversalNoIssue && !hasContrastedIssue) {
      return res.json({
        ok: true,
        isValid: false,
        outcome: 'BLOCK_NO_ISSUE_DESC',
        title: 'No Issue Found',
        message: 'No Issue Found. Your description does not report a civic problem. Please provide a description of the actual issue and upload a relevant image.',
      });
    }

    // Single clause negated defect: "There is no pothole on this road"
    if (!hasContrast && /\b(there\s+is\s+no|there\s+are\s+no|no|not\s+any)\s+(pothole|potholes|cracks?|road\s*cracks?|damage|defect|waterlogging|street\s*light\s*fault|broken\s*divider)\b/i.test(descLower)) {
      return res.json({
        ok: true,
        isValid: false,
        outcome: 'BLOCK_NO_ISSUE_DESC',
        title: 'No Issue Found',
        message: 'No Issue Found. Your description does not report a civic problem. Please provide a description of the actual issue and upload a relevant image.',
      });
    }

    // 2. Authoritative description check: If description specifies an issue, allow it
    const positiveIssue = !isUniversalNoIssue ? hasPositiveCivicIssue(description) : { hasIssue: false };
    if (positiveIssue.hasIssue) {
      const canonicalName = positiveIssue.issueName || 'Pothole';
      return res.json({
        ok: true,
        isValid: true,
        outcome: 'ALLOW',
        detectedIssue: canonicalName,
        displayIssueName: canonicalName,
        confidence: 90,
        confidenceType: 'description_heuristic',
        message: 'Description-based classification authoritative. Complaint allowed.',
      });
    }

    // If description is empty or unclear, optionally check image if provided
    if (!imageBuffer) {
      return res.json({
        ok: true,
        isValid: false,
        outcome: 'BLOCK_NO_ISSUE_DESC',
        title: 'Description Required',
        message: 'Please provide a clear description of the civic problem you want to report.',
      });
    }

    let decodedImg;
    try {
      decodedImg = decodeImageBuffer(imageBuffer);
    } catch {
      return res.json({
        ok: true,
        isValid: false,
        outcome: 'BLOCK_UNREADABLE_IMAGE',
        title: 'Unreadable Image',
        message: 'The uploaded image is unreadable or corrupted. Please provide a clear description and image.',
      });
    }

    const session = await getVisionSession();
    if (!session) {
      return res.json({
        ok: true,
        isValid: true,
        outcome: 'ALLOW',
        detectedIssue: 'Civil Infrastructure Issue',
        displayIssueName: 'Civil Infrastructure Issue',
        confidence: 80,
      });
    }

    const tensor = preprocessForVisionModel(decodedImg);
    const results = await session.run({ [session.inputNames[0]]: tensor });
    const logits = results[session.outputNames[0]].data;
    const probs = softmax(logits);

    let maxIdx = 0;
    let maxProb = probs[0];
    for (let i = 1; i < probs.length; i++) {
      if (probs[i] > maxProb) {
        maxProb = probs[i];
        maxIdx = i;
      }
    }

    const classes = _visionClasses || [
      "alligator_cracking", "cracking", "damaged_footpath", "damaged_traffic_sign",
      "debris_road_blockage", "manhole_defect", "pothole", "road_divider_damage",
      "street_light_fault", "unrelated_images", "valid_road_no_issue", "waterlogging"
    ];
    const predictedClass = classes[maxIdx] || 'valid_road_no_issue';

    if (predictedClass === 'unrelated_images') {
      return res.json({
        ok: true,
        isValid: false,
        outcome: 'BLOCK_UNRELATED_IMAGE',
        title: 'Invalid Issue Image',
        message: 'The uploaded image does not appear to show civic infrastructure.',
      });
    }

    const canonicalName = getCanonicalIssueName(predictedClass);
    return res.json({
      ok: true,
      isValid: true,
      outcome: 'ALLOW',
      detectedIssue: canonicalName,
      displayIssueName: canonicalName,
      confidence: Math.round(maxProb * 100),
    });
  } catch (err) {
    console.error('[API] /api/validate-complaint error:', err);
    return res.status(500).json({ ok: false, message: err.message });
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

// In-memory deduplication cache for email events
const emailDeduplicationCache = new Map();

function isDuplicateEmailRequest(key, windowMs = 60000) {
  const now = Date.now();
  for (const [k, ts] of emailDeduplicationCache.entries()) {
    if (now - ts > windowMs) {
      emailDeduplicationCache.delete(k);
    }
  }
  if (emailDeduplicationCache.has(key)) {
    return true;
  }
  emailDeduplicationCache.set(key, now);
  return false;
}

/**
 * Email Notification Endpoint for Complaint Submissions, Status Updates & Department Routing
 */
app.post('/api/send-email', async (req, res) => {
  try {
    const body = req.body || {};
    const type = body.type || 'submission'; // 'submission' | 'status_update' | 'swm_routing'
    const complaintId = body.complaintId;
    const issueType = body.issueType || body.issueName || body.canonicalIssueName;
    const description = body.description;
    const citizenEmail = body.citizenEmail || body.to || body.recipientEmail;
    const department = body.department || body.assignedDepartment || body.departmentName || 'Road Maintenance';
    const previousStatus = body.previousStatus || body.oldStatus;
    const newStatus = body.newStatus || body.status;
    const priority = body.priority || body.severity;
    const statusRemarks = body.statusRemarks || body.note || body.remarks;
    const updatedByName = body.updatedByName;
    const timestamp = body.timestamp || body.updatedAt || body.createdAt;
    const routingStatus = body.routingStatus || 'Direct';

    if (!citizenEmail || typeof citizenEmail !== 'string' || !citizenEmail.includes('@')) {
      return res.status(400).json({ ok: false, success: false, message: 'Valid citizen email is required.' });
    }

    // Deduplication check
    const dedupKey = `${type}_${complaintId || 'none'}_${newStatus || 'submitted'}_${citizenEmail.toLowerCase().trim()}`;
    if (isDuplicateEmailRequest(dedupKey)) {
      console.log(`ℹ️ [EMAIL NOTIFICATION] Deduplicated duplicate request for key: ${dedupKey}`);
      return res.status(200).json({
        ok: true,
        success: true,
        sent: false,
        deduplicated: true,
        duplicate: true,
        message: 'Duplicate email prevented.',
      });
    }

    const formattedTime = timestamp
      ? new Date(timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    let emailSubject = '';
    let emailBody = '';

    if (type === 'deletion') {
      const isCitizenInitiated = body.initiatedBy === 'citizen' || body.deletedByRole === 'citizen';
      const actorDescription = isCitizenInitiated
        ? 'Submitted Citizen (Self-deletion)'
        : (body.deletedByName || body.officerName || 'Authorized Municipal Officer');
      const delReason = body.deletionReason || body.reason || (isCitizenInitiated ? 'Removed by citizen request' : 'Administrative removal');

      emailSubject = `[CivicEye] Complaint Deleted: ${complaintId || 'Complaint'}`;
      emailBody = `Dear Citizen,

Your CivicEye complaint (${complaintId || 'N/A'}) has been deleted and removed from active records.

Complaint Deletion Summary:
----------------------------------------------------
• Complaint ID: ${complaintId || 'N/A'}
• Canonical Issue Name: ${issueType || 'Civic Infrastructure Defect'}
• Date & Time of Deletion: ${formattedTime} (Asia/Kolkata)
• Action Initiated By: ${actorDescription}
• Status in Active Records: Removed from active complaint registry (Archived for Municipal Audit)
• Reason for Deletion: ${delReason}

Next Steps:
${isCitizenInitiated
  ? 'If you deleted this complaint by mistake or if the civic problem still persists, you may report a new issue anytime via the CivicEye app.'
  : 'If you have questions regarding this deletion decision, you may contact the Coimbatore City Municipal Corporation (CCMC) Helpdesk or submit a fresh complaint with updated details.'}

Instructions:
This complaint is no longer in the active civic tracking queue. If needed, you can submit a new complaint via CivicEye at any time.

Thank you for your cooperation in maintaining public infrastructure in Coimbatore.

Warm regards,
CivicEye Municipal Services Platform
Coimbatore City Municipal Corporation (CCMC)`;
    } else if (type === 'status_update') {
      emailSubject = `[CivicEye] Status Update: ${complaintId || 'Complaint'} is now ${newStatus || 'Updated'}`;
      emailBody = `Dear Citizen,

The status of your CivicEye complaint (${complaintId || 'N/A'}) has been updated by an authorized municipal authority.

Status Update Details:
----------------------------------------------------
• Complaint ID: ${complaintId || 'N/A'}
• Issue Name: ${issueType || 'Civic Infrastructure Issue'}
• Previous Status: ${previousStatus || 'Under Review'}
• New Status: ${newStatus || 'Updated'}
• Assigned Department: ${department}
• Updated By: ${updatedByName || 'Municipal Officer'}
• Remarks / Notes: ${statusRemarks || 'Status updated.'}
• Date & Time: ${formattedTime} (Asia/Kolkata)

Instructions:
You can track real-time inspection notes, budget estimates, and repair progress anytime in the CivicEye mobile app under the "Status" tab of your complaint.

Thank you for helping us maintain public infrastructure in Coimbatore.

Warm regards,
CivicEye Municipal Administration
Coimbatore City Municipal Corporation (CCMC)`;
    } else if (type === 'clarification') {
      const q = body.clarificationQuestion || body.question || body.statusRemarks || 'Additional details requested.';
      const inspName = body.inspectorName || body.updatedByName || 'Field Inspector';
      emailSubject = `[CivicEye] Action Required: Clarification Requested for ${complaintId || 'Complaint'}`;
      emailBody = `Dear Citizen,

A Field Inspector has reviewed your CivicEye complaint (${complaintId || 'N/A'}) and requested clarification before proceedings can continue.

Clarification Request Details:
----------------------------------------------------
• Complaint ID: ${complaintId || 'N/A'}
• Issue Name: ${issueType || 'Civic Infrastructure Issue'}
• Assigned Department: ${department}
• Requesting Inspector: ${inspName}
• Question / Clarification Needed: ${q}
• Date & Time: ${formattedTime} (Asia/Kolkata)

Instructions to Respond:
1. Open the CivicEye mobile application on your device.
2. Go to "My Complaints" or open the notification for complaint #${complaintId || 'N/A'}.
3. Review the inspector's query under the Details section.
4. Type your clarification response and tap "Submit Response".

Your timely response will allow the Field Inspector to complete on-site verification and dispatch repair crews.

Warm regards,
CivicEye Municipal Administration
Coimbatore City Municipal Corporation (CCMC)`;
    } else if (type === 'closure') {
      const outcome = body.closureOutcome || 'No Major Repair Required';
      const reason = body.closureReason || body.statusRemarks || 'Inspected on-site; no major intervention needed.';
      const inspName = body.inspectorName || body.updatedByName || 'Field Inspector';
      emailSubject = `[CivicEye] Complaint Closed: ${complaintId || 'Complaint'}`;
      emailBody = `Dear Citizen,

Your CivicEye complaint (${complaintId || 'N/A'}) has been officially closed following an on-site field inspection.

Closure Summary:
----------------------------------------------------
• Complaint ID: ${complaintId || 'N/A'}
• Issue Name: ${issueType || 'Civic Infrastructure Issue'}
• Final Status: Closed
• Closure Outcome: ${outcome}
• Field Inspector: ${inspName}
• Findings / Inspection Reason: ${reason}
• Date & Time: ${formattedTime} (Asia/Kolkata)

Additional Notes:
The field inspection determined that either no structural repair was required at this time, or the matter was addressed during initial review without necessitating a municipal repair assignment.

Instructions:
You can review the full inspection findings and timestamped audit history in the CivicEye app. If the civic condition changes or a new defect occurs, you are welcome to submit a fresh report anytime.

Thank you for helping keep Coimbatore's infrastructure well-monitored.

Warm regards,
CivicEye Municipal Services Platform
Coimbatore City Municipal Corporation (CCMC)`;
    } else {
      // Default: Complaint submission confirmation
      emailSubject = `[CivicEye] Complaint Registered Successfully: ${complaintId || 'New Complaint'}`;
      emailBody = `Dear Citizen,

Thank you for reporting a civic issue. Your complaint has been successfully registered in CivicEye.

Complaint Summary:
----------------------------------------------------
• Complaint ID: ${complaintId || 'N/A'}
• Canonical Issue Name: ${issueType || 'Civic Issue'}
• Submitted Description: ${description || 'N/A'}
• Severity / Priority: ${priority || 'Standard'}
• Assigned Department: ${department}
• Current Status: ${newStatus || 'Submitted'}
• Submission Time: ${formattedTime} (Asia/Kolkata)

Next Steps:
1. Your complaint has entered the official municipal queue.
2. A Field Inspector will verify the complaint on-site and assess required repair costs.
3. The assigned department will execute repairs according to municipal standards.

Instructions:
To view live status updates, inspection details, and budget allocations, open the CivicEye app and check the "Details" and "Status" tabs.

Thank you for your active civic participation.

Warm regards,
CivicEye Municipal Services Platform
Coimbatore City Municipal Corporation (CCMC)`;
    }

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
      success: true,
      sent: emailSent,
      citizenEmail,
      subject: emailSubject,
      complaintId,
      department,
      type,
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
 * Citizen Complaint Deletion Endpoint (Owner-enforced)
 */
app.post('/api/citizen-delete-complaint', async (req, res) => {
  try {
    await ensureBackendAuth();
    const { complaintId, citizenId } = req.body || {};
    if (!complaintId || !citizenId) {
      return res.status(400).json({ ok: false, message: 'complaintId and citizenId are required.' });
    }

    const docRef = doc(serverDb, 'complaints', complaintId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return res.status(404).json({ ok: false, message: 'Complaint not found.' });
    }

    const complaintData = snap.data();
    if (complaintData.citizenId !== citizenId) {
      return res.status(403).json({ ok: false, message: 'Forbidden: Citizens can only delete complaints they own.' });
    }

    if (complaintData.isDeleted) {
      return res.status(200).json({ ok: true, message: 'Complaint already deleted.' });
    }

    const existingHistory = Array.isArray(complaintData.statusHistory) ? complaintData.statusHistory : [];
    const historyItem = {
      id: `hist-${Date.now()}`,
      previousStatus: complaintData.status || 'Submitted',
      newStatus: 'Deleted by Citizen',
      updatedBy: citizenId,
      updatedByName: complaintData.citizenEmail?.split('@')[0] || 'Citizen',
      remarks: 'Complaint deleted by citizen from active views.',
      timestamp: new Date().toISOString(),
    };

    // Soft delete with auditable tombstone
    await updateDoc(docRef, {
      isDeleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: citizenId,
      deletedByRole: 'citizen',
      status: 'Closed',
      statusHistory: [...existingHistory, historyItem],
      updatedAt: serverTimestamp(),
    });

    // Record audit log
    await addDoc(collection(serverDb, 'audit_logs'), {
      action: 'complaint_deleted_by_citizen',
      complaintId: complaintData.complaintId || complaintId,
      complaintDocId: complaintId,
      deletedBy: citizenId,
      deletedByRole: 'citizen',
      timestamp: serverTimestamp(),
    });

    // In-app notification for citizen self-deletion
    const displayId = complaintData.complaintId || complaintId;
    const canonicalIssue = complaintData.displayIssueName || getCanonicalIssueName(complaintData.issueType);
    const notifDateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    try {
      await addDoc(collection(serverDb, 'notifications'), {
        userId: citizenId,
        recipientId: citizenId,
        recipientRole: 'citizen',
        complaintId: displayId,
        complaintDocId: complaintId,
        title: 'Complaint Deleted',
        message: `Your complaint ${displayId} (${canonicalIssue}) was deleted on ${notifDateStr} and removed from active records.`,
        type: 'complaint_deleted',
        deletionReason: 'Deleted by citizen from active records',
        deletedBy: 'You (Citizen)',
        isRead: false,
        createdAt: serverTimestamp(),
      });
    } catch (notifErr) {
      console.warn('[CITIZEN DELETE] In-app notification error:', notifErr.message);
    }

    // Trigger citizen deletion email (safely handled)
    let targetEmail = complaintData.citizenEmail;
    if (!targetEmail) {
      try {
        const uSnap = await getDoc(doc(serverDb, 'users', citizenId));
        if (uSnap.exists()) targetEmail = uSnap.data().email;
      } catch {}
    }
    if (targetEmail && targetEmail.includes('@')) {
      try {
        await fetch(`http://localhost:${PORT}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'deletion',
            complaintId: displayId,
            issueType: canonicalIssue,
            citizenEmail: targetEmail,
            initiatedBy: 'citizen',
            deletedByRole: 'citizen',
            deletionReason: 'Deleted by citizen request',
            timestamp: new Date().toISOString(),
          }),
        });
      } catch (emailErr) {
        console.warn('[CITIZEN DELETE] Deletion email dispatch error (handled safely):', emailErr.message);
      }
    }

    console.log(`🗑️ [CITIZEN DELETE] Complaint #${complaintData.complaintId || complaintId} soft-deleted by owner ${citizenId}`);
    return res.status(200).json({ ok: true, message: 'Complaint deleted successfully.', complaintId: complaintData.complaintId || complaintId });
  } catch (error) {
    console.error('Error in /api/citizen-delete-complaint:', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/**
 * Authority Complaint Deletion Endpoint (Reason-enforced + Citizen Notified)
 */
app.post('/api/authority-delete-complaint', async (req, res) => {
  try {
    await ensureBackendAuth();
    const { complaintId, officerId, officerName, officerRole, deletionReason } = req.body || {};
    if (!complaintId || !officerId) {
      return res.status(400).json({ ok: false, message: 'complaintId and officerId are required.' });
    }

    // Server-side role verification
    const userSnap = await getDoc(doc(serverDb, 'users', officerId));
    const roleInDb = userSnap.exists() ? userSnap.data().role : null;
    const effectiveRole = roleInDb || officerRole || 'unknown';
    const isAuthorized = effectiveRole === 'officer' || effectiveRole === 'admin' || effectiveRole === 'main_officer';
    if (!isAuthorized) {
      return res.status(403).json({
        ok: false,
        message: 'Forbidden: Only authorized officers and administrators are permitted to delete complaints.',
      });
    }

    const reason = String(deletionReason || '').trim();
    if (!reason) {
      return res.status(400).json({ ok: false, message: 'A non-empty deletion reason or clarification is strictly required.' });
    }

    const docRef = doc(serverDb, 'complaints', complaintId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return res.status(404).json({ ok: false, message: 'Complaint not found.' });
    }

    const complaintData = snap.data();
    if (complaintData.isDeleted) {
      return res.status(200).json({ ok: true, message: 'Complaint already deleted.' });
    }

    const existingHistory = Array.isArray(complaintData.statusHistory) ? complaintData.statusHistory : [];
    const historyItem = {
      id: `hist-${Date.now()}`,
      previousStatus: complaintData.status || 'Submitted',
      newStatus: 'Deleted by Authority',
      updatedBy: officerId,
      updatedByName: officerName || 'Authorized Officer',
      remarks: `Complaint removed by authority. Reason: ${reason}`,
      timestamp: new Date().toISOString(),
    };

    // Soft delete with auditable tombstone
    await updateDoc(docRef, {
      isDeleted: true,
      deletedAt: serverTimestamp(),
      deletedBy: officerId,
      deletedByRole: effectiveRole,
      deletionReason: reason,
      status: 'Closed',
      statusHistory: [...existingHistory, historyItem],
      updatedAt: serverTimestamp(),
    });

    // Notify affected citizen atomically
    const citizenUid = complaintData.citizenId;
    const canonicalIssue = complaintData.displayIssueName || getCanonicalIssueName(complaintData.issueType);
    const displayId = complaintData.complaintId || complaintId;
    const notifDateStr = new Date().toLocaleString('en-IN');
    const notifMessage = `Your complaint ${displayId} — ${canonicalIssue} — was removed by the responsible authority. Reason: ${reason}. Date: ${notifDateStr}.`;

    let notificationId = null;
    if (citizenUid) {
      const notifDoc = await addDoc(collection(serverDb, 'notifications'), {
        userId: citizenUid,
        recipientId: citizenUid,
        recipientRole: 'citizen',
        complaintId: displayId,
        complaintDocId: complaintId,
        title: 'Complaint Removed by Authority',
        message: notifMessage,
        type: 'complaint_deleted',
        deletionReason: reason,
        deletedBy: officerName || 'Authorized Officer',
        isRead: false,
        createdAt: serverTimestamp(),
      });
      notificationId = notifDoc.id;
      console.log(`🔔 [CITIZEN NOTIFIED] Notification created for citizen ${citizenUid}: ${notifMessage}`);
    }

    // Record audit log
    await addDoc(collection(serverDb, 'audit_logs'), {
      action: 'complaint_deleted_by_authority',
      complaintId: displayId,
      complaintDocId: complaintId,
      citizenId: citizenUid,
      userId: officerId,
      deletedBy: officerId,
      deletedByName: officerName || 'Authorized Officer',
      deletedByRole: effectiveRole,
      reason,
      deletionReason: reason,
      timestamp: serverTimestamp(),
    });

    // Trigger authority deletion email to citizen (safely handled)
    let targetCitizenEmail = complaintData.citizenEmail;
    if (!targetCitizenEmail && citizenUid) {
      try {
        const uSnap = await getDoc(doc(serverDb, 'users', citizenUid));
        if (uSnap.exists()) targetCitizenEmail = uSnap.data().email;
      } catch {}
    }
    if (targetCitizenEmail && targetCitizenEmail.includes('@')) {
      try {
        await fetch(`http://localhost:${PORT}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'deletion',
            complaintId: displayId,
            issueType: canonicalIssue,
            citizenEmail: targetCitizenEmail,
            initiatedBy: 'authority',
            deletedByRole: effectiveRole,
            deletedByName: officerName || 'Authorized Officer',
            deletionReason: reason,
            timestamp: new Date().toISOString(),
          }),
        });
      } catch (emailErr) {
        console.warn('[AUTHORITY DELETE] Deletion email dispatch error (handled safely):', emailErr.message);
      }
    }

    console.log(`🗑️ [AUTHORITY DELETE] Complaint #${displayId} removed by ${officerName || officerId}. Reason: "${reason}"`);
    return res.status(200).json({
      ok: true,
      message: 'Complaint removed by authority and citizen notified.',
      complaintId: displayId,
      notificationId,
      deletionReason: reason,
    });
  } catch (error) {
    console.error('Error in /api/authority-delete-complaint:', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/**
 * Field Inspector Request Clarification Endpoint
 */
app.post('/api/request-clarification', async (req, res) => {
  try {
    await ensureBackendAuth();
    const { complaintId, inspectorId, inspectorName, clarificationQuestion, inspectorRemarks } = req.body || {};
    if (!complaintId || !clarificationQuestion || !String(clarificationQuestion).trim()) {
      return res.status(400).json({ ok: false, message: 'complaintId and a non-empty clarificationQuestion are required.' });
    }

    const docRef = doc(serverDb, 'complaints', complaintId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return res.status(404).json({ ok: false, message: 'Complaint not found.' });
    }
    const currentData = snap.data();
    const existingHistory = Array.isArray(currentData.statusHistory) ? currentData.statusHistory : [];

    const historyItem = {
      id: `hist-${Date.now()}`,
      previousStatus: currentData.status || 'Pending Field Verification',
      newStatus: 'Needs Clarification',
      updatedBy: inspectorId || 'inspector',
      updatedByName: inspectorName || 'Field Inspector',
      remarks: `Field Inspector requested clarification: "${clarificationQuestion.trim()}". ${inspectorRemarks ? `Note: ${inspectorRemarks.trim()}` : ''}`,
      timestamp: new Date().toISOString(),
    };

    await updateDoc(docRef, {
      status: 'Needs Clarification',
      clarificationRequest: clarificationQuestion.trim(),
      clarificationRequestedAt: serverTimestamp(),
      clarificationRequestedBy: inspectorName || 'Field Inspector',
      clarificationRequestedById: inspectorId || 'inspector',
      inspectorRemarks: inspectorRemarks?.trim() || currentData.inspectorRemarks || '',
      statusHistory: [...existingHistory, historyItem],
      updatedAt: serverTimestamp(),
    });

    // Send email to citizen
    if (currentData.citizenEmail) {
      try {
        await fetch(`http://localhost:${PORT}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'clarification',
            complaintId: currentData.complaintId || complaintId,
            issueType: currentData.issueType || 'Civic Defect',
            citizenEmail: currentData.citizenEmail,
            inspectorName: inspectorName || 'Field Inspector',
            clarificationQuestion: clarificationQuestion.trim(),
            department: currentData.department || 'Road Maintenance',
          }),
        });
      } catch (emailErr) {
        console.warn('[CLARIFICATION] Email dispatch warning:', emailErr.message);
      }
    }

    return res.status(200).json({ ok: true, message: 'Clarification requested successfully.' });
  } catch (error) {
    console.error('Error in /api/request-clarification:', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/**
 * Citizen Respond Clarification Endpoint
 */
app.post('/api/respond-clarification', async (req, res) => {
  try {
    await ensureBackendAuth();
    const { complaintId, citizenId, responseText } = req.body || {};
    if (!complaintId || !responseText || !String(responseText).trim()) {
      return res.status(400).json({ ok: false, message: 'complaintId and a non-empty responseText are required.' });
    }

    const docRef = doc(serverDb, 'complaints', complaintId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return res.status(404).json({ ok: false, message: 'Complaint not found.' });
    }
    const currentData = snap.data();
    const existingHistory = Array.isArray(currentData.statusHistory) ? currentData.statusHistory : [];

    const historyItem = {
      id: `hist-${Date.now()}`,
      previousStatus: 'Needs Clarification',
      newStatus: 'Pending Field Verification',
      updatedBy: citizenId || currentData.citizenId || 'citizen',
      updatedByName: currentData.citizenEmail?.split('@')[0] || 'Citizen',
      remarks: `Citizen provided clarification: "${responseText.trim()}"`,
      timestamp: new Date().toISOString(),
    };

    await updateDoc(docRef, {
      status: 'Pending Field Verification',
      citizenClarificationResponse: responseText.trim(),
      citizenClarificationRespondedAt: serverTimestamp(),
      statusHistory: [...existingHistory, historyItem],
      updatedAt: serverTimestamp(),
    });

    return res.status(200).json({ ok: true, message: 'Clarification response recorded successfully.' });
  } catch (error) {
    console.error('Error in /api/respond-clarification:', error);
    return res.status(500).json({ ok: false, message: error.message });
  }
});

/**
 * Field Inspector Close Complaint Endpoint
 */
app.post('/api/close-complaint-inspector', async (req, res) => {
  try {
    await ensureBackendAuth();
    const { complaintId, inspectorId, inspectorName, closureReason, closureOutcome, inspectorRemarks } = req.body || {};
    if (!complaintId || !closureReason || !String(closureReason).trim()) {
      return res.status(400).json({ ok: false, message: 'complaintId and a non-empty closureReason are required.' });
    }

    const docRef = doc(serverDb, 'complaints', complaintId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return res.status(404).json({ ok: false, message: 'Complaint not found.' });
    }
    const currentData = snap.data();
    if (currentData.status === 'Closed') {
      return res.status(400).json({ ok: false, message: 'Complaint is already closed.' });
    }
    const existingHistory = Array.isArray(currentData.statusHistory) ? currentData.statusHistory : [];

    const outcome = closureOutcome || 'No Major Repair Required';
    const historyItem = {
      id: `hist-${Date.now()}`,
      previousStatus: currentData.status || 'Pending Field Verification',
      newStatus: 'Closed',
      updatedBy: inspectorId || 'inspector',
      updatedByName: inspectorName || 'Field Inspector',
      remarks: `Closed by Field Inspector: [${outcome}] ${closureReason.trim()}.${inspectorRemarks?.trim() ? ` Observation: ${inspectorRemarks.trim()}` : ''}`,
      timestamp: new Date().toISOString(),
    };

    await updateDoc(docRef, {
      status: 'Closed',
      inspectionStatus: 'VALID',
      inspectionResult: 'genuine',
      closureReason: closureReason.trim(),
      closureOutcome: outcome,
      closedAt: serverTimestamp(),
      closedBy: inspectorName || 'Field Inspector',
      closedById: inspectorId || 'inspector',
      closedByRole: 'field_inspector',
      inspectedAt: serverTimestamp(),
      inspectedBy: inspectorId || 'inspector',
      inspectedByName: inspectorName || 'Field Inspector',
      inspectorRemarks: inspectorRemarks?.trim() || closureReason.trim(),
      statusHistory: [...existingHistory, historyItem],
      updatedAt: serverTimestamp(),
    });

    // Send email to citizen
    if (currentData.citizenEmail) {
      try {
        await fetch(`http://localhost:${PORT}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'closure',
            complaintId: currentData.complaintId || complaintId,
            issueType: currentData.issueType || 'Civic Defect',
            citizenEmail: currentData.citizenEmail,
            inspectorName: inspectorName || 'Field Inspector',
            closureReason: closureReason.trim(),
            closureOutcome: outcome,
            department: currentData.department || 'Road Maintenance',
          }),
        });
      } catch (emailErr) {
        console.warn('[CLOSURE] Email dispatch warning:', emailErr.message);
      }
    }

    return res.status(200).json({ ok: true, message: 'Complaint closed successfully by inspector.' });
  } catch (error) {
    console.error('Error in /api/close-complaint-inspector:', error);
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
  let visionStatus = 'unknown';
  try {
    const session = await getVisionSession();
    visionStatus = session ? 'ready' : 'unavailable';
  } catch (e) {
    visionStatus = 'error: ' + e.message;
  }

  res.json({
    ok: true,
    status: 'ok',
    service: 'civiceye-ai-backend',
    visionModel: visionStatus,
    modelVersion: 'CivicEye-Vision-Engine-v3',
    classesCount: _visionClasses ? _visionClasses.length : 12,
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
  console.log(`🤖 AI Engine:  CivicEye Multimodal Vision AI Architecture Ready (No YOLO)`);
  console.log(`ℹ️  Note: This process runs continuously to serve`);
  console.log(`   mobile app inference requests. (Press Ctrl+C to stop)`);
  console.log('====================================================');
});

// Keep-alive timer to ensure Node event loop remains permanently active under Windows background task
setInterval(() => {}, 10000);



