// Centralized ONNX detection configuration.
// Change thresholds here — nowhere else in the codebase.

// Minimum confidence to accept a detection (configurable threshold)
export const DETECTION_THRESHOLD = 0.25; 

// IoU overlap threshold for Non-Maximum Suppression (NMS)
export const IOU_THRESHOLD = 0.45;

// Road presence validation thresholds
export const ROAD_VALIDATION_THRESHOLD = 0.45;  // minimum score to consider image a road scene
export const ROAD_SAMPLE_SIZE = 64;              // image is downsampled to this for fast heuristic analysis

export type DetectedIssueType =
  | 'alligator cracking'
  | 'cracking'
  | 'pothole'
  | 'manhole defect'
  | 'waterlogging'
  | 'road divider damage'
  | 'damaged traffic sign'
  | 'street light fault'
  | 'debris / road blockage'
  | 'damaged footpath'
  | 'missing signage'
  | 'no_major_issue';

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

// YOLO model input dimensions (must match training config)
export const MODEL_INPUT_WIDTH = 640;
export const MODEL_INPUT_HEIGHT = 640;

export function calculatePriority(
  issueType: DetectedIssueType | string,
  confidence: number,
  boundingBox?: { width: number; height: number },
  detectionCount = 1
): Priority {
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

  // Road Divider / Median Damage: Major vehicular collision hazard
  if (issueType === 'road divider damage') {
    if (confidence >= 0.40 || area >= 0.06 || detectionCount > 1) return 'HIGH';
    return 'MEDIUM';
  }

  // Street Light Fault: Night vision & accident risk
  if (issueType === 'street light fault') {
    if (confidence >= 0.45) return 'HIGH';
    return 'MEDIUM';
  }

  // Manhole Defect: Severe pedestrian / two-wheeler life hazard
  if (issueType === 'manhole defect') {
    return 'HIGH';
  }

  // Waterlogging / Road Flooding: Hydroplaning & road base erosion
  if (issueType === 'waterlogging') {
    if (confidence >= 0.45 || area >= 0.10) return 'HIGH';
    return 'MEDIUM';
  }

  // Debris / Road Blockage: Sudden obstacle on carriageway
  if (issueType === 'debris / road blockage') {
    if (confidence >= 0.50 || area >= 0.08) return 'HIGH';
    return 'MEDIUM';
  }

  // Damaged Traffic Sign / Missing Signage
  if (issueType === 'damaged traffic sign' || issueType === 'missing signage') {
    if (confidence >= 0.50) return 'MEDIUM';
    return 'LOW';
  }

  // Damaged Footpath: Pedestrian trip hazard
  if (issueType === 'damaged footpath') {
    if (confidence >= 0.50 || area >= 0.10) return 'MEDIUM';
    return 'LOW';
  }

  return 'LOW';
}

// Map ONNX model class IDs to issue type strings (10-Class Target Taxonomy)
export const CLASS_ID_MAP: Record<number, DetectedIssueType> = {
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
};

// Department routing for all detected road & infrastructure issue types
export const ISSUE_DEPARTMENT: Record<DetectedIssueType, { name: string; code: string; secondary?: string }> = {
  'pothole': {
    name: 'Road Maintenance Department',
    code: 'ROAD',
    secondary: 'CCMC Road Maintenance Wing',
  },
  'alligator cracking': {
    name: 'Road Maintenance Department',
    code: 'ROAD',
    secondary: 'State Highways (C&M) Division',
  },
  'cracking': {
    name: 'Road Maintenance Department',
    code: 'ROAD',
    secondary: 'Zonal Engineering Wing',
  },
  'road divider damage': {
    name: 'Traffic / Road Safety Department',
    code: 'SAFETY',
    secondary: 'Coimbatore City Traffic Police',
  },
  'street light fault': {
    name: 'Street Lighting Department',
    code: 'LIGHTING',
    secondary: 'TANGEDCO & CCMC Street Lighting Wing',
  },
  'manhole defect': {
    name: 'Sewerage',
    code: 'SEWER',
    secondary: 'Underground Drainage (UGD) Division',
  },
  'waterlogging': {
    name: 'Stormwater / Drainage',
    code: 'DRAIN',
    secondary: 'Stormwater Drainage & Flood Control',
  },
  'debris / road blockage': {
    name: 'Solid Waste Management',
    code: 'SWM',
    secondary: 'Health & Sanitation Wing',
  },
  'damaged traffic sign': {
    name: 'Traffic / Road Safety Department',
    code: 'SAFETY',
    secondary: 'Highways Safety Cell',
  },
  'damaged footpath': {
    name: 'Public Works Department',
    code: 'PWD',
    secondary: 'Pedestrian Infrastructure Wing',
  },
  'missing signage': {
    name: 'Traffic / Road Safety Department',
    code: 'SAFETY',
    secondary: 'Highways Safety Cell',
  },
  'no_major_issue': {
    name: 'Road Maintenance Department',
    code: 'ROAD',
  },
};

export interface VisibleIssueMetadata {
  id: DetectedIssueType;
  title: string;
  category: string;
  department: string;
  departmentCode: string;
  defaultPriority: Priority;
  description: string;
  detectionFeatures: string[];
}

