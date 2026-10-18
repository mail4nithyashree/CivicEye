/**
 * Road Presence Validation Service

 *
 * Determines whether an image contains a road/road surface BEFORE running
 * the road-damage ONNX model.
 *
 * Approach:
 * - When server is accessible, uses the server-side road validation engine.
 * - In local/offline mode, analyzes colour saturation, luminance profiles,
 *   and texture variance on downsampled pixels with jpeg-js decoding.
 */

import { ROAD_SAMPLE_SIZE, ROAD_VALIDATION_THRESHOLD } from './detectionConfig';

export interface RoadValidationResult {
  isRoad: boolean;
  confidence: number; // 0–1
  message?: string;
}

import { getApiBaseUrl } from './apiConfig';


/** Convert RGB to HSL. Returns h∈[0,360), s∈[0,1], l∈[0,1]. */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
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

/** Clamp a value between min and max. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function analysePixels(rgba: Uint8Array, width: number, height: number): number {
  const startRow = Math.floor(height * 0.4);
  const totalPixels = width * (height - startRow);

  let lowSatCount = 0;   // pixels with low saturation (asphalt/concrete)
  let midLumCount = 0;   // medium luminance
  let skinToneCount = 0; // skin tone range (selfies/faces)
  let vividCount = 0;    // vivid non-road colors
  const rowLumMeans: number[] = [];

  let sharpEdgeCount = 0;

  for (let row = startRow; row < height - 1; row++) {
    let rowLumSum = 0;
    let rowPixels = 0;

    for (let col = 0; col < width - 1; col++) {
      const idx = (row * width + col) * 4;
      const idxRight = (row * width + (col + 1)) * 4;
      const idxDown = ((row + 1) * width + col) * 4;

      const r = rgba[idx], g = rgba[idx + 1], b = rgba[idx + 2];
      const [h, s, l] = rgbToHsl(r, g, b);

      if (s < 0.22) lowSatCount++;
      if (l >= 0.15 && l <= 0.80) midLumCount++;

      // Skin tones (selfies/faces)
      if ((h < 40 || h > 340) && s > 0.20 && s < 0.70 && l > 0.35 && l < 0.75) {
        skinToneCount++;
      }

      // Vivid colors (flowers, nature greenery, vivid objects)
      if (s > 0.50 && l > 0.20 && l < 0.85) {
        vividCount++;
      }

      // Sharp artificial edges (keyboards, screens, text, barcodes, indoor borders)
      const diffR = Math.abs(r - rgba[idxRight]) + Math.abs(r - rgba[idxDown]);
      const diffG = Math.abs(g - rgba[idxRight + 1]) + Math.abs(g - rgba[idxDown + 1]);
      const diffB = Math.abs(b - rgba[idxRight + 2]) + Math.abs(b - rgba[idxDown + 2]);
      if (diffR + diffG + diffB > 160) {
        sharpEdgeCount++;
      }

      rowLumSum += l;
      rowPixels++;
    }
    rowLumMeans.push(rowPixels > 0 ? rowLumSum / rowPixels : 0);
  }

  const lowSatRatio = lowSatCount / totalPixels;
  const midLumRatio = midLumCount / totalPixels;
  const skinRatio = skinToneCount / totalPixels;
  const vividRatio = vividCount / totalPixels;
  const sharpEdgeRatio = sharpEdgeCount / totalPixels;

  const mean = rowLumMeans.reduce((a, b) => a + b, 0) / (rowLumMeans.length || 1);
  const lumVariance = rowLumMeans.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (rowLumMeans.length || 1);

  const satScore = clamp(
    lowSatRatio < 0.45
      ? lowSatRatio / 0.45
      : 1 - Math.abs(lowSatRatio - 0.70) / 0.35,
    0, 1
  );
  const lumScore = clamp(midLumRatio / 0.65, 0, 1);
  const texScore = clamp(lumVariance / 0.012, 0, 1);

  const skinPenalty = clamp(skinRatio / 0.20, 0, 1);
  const vividPenalty = clamp(vividRatio / 0.25, 0, 1);
  const edgePenalty = clamp(sharpEdgeRatio / 0.18, 0, 1);

  const positiveScore = satScore * 0.40 + lumScore * 0.35 + texScore * 0.25;
  const penaltyScore = skinPenalty * 0.40 + vividPenalty * 0.40 + edgePenalty * 0.40;
  return clamp(positiveScore - penaltyScore * 0.70, 0, 1);
}


import { uploadImageMultipart } from './multipartUpload';

/**
 * Validate whether an image contains a road surface.
 */
export async function validateRoadImage(imageUri: string): Promise<RoadValidationResult> {
  // First try server-side road validation
  try {
    const apiUrl = `${getApiBaseUrl()}/api/validate-road`;
    const uploadRes = await uploadImageMultipart(apiUrl, imageUri, {
      fieldName: 'image',
      fileName: 'validate-road.jpg',
      mimeType: 'image/jpeg',
      timeoutMs: 10000,
    });

    if (uploadRes.ok && uploadRes.data) {
      const data = uploadRes.data;
      if (typeof data.isRoad === 'boolean') {
        return {
          isRoad: data.isRoad,
          confidence: data.confidence ?? (data.isRoad ? 0.8 : 0.2),
          message: data.message,
        };
      }
    }
  } catch {
    // Server unreachable or timed out — continue to local analysis
  }

  // Local fallback heuristic analysis
  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');

    const manipulated = await manipulateAsync(
      imageUri,
      [{ resize: { width: ROAD_SAMPLE_SIZE, height: ROAD_SAMPLE_SIZE } }],
      { base64: true, format: SaveFormat.JPEG }
    );

    const base64 = manipulated.base64!;
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    let rgba: Uint8Array;
    try {
      const jpegJs = require('jpeg-js');
      const decoded = jpegJs.decode(bytes, { useTArray: true });
      rgba = decoded.data as Uint8Array;
    } catch {
      return { isRoad: true, confidence: 0.6 };
    }

    const roadScore = analysePixels(rgba, ROAD_SAMPLE_SIZE, ROAD_SAMPLE_SIZE);
    const isRoad = roadScore >= ROAD_VALIDATION_THRESHOLD;

    return {
      isRoad,
      confidence: Math.round(roadScore * 100) / 100,
      message: isRoad
        ? 'Valid road image.'
        : 'The uploaded image does not appear to contain a road. Please upload a clear image of a road.',
    };
  } catch (err) {
    console.log('[roadValidation] Local validation error:', err);
    return { isRoad: true, confidence: 0.6 };
  }
}

