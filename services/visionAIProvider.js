/**
 * CivicEye Modular Vision AI Provider Architecture
 * 
 * Supports:
 * 1. Google Gemini Vision (gemini-1.5-flash / gemini-2.0-flash / gemini-1.5-pro) when GEMINI_API_KEY is configured
 * 2. OpenAI Vision (gpt-4o-mini / gpt-4o) when OPENAI_API_KEY is configured
 * 3. Native Autonomous Vision Pipeline (CivicEye-Vision-Engine-v3):
 *    - MobileNetV2 Scene Classifier (distinguishes flowers, animals, indoor objects from roads)
 *    - Laplacian variance & pixel analysis (detects blurry, dark, overexposed images)
 *    - Multi-scale surface distress & defect feature analyzer (accurately identifies alligator cracking, potholes, etc.)
 * 
 * Strict safety rules:
 * - Completely free of obsolete YOLO models, weights, or anchors.
 * - Never fake or manufacture confidence scores.
 * - Distinguish raw score, calibrated probability, and qualitative assessment.
 * - Return bounding boxes ONLY if a genuine detector provides them.
 * - Return structured prediction states:
 *   VALID_ISSUE | NO_MAJOR_ISSUE | INVALID_IMAGE | UNCLEAR_IMAGE | UNSUPPORTED_ISSUE | INFERENCE_FAILED | PENDING_REVIEW
 */

const fs = require('fs');
const path = require('path');

const SUPPORTED_CANONICAL_DEFECTS = [
  'Pothole',
  'Alligator Cracking',
  'Road Cracking',
  'Road Divider Damage',
  'Damaged Traffic Sign',
  'Streetlight Fault',
  'Waterlogging',
  'Drainage Blockage',
  'Damaged Manhole',
  'Damaged Footpath',
  'Road Debris / Obstruction',
  'No Major Issue',
];

/**
 * Normalizes any defect string to canonical CivicEye display names.
 * Robust to casing, underscores, hyphens, and whitespace.
 */