export const VISIBLE_ISSUES_METADATA: VisibleIssueMetadata[] = [
  {
    id: 'pothole',
    title: 'Pothole',
    category: 'Pavement Surface Failure',
    department: 'Road Maintenance Department',
    departmentCode: 'ROAD',
    defaultPriority: 'HIGH',
    description: 'Depression or cavity in asphalt surface exposing sub-base layers.',
    detectionFeatures: ['Dark concave depression', 'Irregular sharp asphalt rim', 'Shadow depth variation'],
  },
  {
    id: 'alligator cracking',
    title: 'Alligator Cracking',
    category: 'Structural Base Fatigue',
    department: 'Road Maintenance Department',
    departmentCode: 'ROAD',
    defaultPriority: 'HIGH',
    description: 'Interconnected hexagonal crack pattern resembling reptile skin caused by base failure.',
    detectionFeatures: ['Multi-directional interconnected grid', 'Polygonal asphalt blocks', 'Subgrade saturation marks'],
  },
  {
    id: 'cracking',
    title: 'Linear & Transverse Cracks',
    category: 'Pavement Surface Defect',
    department: 'Road Maintenance Department',
    departmentCode: 'ROAD',
    defaultPriority: 'MEDIUM',
    description: 'Longitudinal or transverse fissures along thermal joints and wheel paths.',
    detectionFeatures: ['Continuous narrow fissures', 'Edge raveling', 'Centerline seam degradation'],
  },
  {
    id: 'manhole defect',
    title: 'Damaged / Open Manhole Chamber',
    category: 'Sub-surface Utility Hazard',
    department: 'Sewerage',
    departmentCode: 'SEWER',
    defaultPriority: 'HIGH',
    description: 'Missing, broken, or sunken drainage/sewer manhole lid directly in travel lane.',
    detectionFeatures: ['Circular/square frame gap', 'Cracked iron lid', 'Deep hazardous utility void'],
  },
  {
    id: 'waterlogging',
    title: 'Waterlogging & Road Flooding',
    category: 'Drainage & Hydrology',
    department: 'Stormwater / Drainage',
    departmentCode: 'DRAIN',
    defaultPriority: 'HIGH',
    description: 'Stagnant rainwater pool obstructing vehicular lanes due to choked catchpits.',
    detectionFeatures: ['Surface water reflections', 'Submerged road markings', 'Silt accumulation'],
  },
  {
    id: 'road divider damage',
    title: 'Damaged Road Divider / Median',
    category: 'Traffic & Roadway Barrier',
    department: 'Traffic / Road Safety Department',
    departmentCode: 'SAFETY',
    defaultPriority: 'HIGH',
    description: 'Displaced concrete median blocks, bent crash barriers, or missing divider reflectors.',
    detectionFeatures: ['Fractured concrete kerbs', 'Misaligned median blocks', 'Missing warning reflectors'],
  },
  {
    id: 'damaged traffic sign',
    title: 'Damaged Traffic Sign / Bare Post',
    category: 'Traffic Safety & Guidance',
    department: 'Traffic / Road Safety Department',
    departmentCode: 'SAFETY',
    defaultPriority: 'MEDIUM',
    description: 'Bent or vandalized caution/speed limit signs, obscured placards, or bare signposts.',
    detectionFeatures: ['Bent signage pole', 'Faded warning boards', 'Damaged optical signal lens'],
  },
  {
    id: 'street light fault',
    title: 'Street Light Fault / Damaged Pole',
    category: 'Electrical & Night Road Safety',
    department: 'Street Lighting Department',
    departmentCode: 'LIGHTING',
    defaultPriority: 'HIGH',
    description: 'Damaged streetlight pole, dangling electrical cables, or non-functioning luminaire.',
    detectionFeatures: ['Bent lamp post', 'Exposed junction box', 'Extinguished overhead fixture'],
  },
  {
    id: 'debris / road blockage',
    title: 'Debris & Road Obstruction',
    category: 'Sanitation & Obstacle Clearance',
    department: 'Solid Waste Management Department',
    departmentCode: 'SWM',
    defaultPriority: 'MEDIUM',
    description: 'Fallen tree limbs, construction gravel dumps, or abandoned debris blocking traffic.',
    detectionFeatures: ['Unorganized rubble pile', 'Fallen vegetation', 'Illegal aggregate dumps'],
  },
  {
    id: 'damaged footpath',
    title: 'Damaged Footpath / Walkway',
    category: 'Pedestrian Infrastructure',
    department: 'Public Works Department',
    departmentCode: 'PWD',
    defaultPriority: 'MEDIUM',
    description: 'Broken concrete pavers, missing sidewalk slabs, or uneven pedestrian corridor.',
    detectionFeatures: ['Fractured paver blocks', 'Exposed sub-base rubble', 'Uneven walking surface'],
  },
  {
    id: 'missing signage',
    title: 'Missing Traffic Sign / Signal Fault',
    category: 'Traffic Safety & Guidance',
    department: 'Traffic / Road Safety Department',
    departmentCode: 'SAFETY',
    defaultPriority: 'MEDIUM',
    description: 'Bent or missing speed limit, detour, or caution signs and non-operational traffic lights.',
    detectionFeatures: ['Bent signage pole', 'Faded warning boards', 'Damaged optical signal lens'],
  },
];