function toCanonicalIssueName(rawIssue) {
  if (!rawIssue) return 'Road Surface Defect';
  const clean = String(rawIssue).trim().replace(/[_\-]+/g, ' ');
  const norm = clean.toLowerCase();

  if (norm.includes('alligator')) return 'Alligator Cracking';
  if (norm.includes('pothole') || norm === 'pothole') return 'Pothole';
  if (norm.includes('cracking') || norm.includes('crack')) return 'Road Cracking';
  if (norm.includes('divider') || norm.includes('median')) return 'Road Divider Damage';
  if (norm.includes('traffic sign') || norm.includes('missing signage') || norm.includes('sign board') || norm.includes('sign')) {
    return 'Damaged Traffic Sign';
  }
  if (norm.includes('street light') || norm.includes('streetlight') || norm.includes('lamp')) return 'Streetlight Fault';
  if (norm.includes('waterlogging') || norm.includes('water logging') || norm.includes('flood')) return 'Waterlogging';
  if (norm.includes('drain') || norm.includes('gutter')) return 'Drainage Blockage';
  if (norm.includes('manhole')) return 'Damaged Manhole';
  if (norm.includes('footpath') || norm.includes('walkway') || norm.includes('sidewalk')) return 'Damaged Footpath';
  if (norm.includes('debris') || norm.includes('blockage') || norm.includes('garbage') || norm.includes('trash') || norm.includes('obstruction')) {
    return 'Road Debris / Obstruction';
  }
  if (norm === 'no major issue' || norm === 'no issue' || norm.includes('clean road') || norm.includes('normal road')) {
    return 'No Major Issue';
  }

  // Capitalize words
  return clean
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Call Google Gemini Vision API (gemini-1.5-flash)
 */
async function callGeminiVision({ imageBase64, mimeType = 'image/jpeg', description = '', apiKey }) {
  const model = process.env.GEMINI_VISION_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `You are a municipal civil engineer and computer vision specialist analyzing an uploaded photo for the CivicEye municipal reporting platform.
Examine the image carefully and answer the following questions strictly in JSON format without markdown wrapping:

1. Does the image visibly show road pavement or public civic infrastructure (e.g. roads, walkways, dividers, streetlights, storm drains, manholes)?
   - If the image shows flowers, plants, household items, animals, food, or unrelated scenes, isRoadOrCivicInfrastructure MUST BE FALSE.
2. Is the image clear and well-lit, or is it too blurry, dark, or unreadable to make an assessment?
3. Is an infrastructure defect visibly present in the image?
4. Identify the canonical defect if present from:
   ["Pothole", "Alligator Cracking", "Road Cracking", "Road Divider Damage", "Damaged Traffic Sign", "Streetlight Fault", "Waterlogging", "Drainage Blockage", "Damaged Manhole", "Damaged Footpath", "Road Debris / Obstruction", "No Major Issue"]
   Notice: If the pavement exhibits interconnected polygonal fatigue cracks resembling crocodile skin, classify it as "Alligator Cracking".
5. Compare the visual findings with the citizen's description: "${description.replace(/"/g, '\\"')}".
   Does the image evidence agree or disagree with what is described?

Return strict JSON with this exact schema:
{
  "isRoadOrCivicInfrastructure": boolean,
  "isClearImage": boolean,
  "predictionState": "VALID_ISSUE" | "NO_MAJOR_ISSUE" | "INVALID_IMAGE" | "UNCLEAR_IMAGE" | "UNSUPPORTED_ISSUE",
  "detectedDefect": string or null,
  "displayIssueName": string,
  "visibleCharacteristics": string,
  "severityEvidence": "LOW" | "MEDIUM" | "HIGH" | "NONE",
  "severityReason": string,
  "agreementWithDescription": "AGREED" | "DISAGREED" | "NOT_APPLICABLE",
  "qualitativeConfidence": number between 0 and 100
}`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      responseMimeType: 'application/json',
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Empty response from Gemini Vision');
    }

    const parsed = JSON.parse(text);
    const hasDefect = !!parsed.detectedDefect && parsed.detectedDefect !== 'No Major Issue';
    const canonicalName = parsed.detectedDefect ? toCanonicalIssueName(parsed.detectedDefect) : (parsed.isRoadOrCivicInfrastructure ? 'No Major Issue' : 'Invalid Issue Image');

    return {
      provider: 'gemini',
      model,
      rawOutput: parsed,
      isRoad: !!parsed.isRoadOrCivicInfrastructure,
      isClear: parsed.isClearImage !== false,
      predictionState: parsed.predictionState || (parsed.isRoadOrCivicInfrastructure ? (hasDefect ? 'VALID_ISSUE' : 'NO_MAJOR_ISSUE') : 'INVALID_IMAGE'),
      hasDamage: hasDefect,
      detectedDefect: hasDefect ? canonicalName : null,
      issueType: hasDefect ? canonicalName : 'no_major_issue',
      displayIssueName: canonicalName,
      visibleCharacteristics: parsed.visibleCharacteristics || '',
      severityEvidence: parsed.severityEvidence || 'NONE',
      priority: parsed.severityEvidence || 'NONE',
      severityReason: parsed.severityReason || '',
      priorityReason: parsed.severityReason || '',
      agreementWithDescription: parsed.agreementWithDescription || 'NOT_APPLICABLE',
      confidence: parsed.qualitativeConfidence || 0,
      confidenceType: 'qualitative_assessment',
      boundingBox: null, // Multimodal LLM does not provide verified object detector bounding boxes
      allDetections: [],
      primaryDetection: null,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Call OpenAI Vision API (gpt-4o-mini)
 */
async function callOpenAIVision({ imageBase64, mimeType = 'image/jpeg', description = '', apiKey }) {
  const model = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
  const url = 'https://api.openai.com/v1/chat/completions';

  const systemPrompt = `You are a municipal civil engineer analyzing road defect images for CivicEye. Return strict JSON.`;
  const userPrompt = `Analyze this image for civic/road infrastructure defects.
Citizen description: "${description.replace(/"/g, '\\"')}".
Is it a valid road/civic infrastructure image or unrelated (like flowers, pets, indoors)?
Identify defects from: ["Pothole", "Alligator Cracking", "Road Cracking", "Road Divider Damage", "Damaged Traffic Sign", "Streetlight Fault", "Waterlogging", "Drainage Blockage", "Damaged Manhole", "Damaged Footpath", "Road Debris / Obstruction", "No Major Issue"].
If the pavement exhibits interconnected polygonal fatigue cracks, classify as "Alligator Cracking".

Return JSON:
{
  "isRoadOrCivicInfrastructure": boolean,
  "isClearImage": boolean,
  "predictionState": "VALID_ISSUE" | "NO_MAJOR_ISSUE" | "INVALID_IMAGE" | "UNCLEAR_IMAGE" | "UNSUPPORTED_ISSUE",
  "detectedDefect": string or null,
  "displayIssueName": string,
  "visibleCharacteristics": string,
  "severityEvidence": "LOW" | "MEDIUM" | "HIGH" | "NONE",
  "severityReason": string,
  "agreementWithDescription": "AGREED" | "DISAGREED" | "NOT_APPLICABLE",
  "qualitativeConfidence": number
}`;

  const payload = {
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${imageBase64}`,
            },
          },
        ],
      },
    ],
    temperature: 0.1,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI API HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    const hasDefect = !!parsed.detectedDefect && parsed.detectedDefect !== 'No Major Issue';
    const canonicalName = parsed.detectedDefect ? toCanonicalIssueName(parsed.detectedDefect) : (parsed.isRoadOrCivicInfrastructure ? 'No Major Issue' : 'Invalid Issue Image');

    return {
      provider: 'openai',
      model,
      rawOutput: parsed,
      isRoad: !!parsed.isRoadOrCivicInfrastructure,
      isClear: parsed.isClearImage !== false,
      predictionState: parsed.predictionState || (parsed.isRoadOrCivicInfrastructure ? (hasDefect ? 'VALID_ISSUE' : 'NO_MAJOR_ISSUE') : 'INVALID_IMAGE'),
      hasDamage: hasDefect,
      detectedDefect: hasDefect ? canonicalName : null,
      issueType: hasDefect ? canonicalName : 'no_major_issue',
      displayIssueName: canonicalName,
      visibleCharacteristics: parsed.visibleCharacteristics || '',
      severityEvidence: parsed.severityEvidence || 'NONE',
      priority: parsed.severityEvidence || 'NONE',
      severityReason: parsed.severityReason || '',
      priorityReason: parsed.severityReason || '',
      agreementWithDescription: parsed.agreementWithDescription || 'NOT_APPLICABLE',
      confidence: parsed.qualitativeConfidence || 0,
      confidenceType: 'qualitative_assessment',
      boundingBox: null,
      allDetections: [],
      primaryDetection: null,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Unified Vision AI Router
 * 
 * Attempts configured cloud vision provider (Gemini or OpenAI).
 * If unconfigured, disabled, or fails, falls back gracefully to
 * CivicEye Vision Engine v3 (MobileNetV2 scene gatekeeper + Multi-Scale Surface Distress Analyzer).
 */
async function analyzeImageWithVisionAI({
  imageBuffer,
  decodedImage,
  description = '',
  mimeType = 'image/jpeg',
  localCVFallbackFn,
}) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openAIKey = process.env.OPENAI_API_KEY;
  const preferredProvider = (process.env.VISION_PROVIDER || 'gemini').toLowerCase().trim();

  const imageBase64 = imageBuffer ? imageBuffer.toString('base64') : '';

  // 1. Try Gemini Vision if preferred or configured
  if (preferredProvider === 'gemini' && geminiKey && imageBase64) {
    try {
      console.log(`[Vision AI] Calling Gemini Vision model: ${process.env.GEMINI_VISION_MODEL || 'gemini-1.5-flash'}...`);
      const result = await callGeminiVision({
        imageBase64,
        mimeType,
        description,
        apiKey: geminiKey,
      });
      console.log(`[Vision AI] Gemini Vision completed successfully: state=${result.predictionState}, defect=${result.detectedDefect}`);
      return result;
    } catch (err) {
      console.warn(`[Vision AI] Gemini Vision API call failed (${err.message}). Falling back to native computer vision engine.`);
    }
  }

  // 2. Try OpenAI Vision if configured
  if ((preferredProvider === 'openai' || (!geminiKey && openAIKey)) && openAIKey && imageBase64) {
    try {
      console.log(`[Vision AI] Calling OpenAI Vision model: ${process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini'}...`);
      const result = await callOpenAIVision({
        imageBase64,
        mimeType,
        description,
        apiKey: openAIKey,
      });
      console.log(`[Vision AI] OpenAI Vision completed successfully: state=${result.predictionState}, defect=${result.detectedDefect}`);
      return result;
    } catch (err) {
      console.warn(`[Vision AI] OpenAI Vision API call failed (${err.message}). Falling back to native computer vision engine.`);
    }
  }

  // 3. Fallback: Native Autonomous CivicEye Vision Engine v3 (12 Canonical Classes Deep Vision Classifier)
  console.log(`[Vision AI] Running CivicEye Vision Engine v3 (Deep Learning Classifier)...`);
  if (typeof localCVFallbackFn === 'function') {
    const localResult = await localCVFallbackFn(decodedImage, description);
    return {
      provider: 'local_cv',
      model: 'CivicEye-Vision-Engine-v3',
      ...localResult,
      confidenceType: localResult.confidenceType || 'model_calibrated_probability',
    };
  }

  throw new Error('No vision provider available and local CV fallback function was not provided.');
}

module.exports = {
  toCanonicalIssueName,
  analyzeImageWithVisionAI,
  SUPPORTED_CANONICAL_DEFECTS,
};
